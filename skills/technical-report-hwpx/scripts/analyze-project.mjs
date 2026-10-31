import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { findRepo, fromRepo, sameFile, writeJson } from './repo.mjs';

const { values } = parseArgs({ options: { input: { type: 'string' }, output: { type: 'string' }, repo: { type: 'string' }, slots: { type: 'boolean' }, 'skip-pdf': { type: 'boolean' }, python: { type: 'string', default: 'python' }, help: { type: 'boolean' } } });
if (values.help) { console.log('analyze-project.mjs --input <folder|file.hwpx> --output <analysis.json> [--repo <app>] [--slots] [--skip-pdf] [--python <python>]'); process.exit(0); }
if (!values.input || !values.output) throw new Error('--input과 --output을 지정하세요.');
const input = path.resolve(values.input), output = path.resolve(values.output), repo = await findRepo(values.repo);
if (path.extname(output).toLowerCase() !== '.json') throw new Error('분석 결과는 .json 파일로 저장하세요.');
const { analyzeReferenceSource } = await fromRepo(repo, 'src/services/report/referenceAnalyzer.js');
const { analyzeReport } = await fromRepo(repo, 'src/services/report/sourceParser.js');
const { summarizeReferenceProfiles } = await fromRepo(repo, 'src/services/report/referenceLearning.js');
const { buildReferenceParts, classifyReferencePath } = await fromRepo(repo, 'src/services/report/referenceProjects.js');
const files = [], ignored = [];
async function visit(target, root) {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink()) { ignored.push({ path: path.relative(root, target), reason: 'symbolic-link' }); return; }
    if (stat.isDirectory()) {
        const children = await fs.readdir(target, { withFileTypes: true });
        for (const child of children.sort((a,b) => a.name.localeCompare(b.name, 'ko', { numeric: true }))) {
            if (['.git', 'node_modules', '$RECYCLE.BIN'].includes(child.name)) continue;
            await visit(path.join(target, child.name), root);
        }
    } else if (/\.(?:hwpx|pdf)$/i.test(target) && !/^(?:~\$|\._)/.test(path.basename(target))) {
        if (files.length >= 1000) throw new Error('한 번에 분석할 원본은 최대 1,000개입니다.');
        files.push({ absolute: target, relativePath: path.relative(root, target).replaceAll('\\', '/'), size: stat.size, format: path.extname(target).slice(1).toLowerCase() });
    }
}
const inputStat = await fs.stat(input), root = inputStat.isDirectory() ? input : path.dirname(input);
await visit(input, root);
if (!files.length) throw new Error('HWPX 또는 PDF 원본이 없습니다.');
for (const file of files) if (await sameFile(file.absolute, output)) throw new Error('분석 결과를 원본 파일 위에 저장할 수 없습니다.');
const hashFile = async file => { const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest('hex'); };
const records = [];
for (const [index, file] of files.entries()) {
    console.error(`[${index + 1}/${files.length}] ${file.relativePath}`);
    const { absolute, ...record } = file;
    record.filename = path.basename(absolute); Object.assign(record, classifyReferencePath(record.relativePath));
    record.id = createHash('sha256').update(record.relativePath).digest('hex').slice(0, 24); record.entryId = record.id;
    try {
        if (file.size > 160 * 1024 * 1024) throw new Error('160MB 분석 한도를 넘습니다.');
        record.sha256 = await hashFile(absolute);
        if (file.format === 'hwpx') {
            const bytes = new Uint8Array(await fs.readFile(absolute));
            record.profile = await analyzeReferenceSource(bytes, record.filename);
            if (values.slots) {
                const document = await analyzeReport(bytes, record.filename);
                record.editableSlots = document.paragraphs.flatMap(paragraph => paragraph.textSlots.filter(slot => slot.plain).map(slot => ({ slotId: slot.id, section: slot.section, paragraphId: paragraph.id, tableId: paragraph.tableId, charShapeId: slot.charShapeId, expectedText: slot.text })));
            }
        } else {
            const handle = await fs.open(absolute, 'r');
            try { const magic = Buffer.alloc(5); await handle.read(magic, 0, 5, 0); if (magic.toString() !== '%PDF-') throw new Error('PDF 서명이 올바르지 않습니다.'); } finally { await handle.close(); }
            if (values['skip-pdf']) { record.pdfInventory = { status: 'not-inspected' }; records.push(record); continue; }
            const script = fileURLToPath(new URL('./inspect-pdf.py', import.meta.url));
            const json = execFileSync(values.python, [script, '--input', absolute], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120000, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
            record.pdfInventory = JSON.parse(json);
        }
    } catch (error) { record.error = error.message.slice(0, 1500); }
    records.push(record);
}
const pairs = buildReferenceParts(records);
for (const record of records.filter(file => file.format === 'hwpx')) record.pdfEntryId = pairs.find(part => part.original?.id === record.id)?.pdf?.id || '';
const report = { schema: 'technical-report-hwpx/1', status: records.some(file => file.error) ? 'partial' : 'extracted', createdAt: new Date().toISOString(), projectName: path.basename(inputStat.isDirectory() ? input : root),
    files: records, ignored, summary: summarizeReferenceProfiles(records), verification: { pdfInventoryOnly: true, independentReconstruction: 'pending', editableCandidate: 'pending', visualComparison: 'pending' } };
await writeJson(output, report);
console.log(JSON.stringify({ output, status: report.status, hwpx: records.filter(file => file.format === 'hwpx').length, pdf: records.filter(file => file.format === 'pdf').length, paired: records.filter(file => file.pdfEntryId).length, pdfPages: records.reduce((sum,file) => sum + (file.pdfInventory?.pageCount || 0), 0), ...report.summary.totals, chapters: report.summary.chapters.map(chapter => ({ number: chapter.number, title: chapter.title, discipline: chapter.discipline })), errors: records.filter(file => file.error).map(file => ({ path: file.relativePath, error: file.error })) }, null, 2));
if (report.status === 'partial') process.exitCode = 2;

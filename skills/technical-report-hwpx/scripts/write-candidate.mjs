import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { findRepo, fromRepo, sameFile, writeJson } from './repo.mjs';

const { values } = parseArgs({ options: { source: { type: 'string' }, edits: { type: 'string' }, output: { type: 'string' }, review: { type: 'string' }, repo: { type: 'string' }, help: { type: 'boolean' } } });
if (values.help) { console.log('write-candidate.mjs --source <source.hwpx> --edits <plan.json> --output <candidate.hwpx> [--review <review.json>] [--repo <app>]'); process.exit(0); }
if (!values.source || !values.edits || !values.output) throw new Error('--source, --edits, --output을 지정하세요.');
if (path.extname(values.output).toLowerCase() !== '.hwpx') throw new Error('작성 후보는 .hwpx로 저장하세요.');
const reviewPath = values.review || `${values.output}.review.json`;
if (path.extname(reviewPath).toLowerCase() !== '.json') throw new Error('검토 기록은 .json 파일로 저장하세요.');
for (const destination of [values.output, reviewPath]) for (const original of [values.source, values.edits]) if (await sameFile(destination, original)) throw new Error('원본이나 교체 계획 위에 출력할 수 없습니다.');
if (await sameFile(values.output, reviewPath)) throw new Error('작성 후보와 검토 기록은 서로 다른 경로여야 합니다.');
const repo = await findRepo(values.repo), { analyzeReport } = await fromRepo(repo, 'src/services/report/sourceParser.js'), { replaceHwpxSlots } = await fromRepo(repo, 'src/services/report/hwpxPackage.js');
const stat = await fs.stat(values.source);
if (stat.size > 160 * 1024 * 1024) throw new Error('원본의 분석 한도를 넘습니다.');
const bytes = new Uint8Array(await fs.readFile(values.source)), plan = JSON.parse(await fs.readFile(values.edits, 'utf8'));
const document = await analyzeReport(bytes, path.basename(values.source));
if (document.format !== 'hwpx' || plan.sourceSha256 !== document.source.sha256) throw new Error('교체 계획과 HWPX 원본 버전이 다릅니다.');
if (!Array.isArray(plan.replacements) || !plan.replacements.length || plan.replacements.length > 10000) throw new Error('교체할 글자 구간을 1~10,000개 지정하세요.');
const slots = new Map(document.paragraphs.flatMap((paragraph, paragraphIndex) => paragraph.textSlots.map((slot, slotIndex) => [slot.id, { slot, paragraphIndex, slotIndex }])));
const replacements = plan.replacements.map(edit => {
    const binding = slots.get(edit.slotId), slot = binding?.slot;
    if (!slot?.plain || typeof edit.expectedText !== 'string' || typeof edit.value !== 'string' || edit.expectedText !== slot.text) throw new Error('원본과 정확히 일치하는 단순 글자 구간과 expectedText를 지정하세요.');
    return { slotId: slot.id, section: slot.section, expectedText: edit.expectedText, value: edit.value, paragraphIndex: binding.paragraphIndex, slotIndex: binding.slotIndex };
});
const output = await replaceHwpxSlots(bytes, plan.sourceSha256, replacements);
const readback = await analyzeReport(output.bytes, path.basename(values.output));
for (const replacement of replacements) if (readback.paragraphs[replacement.paragraphIndex]?.textSlots[replacement.slotIndex]?.text !== replacement.value.replaceAll('\r\n','\n').replaceAll('\r','\n')) throw new Error('작성 후 지정 위치의 새 글자를 다시 읽지 못했습니다. 출력하지 않았습니다.');
const review = { schema: 'technical-report-candidate/1', status: 'candidate-generated', generationMode: 'preserve-source-package', sourceSha256: document.source.sha256,
    candidateSha256: createHash('sha256').update(output.bytes).digest('hex'), changedSections: output.changedSections, replacedSlots: output.replacedSlots,
    source: path.resolve(values.source), candidate: path.resolve(values.output), layoutVerification: 'pending', independentPageReconstruction: 'not-performed',
    warnings: ['기존 패키지의 지정 글자 구간을 교체한 편집 가능한 후보입니다. 독립 조판기의 한 쪽 재현 결과가 아닙니다.', '교체하지 않은 과거 내용은 남아 있습니다. 새 보고서의 전체 내용으로 확정하지 마세요.', '한글에서 다시 조판·저장하고 내보낸 PDF로 줄바꿈·표 높이·홀짝·번호를 검토하세요.'] };
await fs.mkdir(path.dirname(path.resolve(values.output)), { recursive: true });
await fs.writeFile(values.output, output.bytes); await writeJson(reviewPath, review);
console.log(JSON.stringify({ output: path.resolve(values.output), review: path.resolve(reviewPath), status: review.status, replacedSlots: output.replacedSlots, layoutVerification: review.layoutVerification }));

import { loadMaterial } from './reportLibrary.js';
import { buildReferenceParts, listReferenceEntries, listReferenceProjects, referenceAnalysisSignature, saveReferenceAnalysis } from './referenceProjects.js';

const abortError = () => new DOMException('양식 분석을 중단했습니다.', 'AbortError');
function analyzeFile(bytes, filename, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(abortError()); return; }
        const worker = new Worker(new URL('./report.worker.js', import.meta.url), { type: 'module' });
        const finish = (error, result) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.terminate(); if (error) reject(error); else resolve(result); };
        const abort = () => finish(abortError());
        const timer = setTimeout(() => finish(new Error('문서 분석 시간이 초과되었습니다.')), 90000);
        signal?.addEventListener('abort', abort, { once: true });
        worker.onerror = () => finish(new Error('양식 분석 작업을 시작하지 못했습니다.'));
        worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : !data.referenceProfile ? new Error('양식 분석 결과가 없습니다.') : null, data.referenceProfile);
        worker.postMessage({ action: 'analyze-reference', bytes, filename }, [bytes]);
    });
}

export function summarizeReferenceProfiles(files) {
    const chapterMap = new Map(), totals = { files: 0, paragraphs: 0, tables: 0, cells: 0, pictures: 0 }, layouts = new Map(), typography = new Map();
    for (const file of files.filter(file => file.profile)) {
        const profile = file.profile; totals.files++;
        for (const key of ['paragraphs', 'tables', 'cells', 'pictures']) totals[key] += profile.counts[key];
        for (const chapter of profile.chapters) {
            const current = chapterMap.get(chapter.number) || { ...chapter, files: [], discipline: /기계|배관/.test(chapter.title + file.relativePath) ? 'mechanical' : /전기|계측|계장/.test(chapter.title + file.relativePath) ? 'electrical' : 'process' };
            current.files.push(file.entryId); chapterMap.set(chapter.number, current);
        }
        for (const layout of profile.sections) {
            const pattern = { widthMm: layout.widthMm, heightMm: layout.heightMm, marginsMm: layout.marginsMm }, key = JSON.stringify(pattern);
            const found = layouts.get(key) || { ...pattern, files: [] };
            if (!found.files.includes(file.entryId)) found.files.push(file.entryId);
            layouts.set(key, found);
        }
        for (const item of profile.typography) {
            const key = JSON.stringify(item.value), found = typography.get(key) || { ...item.value, count: 0, files: [] };
            found.count += item.count; found.files.push(file.entryId); typography.set(key, found);
        }
    }
    return { totals, chapters: [...chapterMap.values()].sort((a, b) => a.number - b.number), layouts: [...layouts.values()], typography: [...typography.values()].sort((a, b) => b.count - a.count).slice(0, 12) };
}

export async function analyzeReferenceProject(userId, projectId, { onProgress = () => {}, signal } = {}) {
    const [projects, entries] = await Promise.all([listReferenceProjects(userId), listReferenceEntries(userId, projectId)]);
    const project = projects.find(project => project.id === projectId);
    if (!project) throw new Error('프로젝트 폴더를 다시 선택하세요.');
    const originals = entries.filter(entry => entry.format === 'hwpx');
    if (!originals.length) throw new Error('분석할 HWPX 원본이 없습니다. PDF만으로는 편집 서식을 학습할 수 없습니다.');
    const signature = referenceAnalysisSignature(project, entries), files = [], pairs = buildReferenceParts(entries);
    for (const [index, entry] of originals.entries()) {
        if (signal?.aborted) throw abortError();
        onProgress({ index, total: originals.length, name: entry.relativePath });
        const record = { entryId: entry.id, relativePath: entry.relativePath, sha256: entry.sha256, pdfEntryId: pairs.find(part => part.original?.id === entry.id)?.pdf?.id || '' };
        try {
            const blob = await loadMaterial(userId, entry.materialId), bytes = await blob.arrayBuffer();
            const profile = await analyzeFile(bytes, entry.filename, signal);
            if (profile.source.sha256 !== entry.sha256) throw new Error('등록된 원본과 분석 결과의 해시가 다릅니다.');
            files.push({ ...record, profile });
        } catch (error) { if (error.name === 'AbortError') throw error; files.push({ ...record, error: error.message }); }
    }
    if (signal?.aborted) throw abortError();
    if (!files.some(file => file.profile)) throw new Error(`원본 분석에 실패했습니다. ${files[0]?.error || ''}`);
    const analysis = { version: 1, status: files.some(file => file.error) ? 'partial' : 'ready', createdAt: new Date().toISOString(), signature, files,
        summary: summarizeReferenceProfiles(files), verification: { pdfVisualComparison: 'pending', pageReconstruction: 'pending', modelTraining: 'not-performed' } };
    await saveReferenceAnalysis(userId, projectId, analysis);
    return analysis;
}

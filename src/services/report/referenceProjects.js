import { addMaterial, reportLibraryDatabase } from './reportLibrary.js';

export const REFERENCE_COMPONENTS = { cover: '표지', innerCover: '속표지', spine: '책등', contents: '목차', tableContents: '표 목차', figureContents: '그림 목차', chapter: '본문', divider: '장 구분 표지', appendix: '부록·별첨', blank: '빈 쪽', complete: '전체 보고서', other: '기타' };
const order = { cover: 0, innerCover: 1, spine: 2, contents: 3, tableContents: 4, figureContents: 5, chapter: 6, divider: 6, appendix: 7, blank: 8, complete: 9, other: 10 };
const uidFor = userId => {
    if (userId == null || !String(userId).trim()) throw new Error('로그인한 사용자 정보를 확인하세요.');
    return String(userId);
};
const keyFor = (uid, ...ids) => JSON.stringify([uidFor(uid), ...ids]);
const value = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const complete = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error || new Error('프로젝트 폴더 저장에 실패했습니다.')); });
const normalized = text => text.normalize('NFKC').toLowerCase();

export function normalizeReferencePath(input) {
    if (typeof input !== 'string' || !input || Array.from(input).some(char => char.charCodeAt(0) < 32)) throw new Error('폴더 안의 파일 경로가 올바르지 않습니다.');
    const path = input.replaceAll('\\', '/');
    if (path.startsWith('/') || /^[a-z]:/i.test(path) || path.split('/').some(part => !part || ['.', '..'].includes(part))) throw new Error('폴더 안의 상대 경로를 확인하세요.');
    return path;
}
export function classifyReferencePath(relativePath) {
    const path = normalized(relativePath), filename = path.split('/').at(-1).replace(/\.[^.]+$/, ''), compact = filename.replace(/[\s_.()-]/g, '');
    const chapter = /제?\s*(\d{1,3})\s*장/.exec(filename) || /(?:^|\/)제?\s*(\d{1,3})\s*장(?:[\s_./-]|$)/.exec(path);
    const chapterNumber = chapter && Number(chapter[1]) > 0 ? Number(chapter[1]) : null;
    let componentKind = 'other';
    if (/책등|등표지|세네[카까]/.test(compact)) componentKind = 'spine';
    else if (/속표지|내표지/.test(compact)) componentKind = 'innerCover';
    else if (/표목차|표차례/.test(compact)) componentKind = 'tableContents';
    else if (/그림목차|그림차례/.test(compact)) componentKind = 'figureContents';
    else if (/목차|차례/.test(compact)) componentKind = 'contents';
    else if (/간지|중간표지|장표지|구분표지/.test(compact) || (chapterNumber && /(?:^|\/)(?:간지|장표지)\//.test(path))) componentKind = 'divider';
    else if (/표지|^cover$/.test(compact)) componentKind = chapterNumber ? 'divider' : 'cover';
    else if (/부록|별첨|붙임/.test(compact)) componentKind = 'appendix';
    else if (/빈페이지|빈쪽|백지|공백페이지/.test(compact)) componentKind = 'blank';
    else if (chapterNumber) componentKind = 'chapter';
    else if (/전체|합본|통합|완성본/.test(compact)) componentKind = 'complete';
    return { componentKind, chapterNumber };
}

function comparisonKey(entry) {
    const segments = normalized(entry.relativePath).split('/');
    let stem = segments.pop().replace(/\.[^.]+$/, '').replace(/(?:[\s_.()-]*(?:hwpx|pdf|변환본|변환|출력본))\s*$/g, '');
    stem = stem.replace(/^\s*\d+[\s._-]+/, '').replace(/제?\s*(\d+)\s*장/, (_, number) => `${Number(number)}장`).replace(/[\s._()-]/g, '');
    const folders = segments.filter(part => !/^(?:hwpx?|pdf|한글|한글원본|한글파일|변환|변환본|hwpx변환본|pdf출력본)$/i.test(part.replace(/[\s_-]/g, '')))
        .map(part => part.replace(/[_ -](?:hwpx?|pdf)$/i, ''));
    return `${folders.join('/')}/${stem}`;
}

export function buildReferenceParts(entries) {
    const groups = new Map(), usedPdfs = new Set(), parts = [];
    for (const entry of entries) {
        const key = comparisonKey(entry), group = groups.get(key) || [];
        group.push(entry); groups.set(key, group);
    }
    for (const entry of entries.filter(item => item.format === 'hwpx')) {
        const group = groups.get(comparisonKey(entry));
        const originals = group.filter(item => item.format === 'hwpx'), pdfs = group.filter(item => item.format === 'pdf');
        const automatic = originals.length === 1 && pdfs.length === 1 ? pdfs[0] : null;
        const manual = entry.pdfChoice && entry.pdfChoice !== 'none' ? entries.find(item => item.id === entry.pdfChoice && item.format === 'pdf') : null;
        const pdf = entry.pdfChoice === 'none' ? null : entry.pdfChoice ? manual : automatic;
        if (pdf) usedPdfs.add(pdf.id);
        parts.push({ id: entry.id, original: entry, pdf: pdf || null, componentKind: entry.componentKind, chapterNumber: entry.chapterNumber,
            relativePath: entry.relativePath, pairing: entry.pdfChoice === 'none' ? 'unlinked' : pdf ? entry.pdfChoice ? 'manual' : 'automatic' : pdfs.length || entry.pdfChoice ? 'ambiguous' : 'missing' });
    }
    for (const entry of entries.filter(item => item.format === 'pdf' && !usedPdfs.has(item.id))) parts.push({ id: entry.id, original: null, pdf: entry,
        componentKind: entry.componentKind, chapterNumber: entry.chapterNumber, relativePath: entry.relativePath, pairing: 'pdf-only' });
    return parts.sort((a, b) => (order[a.componentKind] - order[b.componentKind]) || ((a.chapterNumber || 0) - (b.chapterNumber || 0))
        || (a.componentKind === 'divider' ? -1 : 0) - (b.componentKind === 'divider' ? -1 : 0) || a.relativePath.localeCompare(b.relativePath, 'ko', { numeric: true }));
}

export async function listReferenceProjects(userId) {
    const uid = uidFor(userId), db = await reportLibraryDatabase();
    const records = await value(db.transaction('referenceProjects').objectStore('referenceProjects').index('userId').getAll(uid));
    return records.map(record => record.project).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function listReferenceEntries(userId, projectId) {
    const uid = uidFor(userId), db = await reportLibraryDatabase();
    const records = await value(db.transaction('referenceEntries').objectStore('referenceEntries').index('projectScope').getAll([uid, projectId]));
    return records.map(record => record.entry).sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'ko', { numeric: true }));
}
async function putProject(userId, project) {
    const uid = uidFor(userId), db = await reportLibraryDatabase(), tx = db.transaction('referenceProjects', 'readwrite'), ready = complete(tx);
    tx.objectStore('referenceProjects').put({ key: keyFor(uid, project.id), userId: uid, project }); await ready;
}
export async function removeReferenceProject(userId, projectId) {
    const uid = uidFor(userId), db = await reportLibraryDatabase(), tx = db.transaction(['referenceProjects', 'referenceEntries'], 'readwrite'), ready = complete(tx);
    const entries = tx.objectStore('referenceEntries'), request = entries.index('projectScope').getAllKeys([uid, projectId]);
    request.onsuccess = () => { request.result.forEach(key => entries.delete(key)); tx.objectStore('referenceProjects').delete(keyFor(uid, projectId)); };
    await ready;
}

export async function importReferenceFolder(userId, input, onProgress = () => {}, businessProjectId = '') {
    const uid = uidFor(userId);
    const files = Array.from(input).map(item => ({ file: item.file || item, path: normalizeReferencePath(item.relativePath || item.webkitRelativePath || '') }));
    if (!files.length) throw new Error('등록할 파일이 있는 프로젝트 폴더를 선택하세요.');
    const roots = new Set(files.map(item => item.path.split('/')[0]));
    if (roots.size !== 1 || files.some(item => !item.path.includes('/'))) throw new Error('프로젝트 폴더를 한 개씩 선택하세요. 하위 폴더는 함께 등록됩니다.');
    const selected = files.filter(item => /\.(?:hwpx|pdf)$/i.test(item.path) && !item.path.split('/').some(part => /^(?:~\$|\._)/.test(part)));
    if (!selected.length) throw new Error('선택한 폴더에 HWPX 또는 PDF 파일이 없습니다. 기존 HWP는 HWPX 사본으로 저장해 넣어주세요.');
    if (selected.length > 1000) throw new Error('한 프로젝트에는 HWPX·PDF를 최대 1,000개까지 등록할 수 있습니다. 폴더를 나누어 선택하세요.');
    if (new Set(selected.map(item => item.path)).size !== selected.length) throw new Error('동일한 상대 경로의 파일이 여러 개 있습니다. 폴더 구성을 확인하세요.');
    const now = new Date().toISOString(), project = { id: crypto.randomUUID(), businessProjectId, name: [...roots][0], status: 'importing', createdAt: now, updatedAt: now,
        total: selected.length, count: 0, hwpxCount: 0, pdfCount: 0, ignoredCount: files.length - selected.length, errors: [], wholePdfEntryId: '' };
    await putProject(uid, project);
    const entries = [];
    for (let index = 0; index < selected.length; index++) {
        const item = selected[index];
        onProgress({ index, total: selected.length, name: item.path });
        try {
            const { material } = await addMaterial(uid, item.file, 'reference');
            const relativePath = item.path.split('/').slice(1).join('/');
            const entry = { id: crypto.randomUUID(), filename: item.file.name, relativePath, materialId: material.id, format: material.format,
                size: material.size, sha256: material.sha256, ...classifyReferencePath(relativePath) };
            const db = await reportLibraryDatabase(), tx = db.transaction(['referenceEntries', 'referenceProjects'], 'readwrite'), ready = complete(tx);
            project.count++; project[material.format === 'hwpx' ? 'hwpxCount' : 'pdfCount']++; project.updatedAt = new Date().toISOString();
            tx.objectStore('referenceEntries').add({ key: keyFor(uid, project.id, entry.id), userId: uid, projectId: project.id, materialId: material.id, entry });
            tx.objectStore('referenceProjects').put({ key: keyFor(uid, project.id), userId: uid, project });
            try { await ready; } catch (error) { project.count--; project[material.format === 'hwpx' ? 'hwpxCount' : 'pdfCount']--; throw error; }
            entries.push(entry);
        } catch (error) { project.errors.push({ relativePath: item.path.split('/').slice(1).join('/'), message: error.message }); }
    }
    project.status = project.errors.length ? 'partial' : 'ready'; project.updatedAt = new Date().toISOString();
    if (!entries.length) { await removeReferenceProject(uid, project.id); throw new Error(`등록된 원본이 없습니다. ${project.errors[0]?.message || ''}`); }
    const completePdfs = entries.filter(entry => entry.format === 'pdf' && entry.componentKind === 'complete');
    if (completePdfs.length === 1) project.wholePdfEntryId = completePdfs[0].id;
    const signature = entries.map(entry => `${entry.relativePath}\0${entry.sha256}`).sort().join('\n');
    project.fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature))), byte => byte.toString(16).padStart(2, '0')).join('');
    if (!project.errors.length) {
        const existing = (await listReferenceProjects(uid)).find(item => (item.businessProjectId || '') === businessProjectId && item.id !== project.id && item.name === project.name && item.status === 'ready' && item.fingerprint === project.fingerprint);
        if (existing) { await removeReferenceProject(uid, project.id); return { project: existing, duplicate: true }; }
    }
    await putProject(uid, project);
    return { project, duplicate: false };
}

export async function updateReferenceEntry(userId, projectId, entryId, patch) {
    const uid = uidFor(userId), db = await reportLibraryDatabase(), tx = db.transaction('referenceEntries', 'readwrite'), ready = complete(tx), store = tx.objectStore('referenceEntries');
    const key = keyFor(uid, projectId, entryId); let entry, failure;
    const request = store.get(key);
    request.onsuccess = () => {
        if (!request.result) { failure = '프로젝트의 파일을 찾을 수 없습니다.'; return; }
        entry = { ...request.result.entry };
        if ('componentKind' in patch) { if (!REFERENCE_COMPONENTS[patch.componentKind]) { failure = '구성 종류가 올바르지 않습니다.'; return; } entry.componentKind = patch.componentKind; }
        if ('chapterNumber' in patch) { if (patch.chapterNumber !== null && (!Number.isInteger(patch.chapterNumber) || patch.chapterNumber < 1 || patch.chapterNumber > 999)) { failure = '장 번호는 1~999 사이로 입력하세요.'; return; } entry.chapterNumber = patch.chapterNumber; }
        const save = () => store.put({ ...request.result, entry });
        if ('pdfChoice' in patch && patch.pdfChoice && patch.pdfChoice !== 'none') {
            const pdf = store.get(keyFor(uid, projectId, patch.pdfChoice));
            pdf.onsuccess = () => { if (pdf.result?.entry.format !== 'pdf') { failure = '같은 프로젝트의 PDF를 선택하세요.'; return; } entry.pdfChoice = patch.pdfChoice; save(); };
        } else { if ('pdfChoice' in patch) entry.pdfChoice = patch.pdfChoice || ''; save(); }
    };
    await ready; if (failure) throw new Error(failure); return entry;
}
export async function setWholeReferencePdf(userId, projectId, entryId) {
    const uid = uidFor(userId), db = await reportLibraryDatabase(), tx = db.transaction(['referenceProjects', 'referenceEntries'], 'readwrite'), ready = complete(tx);
    let failure; const store = tx.objectStore('referenceProjects'), request = store.get(keyFor(uid, projectId));
    request.onsuccess = () => {
        if (!request.result) { failure = '프로젝트 폴더를 찾을 수 없습니다.'; return; }
        const save = () => store.put({ ...request.result, project: { ...request.result.project, wholePdfEntryId: entryId, updatedAt: new Date().toISOString() } });
        if (!entryId) { save(); return; }
        const pdf = tx.objectStore('referenceEntries').get(keyFor(uid, projectId, entryId));
        pdf.onsuccess = () => { if (pdf.result?.entry.format !== 'pdf') failure = '같은 프로젝트의 PDF를 선택하세요.'; else save(); };
    };
    await ready; if (failure) throw new Error(failure);
}

export const referenceAnalysisSignature = (project, entries) => JSON.stringify([project.wholePdfEntryId || '', entries.map(entry => [entry.id, entry.sha256, entry.relativePath, entry.componentKind, entry.chapterNumber, entry.pdfChoice || '']).sort((a, b) => a[0].localeCompare(b[0]))]);

export async function saveReferenceAnalysis(userId, projectId, analysis) {
    const uid = uidFor(userId), db = await reportLibraryDatabase();
    const tx = db.transaction(['referenceProjects', 'referenceEntries'], 'readwrite'), ready = complete(tx);
    const store = tx.objectStore('referenceProjects'); let failure;
    const request = store.get(keyFor(uid, projectId));
    request.onsuccess = () => {
        if (!request.result) { failure = '분석할 프로젝트 폴더가 없습니다.'; return; }
        const records = tx.objectStore('referenceEntries').index('projectScope').getAll([uid, projectId]);
        records.onsuccess = () => {
            const project = request.result.project;
            if (analysis.signature !== referenceAnalysisSignature(project, records.result.map(record => record.entry))) { failure = '분석 중 원본 구성이 변경되었습니다. 다시 분석하세요.'; return; }
            store.put({ ...request.result, project: { ...project, analysis, updatedAt: new Date().toISOString() } });
        };
    };
    await ready; if (failure) throw new Error(failure);
}

/** Chromium directories are read in batches; keep reading until the empty batch. */
export async function filesFromReferenceDrop(items) {
    const roots = Array.from(items).map(item => item.webkitGetAsEntry?.()).filter(Boolean), files = [];
    if (!roots.length || roots.some(entry => !entry.isDirectory)) throw new Error('파일 대신 프로젝트 폴더를 끌어 놓으세요.');
    let count = 0;
    const visit = async (entry, parent = '') => {
        if (++count > 10000) throw new Error('폴더 항목이 너무 많습니다. 보고서 파일이 있는 프로젝트 폴더를 선택하세요.');
        const path = `${parent}${entry.name}`;
        if (entry.isFile) { files.push({ file: await new Promise((resolve, reject) => entry.file(resolve, reject)), relativePath: path }); return; }
        if (!entry.isDirectory || /^(?:\.git|node_modules|\$RECYCLE\.BIN)$/i.test(entry.name)) return;
        const reader = entry.createReader();
        for (;;) {
            const entries = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
            if (!entries.length) break;
            for (const child of entries) await visit(child, `${path}/`);
        }
    };
    for (const root of roots) await visit(root);
    return files;
}

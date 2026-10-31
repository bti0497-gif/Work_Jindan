import { strFromU8, unzipSync } from 'fflate';
import CFB from 'cfb';
import { MAX_PWV_BYTES, readPowerViewXml } from './powerView.js';
import { MAX_BMT_BYTES, readThermalBmt } from './thermalBmt.js';
import { studioMaterialIds } from './studioProjects.js';

export const MAX_MATERIAL_BYTES = 160 * 1024 * 1024;
export const MATERIAL_ROLES = { reference: '참고 보고서', data: '본문 입력자료', image: '표지·본문 이미지' };
export const REPORT_TYPES = { unclassified: '미분류', comprehensive: '종합 기술진단', discipline: '분야별·부분 진단', proposal: '개선·제안 보고서', other: '기타' };
export const ACCEPT_MATERIALS = {
    reference: '.pdf,.hwp,.hwpx', data: '.pdf,.hwp,.hwpx,.xlsx,.csv,.pwv,.bmt', image: '.png,.jpg,.jpeg,.webp',
};
const mimeTypes = { pdf: 'application/pdf', hwp: 'application/x-hwp', hwpx: 'application/hwp+zip', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
let pendingDatabase;
const scope = userId => {
    if (userId == null || !String(userId).trim()) throw new Error('로그인한 사용자 정보를 확인하세요.');
    return String(userId);
};
const keyFor = (userId, id) => JSON.stringify([scope(userId), id]);
function database() {
    if (!pendingDatabase) pendingDatabase = new Promise((resolve, reject) => {
        const request = indexedDB.open('jindan-report-studio', 3);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('materials')) db.createObjectStore('materials', { keyPath: 'key' }).createIndex('userId', 'userId');
            if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'key' });
            if (!db.objectStoreNames.contains('studios')) db.createObjectStore('studios', { keyPath: 'userId' });
            if (!db.objectStoreNames.contains('facilityStudios')) db.createObjectStore('facilityStudios', { keyPath: 'key' });
            if (!db.objectStoreNames.contains('referenceProjects')) db.createObjectStore('referenceProjects', { keyPath: 'key' }).createIndex('userId', 'userId');
            if (!db.objectStoreNames.contains('referenceEntries')) {
                const entries = db.createObjectStore('referenceEntries', { keyPath: 'key' });
                entries.createIndex('projectScope', ['userId', 'projectId']);
                entries.createIndex('materialScope', ['userId', 'materialId']);
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => { db.close(); pendingDatabase = null; };
            resolve(db);
        };
        request.onerror = () => { pendingDatabase = null; reject(request.error); };
        request.onblocked = () => { pendingDatabase = null; reject(new Error('다른 스튜디오 창을 닫고 다시 시도하세요.')); };
    });
    return pendingDatabase;
}
export const reportLibraryDatabase = () => database();
function done(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('자료 저장에 실패했습니다.'));
        tx.onabort = () => reject(tx.error || new Error('자료 저장이 취소되었습니다.'));
    });
}
function result(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export function createStudio() {
    return { title: '새 기술진단 보고서', header: '', footer: '', titlePosition: 'middle', titleAlign: 'center', coverId: '',
        chapters: [{ id: crypto.randomUUID(), kind: 'cover', title: '표지', text: '' },
            { id: crypto.randomUUID(), kind: 'contents', title: '차례', text: '' },
            { id: crypto.randomUUID(), kind: 'chapter', title: '제1장 본문', text: '' }],
        chapterStartsOdd: true, blankPageFurniture: false };
}
export function reorderChapterTitles(chapters) {
    let ordinal = 0;
    return chapters.map(chapter => {
        if (chapter.kind !== 'chapter') return chapter;
        ordinal++;
        return { ...chapter, title: chapter.title.replace(/^제\s*\d+\s*장/, `제${ordinal}장`) };
    });
}
export const STUDIO_FACILITIES = { yeonpyeong: '연평도', baengnyeong: '백령도', daecheong: '대청도' };
function facilityScope(facilityId) {
    if (facilityId && !Object.hasOwn(STUDIO_FACILITIES, facilityId) && !/^(?:project|archive):[a-zA-Z0-9_.:%-]{1,160}$/.test(facilityId)) throw new Error('보고서 대상 프로젝트를 확인하세요.');
    return facilityId;
}
export async function loadStudio(userId, facilityId = '', projectName = '') {
    const uid = scope(userId), db = await database();
    if (facilityScope(facilityId)) {
        const saved = await result(db.transaction('facilityStudios').objectStore('facilityStudios').get(keyFor(uid, facilityId)));
        return saved?.studio || { ...createStudio(), title: `${projectName || STUDIO_FACILITIES[facilityId] || '새 프로젝트'} 기술진단 보고서`, electrical: { referenceProjectId: '', inputs: {}, notes: {} } };
    }
    return (await result(db.transaction('studios').objectStore('studios').get(uid)))?.studio || createStudio();
}
export async function listStudioProjects(userId) {
    const uid = scope(userId), db = await database();
    return (await result(db.transaction('facilityStudios').objectStore('facilityStudios').getAll())).filter(record => record.userId === uid)
        .map(record => ({ id: record.facilityId, name: record.studio.projectName || record.studio.title }));
}
export async function saveStudio(userId, studio, facilityId = '') {
    const uid = scope(userId), db = await database(), storeName = facilityScope(facilityId) ? 'facilityStudios' : 'studios', tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put({ ...(facilityId ? { key: keyFor(uid, facilityId), facilityId } : {}), userId: uid, studio, updatedAt: new Date().toISOString() });
    await done(tx);
}
export async function listMaterials(userId) {
    const uid = scope(userId), db = await database();
    const records = await result(db.transaction('materials').objectStore('materials').index('userId').getAll(uid));
    return records.map(({ material }) => material).sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.filename.localeCompare(b.filename, 'ko'));
}
export async function loadMaterial(userId, id) {
    const key = keyFor(userId, id), db = await database();
    const record = await result(db.transaction('files').objectStore('files').get(key));
    if (!record) throw new Error('보관한 원본 자료를 찾을 수 없습니다. 다시 등록하세요.');
    return record.blob;
}

export async function inspectMaterial(file, role) {
    if (!MATERIAL_ROLES[role]) throw new Error('자료 종류를 선택하세요.');
    const format = file.name?.split('.').at(-1)?.toLowerCase();
    if (!format || !ACCEPT_MATERIALS[role].split(',').includes(`.${format}`)) throw new Error(`${MATERIAL_ROLES[role]}에 등록할 수 없는 파일입니다. 지원 형식을 확인하세요.`);
    if (!file.size || file.size > MAX_MATERIAL_BYTES) throw new Error('파일은 0바이트보다 크고 160MB 이하여야 합니다.');
    if (format === 'pwv' && file.size > MAX_PWV_BYTES) throw new Error('PowerView PWV 원본은 48MB 이하로 등록하세요.');
    if (format === 'bmt' && file.size > MAX_BMT_BYTES) throw new Error('Testo BMT 원본은 48MB 이하로 등록하세요.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const starts = signature => signature.every((value, index) => bytes[index] === value);
    let valid = false;
    if (format === 'pdf') valid = strFromU8(bytes.subarray(0, 5)) === '%PDF-';
    if (format === 'hwp' && starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
        try {
            const ole = CFB.read(bytes, { type: 'array' }), index = ole.FullPaths.findIndex(name => name.endsWith('/FileHeader'));
            valid = index >= 0 && new TextDecoder().decode(new Uint8Array(ole.FileIndex[index].content).subarray(0, 32)).startsWith('HWP Document File');
        } catch { valid = false; }
    }
    if (format === 'png') valid = starts([137, 80, 78, 71, 13, 10, 26, 10]);
    if (['jpg', 'jpeg'].includes(format)) valid = starts([255, 216, 255]);
    if (format === 'webp') valid = strFromU8(bytes.subarray(0, 4)) === 'RIFF' && strFromU8(bytes.subarray(8, 12)) === 'WEBP';
    if (['hwpx', 'xlsx'].includes(format)) {
        let count = 0, size = 0; const names = new Set();
        const parts = unzipSync(bytes, { filter: entry => {
            if (++count > 20000 || (size += entry.originalSize) > 256 * 1024 * 1024 || /(?:^|\/)\.\.(?:\/|$)/.test(entry.name)) throw new Error('문서 패키지의 크기 또는 경로가 올바르지 않습니다.');
            names.add(entry.name);
            if (entry.name === 'mimetype' && entry.originalSize > 1024) throw new Error('문서 형식 정보가 올바르지 않습니다.');
            return entry.name === 'mimetype';
        } });
        valid = format === 'hwpx' ? names.has('Contents/section0.xml') && strFromU8(parts.mimetype || new Uint8Array()).trim() === 'application/hwp+zip'
            : names.has('xl/workbook.xml') && names.has('[Content_Types].xml');
    }
    if (format === 'csv') valid = !bytes.includes(0);
    if (format === 'pwv') { readPowerViewXml(bytes); valid = true; }
    if (format === 'bmt') { readThermalBmt(bytes); valid = true; }
    if (!valid) throw new Error('확장자와 파일 내용이 일치하지 않거나 올바른 문서가 아닙니다.');
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    return { format, sha256, blob: new Blob([bytes], { type: mimeTypes[format] }) };
}

export async function addMaterial(userId, file, role = 'reference') {
    const uid = scope(userId), inspected = await inspectMaterial(file, role);
    const id = `${role}-${inspected.sha256}`, key = keyFor(uid, id), db = await database();
    const tx = db.transaction(['materials', 'files'], 'readwrite'), complete = done(tx);
    const store = tx.objectStore('materials');
    let material, duplicate = false;
    const request = store.get(key);
    request.onsuccess = () => {
        if (request.result) { material = request.result.material; duplicate = true; return; }
        const now = new Date().toISOString();
        material = { id, filename: file.name, title: file.name.replace(/\.[^.]+$/, ''), format: inspected.format, size: file.size,
            sha256: inspected.sha256, role, reportType: 'unclassified', facility: '', templateGroup: '', notes: '',
            includeInPatterns: role === 'reference', addedAt: now, updatedAt: now };
        store.add({ key, userId: uid, material });
        tx.objectStore('files').add({ key, blob: inspected.blob });
    };
    await complete;
    return { material, duplicate };
}
export async function updateMaterial(userId, id, patch) {
    const uid = scope(userId), key = keyFor(uid, id), db = await database();
    const tx = db.transaction('materials', 'readwrite'), complete = done(tx), store = tx.objectStore('materials');
    let material, missing = false;
    const request = store.get(key);
    request.onsuccess = () => {
        if (!request.result) { missing = true; return; }
        const allowed = {};
        for (const name of ['title', 'facility', 'templateGroup', 'notes']) if (name in patch) {
            if (typeof patch[name] !== 'string' || patch[name].length > (name === 'notes' ? 10000 : 300)) { tx.abort(); return; }
            allowed[name] = patch[name];
        }
        if ('reportType' in patch) {
            if (!REPORT_TYPES[patch.reportType]) { tx.abort(); return; }
            allowed.reportType = patch.reportType;
        }
        if ('includeInPatterns' in patch) {
            if (typeof patch.includeInPatterns !== 'boolean') { tx.abort(); return; }
            allowed.includeInPatterns = patch.includeInPatterns;
        }
        material = { ...request.result.material, ...allowed, updatedAt: new Date().toISOString() };
        store.put({ key, userId: uid, material });
    };
    await complete;
    if (missing) throw new Error('수정할 자료가 없습니다. 목록을 다시 확인하세요.');
    return material;
}
export async function removeMaterial(userId, id) {
    const uid = scope(userId), key = keyFor(uid, id), db = await database(), tx = db.transaction(['materials', 'files', 'referenceEntries', 'facilityStudios'], 'readwrite'), complete = done(tx);
    let linked = false, checked = 0;
    const finishCheck = () => { if (++checked === 2 && !linked) { tx.objectStore('materials').delete(key); tx.objectStore('files').delete(key); } };
    const request = tx.objectStore('referenceEntries').index('materialScope').count([uid, id]);
    request.onsuccess = () => {
        if (request.result) linked = true;
        finishCheck();
    };
    const books=tx.objectStore('facilityStudios').getAll();
    books.onsuccess=()=>{if(books.result.some(record=>record.userId===uid&&studioMaterialIds(record.studio).has(id)))linked=true;finishCheck();};
    await complete;
    if (linked) throw new Error('프로젝트 또는 프로젝트 폴더에서 사용 중인 자료입니다. 보관한 원본은 유지합니다.');
}
export function materialSize(bytes) {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

import { reportSection } from './reportSections.js';

let databasePromise;
const keyFor = (userId, projectId, sha256, discipline = 'electrical') => {
    if (!userId || !projectId || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('보고서 저장 범위가 올바르지 않습니다.');
    reportSection(discipline);
    // Keep the original electrical keys so previously saved work stays accessible.
    return JSON.stringify(discipline === 'electrical' ? [String(userId), String(projectId), sha256] : [String(userId), String(projectId), discipline, sha256]);
};
function database() {
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open('jindan-report-engine', 2);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains('workspaces')) request.result.createObjectStore('workspaces', { keyPath: 'key' }).createIndex('scope', ['userId', 'projectId']);
            else if (!request.transaction.objectStore('workspaces').indexNames.contains('scope')) request.transaction.objectStore('workspaces').createIndex('scope', ['userId', 'projectId']);
            if (!request.result.objectStoreNames.contains('sources')) request.result.createObjectStore('sources', { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => { databasePromise = null; reject(request.error); };
        request.onblocked = () => { databasePromise = null; reject(new Error('다른 앱 창을 닫고 보고서 저장을 다시 시도하세요.')); };
    });
    return databasePromise;
}
export async function saveReportSource(userId, projectId, sha256, bytes, discipline = 'electrical') {
    const key = keyFor(userId, projectId, sha256, discipline);
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== sha256) throw new Error('보관할 원본의 식별값이 다릅니다.');
    const db = await database();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('sources', 'readwrite');
        tx.objectStore('sources').put({ key, bytes: data });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('원본 보관이 취소되었습니다.'));
    });
}
export async function loadReportSource(userId, projectId, sha256, discipline = 'electrical') {
    const key = keyFor(userId, projectId, sha256, discipline), db = await database();
    return new Promise((resolve, reject) => {
        const request = db.transaction('sources').objectStore('sources').get(key);
        request.onsuccess = () => request.result ? resolve(request.result.bytes) : reject(new Error('원본 한글 파일을 다시 선택하세요. 다른 PC의 작업 백업에는 원본 파일이 포함되지 않습니다.'));
        request.onerror = () => reject(request.error);
    });
}
export async function saveWorkspace(userId, workspace) {
    const key = keyFor(userId, workspace.projectId, workspace.source.sha256, workspace.discipline);
    const db = await database();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('workspaces', 'readwrite');
        transaction.objectStore('workspaces').put({ key, userId: String(userId), projectId: String(workspace.projectId), workspace });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('보고서 저장이 취소되었습니다.'));
    });
}
export async function listWorkspaces(userId, projectId, discipline = 'electrical') {
    if (!userId || !projectId) return [];
    reportSection(discipline);
    const db = await database();
    return new Promise((resolve, reject) => {
        const request = db.transaction('workspaces').objectStore('workspaces').index('scope').getAll([String(userId), String(projectId)]);
        request.onsuccess = () => resolve(request.result.filter(record => record.userId === String(userId) && record.projectId === String(projectId) && (record.workspace.discipline || 'electrical') === discipline).map(record => record.workspace).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        request.onerror = () => reject(request.error);
    });
}
export function validateBackup(workspace, projectId, discipline = 'electrical') {
    reportSection(discipline);
    if ((workspace?.discipline || 'electrical') !== discipline) throw new Error('현재 분야의 보고서 백업 파일이 아닙니다. 해당 분야 메뉴에서 불러오세요.');
    if (workspace?.engineVersion !== 1 || String(workspace.projectId) !== String(projectId) || !Array.isArray(workspace.fields) || !Array.isArray(workspace.rules) || !workspace.values || !workspace.notes || !Array.isArray(workspace.history) || !Array.isArray(workspace.document?.tables) || !Array.isArray(workspace.document?.paragraphs) || workspace.document?.source?.sha256 !== workspace.source?.sha256) throw new Error('현재 프로젝트의 보고서 엔진 백업 파일이 아닙니다.');
    keyFor('validate', projectId, workspace.source.sha256);
    const isText = value => typeof value === 'string';
    const isRecord = value => value != null && typeof value === 'object' && !Array.isArray(value);
    const unique = items => new Set(items.map(item => item.id)).size === items.length;
    if (!isText(workspace.projectTitle) || !isText(workspace.updatedAt) || !isText(workspace.source.filename) || !isRecord(workspace.values) || !Number.isSafeInteger(workspace.revision) || workspace.revision < 1 || workspace.fields.length > 20000 || workspace.document.tables.length > 5000 || workspace.document.paragraphs.length > 150000 || !unique(workspace.fields) || !unique(workspace.document.tables)) throw new Error('보고서 백업의 메타데이터가 올바르지 않습니다.');
    if (workspace.fields.some(field => !isText(field.id) || !isText(field.label) || !isText(field.group) || !isText(field.unit) || !isText(field.reference) || !['number', 'text', 'date'].includes(field.type) || typeof field.required !== 'boolean' || (field.binding && field.binding.sourceSha256 !== workspace.source.sha256))) throw new Error('보고서 백업의 입력항목이 올바르지 않습니다.');
    if (workspace.fields.some(field => (field.valueSource && !['input', 'diagnosis', 'conclusion', 'improvements'].includes(field.valueSource)) || (field.outputPattern != null && !isText(field.outputPattern)))) throw new Error('보고서 백업의 데이터 역할·표시 형식이 올바르지 않습니다.');
    if (workspace.fields.some(field => field.collectionSource && !['manual', 'kepco', 'file'].includes(field.collectionSource))) throw new Error('보고서 백업의 수집 경로가 올바르지 않습니다.');
    if (workspace.materials != null && (!Array.isArray(workspace.materials) || workspace.materials.length > 2000 || workspace.materials.some(item => !isRecord(item) || !isText(item.id) || !isText(item.label) || !isText(item.description) || typeof item.required !== 'boolean' || !['manual', 'kepco', 'file'].includes(item.source) || !Array.isArray(item.fieldIds) || item.fieldIds.some(id => !isText(id))))) throw new Error('보고서 백업의 필요 자료 목록이 올바르지 않습니다.');
    if (workspace.materialReceipts != null && (!isRecord(workspace.materialReceipts) || Object.values(workspace.materialReceipts).some(item => !isRecord(item) || !isText(item.text)))) throw new Error('보고서 백업의 자료 접수 기록이 올바르지 않습니다.');
    if (workspace.valueOrigins != null && (!isRecord(workspace.valueOrigins) || Object.values(workspace.valueOrigins).some(item => !isRecord(item) || !isText(item.kind)))) throw new Error('보고서 백업의 데이터 출처가 올바르지 않습니다.');
    const invalidEvidence = item => !isRecord(item) || !isText(item.contentHash) || !isText(item.url) || !isText(item.title) || !Array.isArray(item.tables) || item.tables.some(table => !isRecord(table) || !Array.isArray(table.rows) || table.rows.some(row => !Array.isArray(row) || row.some(text => !isText(text))));
    if (workspace.collectedEvidence != null && (!Array.isArray(workspace.collectedEvidence) || workspace.collectedEvidence.length > 50 || workspace.collectedEvidence.some(invalidEvidence))) throw new Error('보고서 백업의 외부 수집 자료가 올바르지 않습니다.');
    if (workspace.narrativeValues != null && (!isRecord(workspace.narrativeValues) || Object.values(workspace.narrativeValues).some(text => !isText(text)))) throw new Error('보고서 백업의 문단별 진단 내용이 올바르지 않습니다.');
    if (workspace.rules.some(rule => !isText(rule.id) || !isText(rule.label) || !isText(rule.operation) || !Array.isArray(rule.fieldIds) || rule.fieldIds.some(id => !isText(id)) || (rule.criterion && (!isText(rule.criterion.source) || !['string', 'number'].includes(typeof rule.criterion.min) || !['string', 'number'].includes(typeof rule.criterion.max)))) || !['diagnosis', 'conclusion', 'improvements'].every(key => isText(workspace.notes[key])) || Object.values(workspace.values).some(value => !isText(value) && typeof value !== 'number')) throw new Error('보고서 백업의 계산·입력 데이터가 올바르지 않습니다.');
    const invalidTable = table => {
        if (!isRecord(table) || !isText(table.id) || !isText(table.title) || !Number.isSafeInteger(table.rows) || !Number.isSafeInteger(table.columns) || table.rows < 1 || table.columns < 1 || table.rows * table.columns > 100000 || !Array.isArray(table.cells) || !unique(table.cells)) return true;
        return table.cells.some(cell => !isRecord(cell) || !isText(cell.id) || !isText(cell.text) || !['row', 'column', 'rowSpan', 'colSpan'].every(key => Number.isSafeInteger(cell[key])) || cell.row < 0 || cell.column < 0 || cell.rowSpan < 1 || cell.colSpan < 1 || cell.row + cell.rowSpan > table.rows || cell.column + cell.colSpan > table.columns);
    };
    if (workspace.document.tables.some(invalidTable) || workspace.document.paragraphs.some(p => !isRecord(p) || !isText(p.id) || !isText(p.text))) throw new Error('보고서 백업의 원본 표·문단이 올바르지 않습니다.');
    const invalidSlots = item => item.textSlots != null && (!Array.isArray(item.textSlots) || item.textSlots.some(slot => !isRecord(slot) || !isText(slot.id) || !isText(slot.text) || !isText(slot.section) || typeof slot.plain !== 'boolean'));
    if (workspace.document.paragraphs.some(invalidSlots) || workspace.document.tables.some(table => table.cells.some(invalidSlots))) throw new Error('보고서 백업의 글자 서식 구간이 올바르지 않습니다.');
    if (workspace.runs != null && (!Array.isArray(workspace.runs) || workspace.runs.some(run => !isRecord(run) || !isRecord(run.values) || Object.values(run.values).some(value => !isText(value) && typeof value !== 'number') || !Number.isSafeInteger(run.revision) || !isRecord(run.notes) || !['diagnosis', 'conclusion', 'improvements'].every(key => isText(run.notes[key]))))) throw new Error('보고서 백업의 이전 진단 데이터가 올바르지 않습니다.');
    if (workspace.runs?.some(run => run.narrativeValues != null && (!isRecord(run.narrativeValues) || Object.values(run.narrativeValues).some(text => !isText(text))))) throw new Error('이전 진단의 문단별 내용이 올바르지 않습니다.');
    if ((workspace.analysisRequests != null && (!Array.isArray(workspace.analysisRequests) || workspace.analysisRequests.some(text => !isText(text)))) || (workspace.interpretation?.questions != null && (!Array.isArray(workspace.interpretation.questions) || workspace.interpretation.questions.some(text => !isText(text))))) throw new Error('보고서 백업의 추가 자료 요청이 올바르지 않습니다.');
    if (workspace.analysisProposal != null && (!isRecord(workspace.analysisProposal) || !Array.isArray(workspace.analysisProposal.fields) || workspace.analysisProposal.fields.some(field => !isRecord(field) || !isText(field.label) || !isText(field.group)) || !Array.isArray(workspace.analysisProposal.questions) || workspace.analysisProposal.questions.some(text => !isText(text)) || !Array.isArray(workspace.analysisProposal.needsTableIds) || workspace.analysisProposal.needsTableIds.some(id => !isText(id)))) throw new Error('보고서 백업의 분석 후보가 올바르지 않습니다.');
    // Imported drafts must be regenerated against the imported values and schema.
    return { ...workspace, discipline, projectId: String(projectId), draft: null, confirmedRevision: null };
}

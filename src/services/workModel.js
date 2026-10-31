export const WORK_COLLECTIONS = Object.freeze({ '프로젝트관리': 'jindan_projects', '공정관리': 'jindan_processes', '할일관리': 'jindan_tasks' });
export const WORK_TABLES = Object.keys(WORK_COLLECTIONS);
export const isWorkTable = table => Object.hasOwn(WORK_COLLECTIONS, table);
export function assertWorkTable(table) {
    if (!isWorkTable(table)) throw new Error('지원하지 않는 업무 자료입니다.');
}
export function assertWorkId(id) {
    if (typeof id !== 'string' || !id || id.length > 128 || id.includes('/') || ['.', '..'].includes(id)) throw new Error('업무 자료 ID를 확인하세요.');
}
const date = input => {
    if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input) || Number.isNaN(Date.parse(input)) || new Date(input).toISOString().slice(0, 10) !== input) throw new Error('업무 일자를 확인하세요.');
    return input;
};
const text = (input, limit, required = false) => {
    const value = typeof input === 'string' ? input : '';
    if ((required && !value.trim()) || new TextEncoder().encode(value).length > limit) throw new Error('업무 제목 또는 본문 길이를 확인하세요.');
    return value;
};
export function makeWorkRecord(table, input, user, existing = null, now = new Date().toISOString()) {
    assertWorkTable(table); assertWorkId(input.id);
    if (!user?.uid || !user.person_id) throw new Error('Firebase에 로그인해 주세요.');
    if (existing?.deleted) throw new Error('삭제된 업무 자료는 다시 저장할 수 없습니다.');
    if (!existing && input.authorId && input.authorId !== user.person_id && user.role !== 'admin') throw new Error('다른 사용자의 업무 자료를 대신 등록할 수 없습니다.');
    const record = { id: input.id, author: existing?.author || text(input.author || user.name, 300), authorId: existing?.authorId || input.authorId || user.person_id,
        ownerUid: existing?.ownerUid || user.uid, createdAt: existing?.createdAt || input.createdAt || now, updatedAt: now, deleted: false };
    if (table === '할일관리') {
        if (record.authorId !== user.person_id) throw new Error('본인의 할일만 저장할 수 있습니다.');
        return { ...record, date: date(input.date), content: text(input.content, 20000, true), isPublic: input.isPublic === true };
    }
    const range = { startDate: date(input.startDate), endDate: date(input.endDate) };
    if (range.startDate > range.endDate) throw new Error('종료일은 시작일 이후여야 합니다.');
    const common = { ...record, ...range, title: text(input.title, 300, true) };
    if (table === '프로젝트관리') return { ...common, content: text(input.content, 600000) };
    assertWorkId(input.projectId);
    if (existing && existing.projectId !== input.projectId) throw new Error('공정이 속한 프로젝트를 변경할 수 없습니다.');
    return { ...common, projectId: input.projectId, isCompleted: input.isCompleted === true };
}

// Missing cloud records may be legacy local records awaiting migration. Only an
// explicit server tombstone removes them; pending local edits/deletes win a pull.
export function mergeWorkRecords(local, cloud, pending = [], pruneMissing = false) {
    const queued = new Map(pending.map(item => [item.id, item]));
    const cloudIds = new Set(cloud.map(row => row.id));
    const rows = new Map(local.filter(row => !pruneMissing || !row.ownerUid || queued.has(row.id) || cloudIds.has(row.id)).map(row => [row.id, row]));
    for (const row of cloud) {
        if (queued.has(row.id)) continue;
        if (row.deleted) rows.delete(row.id); else rows.set(row.id, row);
    }
    for (const item of pending) if (item.operation === 'delete') rows.delete(item.id);
    return [...rows.values()];
}

const inputs = workspace => workspace.fields.filter(field => !field.valueSource || field.valueSource === 'input');
export const COLLECTION_SOURCES = { manual: '사용자 조사 양식', kepco: '한전 파워플래너', file: '별도 자료·현장 기록' };
const filled = value => value != null && String(value).trim() !== '';

export function collectionFields(workspace, scope = 'all') {
    return inputs(workspace).filter(field => scope !== 'manual' || (field.collectionSource || 'manual') !== 'kepco');
}
export function requiredMaterialErrors(workspace) {
    return (workspace.materials || []).filter(item => {
        if (!item.required) return false;
        if (!item.fieldIds.length) return !filled(workspace.materialReceipts?.[item.id]?.text);
        const fields = item.fieldIds.map(id => workspace.fields.find(field => field.id === id)).filter(Boolean);
        const required = fields.filter(field => field.required);
        return !fields.length || (required.length ? required : fields).some(field => !filled(workspace.values[field.id]));
    }).map(item => `${item.label}: 필요한 자료·현장 기록을 입력하세요.`);
}
export function materialList(workspace) {
    const groups = new Map();
    const covered = new Set();
    for (const material of workspace.materials || []) {
        const fields = material.fieldIds.map(id => inputs(workspace).find(field => field.id === id)).filter(Boolean);
        fields.forEach(field => covered.add(field.id));
        if (!material.fieldIds.length || fields.length) groups.set(material.id, { ...material, fieldIds: fields.map(field => field.id), source: fields[0]?.collectionSource || material.source });
    }
    for (const field of inputs(workspace)) {
        if (covered.has(field.id)) continue;
        const source = field.collectionSource || 'manual', key = JSON.stringify([field.group, source]);
        if (!groups.has(key)) groups.set(key, { id: `fields:${key}`, label: field.group || '진단 자료', source, fieldIds: [], required: false });
        const group = groups.get(key); group.fieldIds.push(field.id); group.required ||= field.required;
    }
    return [...groups.values()].map(item => {
        const fields = item.fieldIds.map(id => workspace.fields.find(field => field.id === id)).filter(Boolean);
        const required = fields.filter(field => field.required);
        const received = fields.length ? (required.length ? required : fields).every(field => filled(workspace.values[field.id])) : filled(workspace.materialReceipts?.[item.id]?.text);
        return { ...item, fields, filled: fields.filter(field => filled(workspace.values[field.id])).length, received };
    });
}
export function setCollectionSource(workspace, fieldIds, source) {
    if (!COLLECTION_SOURCES[source] || fieldIds.some(id => !inputs(workspace).some(field => field.id === id))) throw new Error('자료 수집 경로와 입력항목을 확인하세요.');
    const ids = new Set(fieldIds);
    return { ...workspace, fields: workspace.fields.map(field => ids.has(field.id) ? { ...field, collectionSource: source } : field),
        revision: workspace.revision + 1, confirmedRevision: null, draft: null, interpretationStale: !!workspace.interpretation || workspace.interpretationStale,
        updatedAt: new Date().toISOString() };
}
export function setMaterialReceipt(workspace, id, text) {
    if (!(workspace.materials || []).some(item => item.id === id && !item.fieldIds.length) || typeof text !== 'string' || text.length > 100000) throw new Error('자료 요청 항목을 확인하세요.');
    return { ...workspace, materialReceipts: { ...workspace.materialReceipts, [id]: { text, receivedAt: new Date().toISOString() } },
        draft: null, interpretationStale: !!workspace.interpretation || workspace.interpretationStale, updatedAt: new Date().toISOString() };
}
export function workflowProgress(workspace) {
    const labels = ['기존 보고서 등록', 'AI 분석·필요 자료 정리', '입력 양식 확정', '조사·외부 자료 취합', '검증·AI 초안 작성', '초안 내려받기'];
    let current = 0, message = '새 현장의 기존 보고서를 등록하세요.';
    if (workspace) {
        current = 1; message = '기존 보고서에서 입력 위치와 필요한 자료를 분석하세요.';
        if (workspace.fields.length) {
            current = 2; message = '필요 자료·입력 위치·수집 경로를 확인하고 양식을 확정하세요.';
            if (workspace.confirmedRevision === workspace.revision) {
                current = 3; message = '사용자 조사 양식과 외부 수집 자료를 취합하세요.';
                if (inputs(workspace).some(field => filled(workspace.values[field.id])) && !materialList(workspace).some(item => item.required && !item.received)) {
                    current = 4; message = '입력 형식·누락을 검증한 후 AI 진단 초안을 작성하세요.';
                    if (workspace.draft) { current = 5; message = '한글 초안을 내려받아 그림·쪽 배치·최종 의견을 수정하세요.'; }
                }
            }
        }
    }
    return { labels, current, message };
}

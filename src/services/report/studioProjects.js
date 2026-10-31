// Business project IDs are the only selectable report destinations. Legacy
// facility drafts and imported archives remain stored, without inventing projects.
export const studioProjectId = id => `project:${encodeURIComponent(String(id))}`;
export function studioProjectOptions(records) {
    return records.filter(record => record.id != null && !record.deleted)
        .map(record => ({ id: studioProjectId(record.id), businessProjectId: String(record.id), name: record.title || '프로젝트' }));
}
export function studioMaterialIds(book) {
    const ids = new Set();
    const visit = (value, key = '') => {
        if (typeof value === 'string' && (/materialId$/i.test(key) || key === 'coverId')) ids.add(value);
        else if (Array.isArray(value)) value.forEach(item => {
            if (typeof item === 'string' && ['reportIds', 'materialIds'].includes(key)) ids.add(item);
            else visit(item);
        });
        else if (value && typeof value === 'object') Object.entries(value).forEach(([name, item]) => visit(item, name));
    };
    visit(book); ids.delete(''); return ids;
}

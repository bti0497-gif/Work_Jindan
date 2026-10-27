import { validateData } from './reportEngine.js';

export const REPORT_SECTIONS = [
    { id: 'process', label: '공정', menu: '보고서 작성/공정' },
    { id: 'mechanical', label: '기계', menu: '보고서 작성/기계' },
    { id: 'electrical', label: '전기', menu: '보고서 작성/전기' },
];

// Workspaces created before the department menus were electrical reports.
export function reportSection(id = 'electrical') {
    const section = REPORT_SECTIONS.find(item => item.id === id);
    if (!section) throw new Error('보고서 분야가 올바르지 않습니다.');
    return section;
}

export function draftReadiness(workspace) {
    if (!workspace) return { ready: false, total: 0, filled: 0, required: 0, requiredFilled: 0, errors: ['기존 보고서를 먼저 등록하세요.'] };
    const fields = workspace.fields.filter(field => !field.valueSource || field.valueSource === 'input');
    const filled = field => String(workspace.values[field.id] ?? '').trim() !== '';
    const required = fields.filter(field => field.required);
    const errors = [...validateData(workspace).errors];
    if (!fields.length) errors.push('새 진단 데이터를 받을 입력항목을 지정하세요.');
    else if (!fields.some(filled)) errors.push('조사 양식에 작성한 새 진단 데이터를 가져오거나 직접 입력하세요.');
    return { ready: errors.length === 0, total: fields.length, filled: fields.filter(filled).length,
        required: required.length, requiredFilled: required.filter(filled).length, errors };
}

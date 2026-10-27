import { replaceHwpxSlots } from './hwpxPackage.js';
import { narrativeValue, validateData } from './reportEngine.js';

export function fieldTextSlots(workspace, field) {
    if (!field.binding) return [];
    if (field.binding.cellId) {
        const table = workspace.document.tables.find(table => table.id === field.binding.tableId);
        return table?.cells.find(cell => cell.id === field.binding.cellId)?.textSlots || [];
    }
    return workspace.document.paragraphs.find(paragraph => paragraph.id === field.binding.paragraphId)?.textSlots || [];
}

function formatFieldValue(field, slot, value) {
    if (field.outputPattern) return field.outputPattern.replace(/\{(value|unit)\}/g, (_, name) => name === 'value' ? value : field.unit || '');
    if (field.type !== 'number') return value;
    const original = slot.text.match(/^(\s*)([+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?)([^\d]*)$/);
    if (!original) return value;
    let numeric = value;
    if (original[2].includes(',')) {
        const [integer, fraction] = value.replaceAll(',', '').split('.');
        numeric = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction == null ? '' : `.${fraction}`);
    }
    const suffix = original[3];
    const normalize = text => text.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
    if (!suffix.trim() || !field.unit || normalize(suffix) === normalize(field.unit)) return `${original[1]}${numeric}${suffix}`;
    return `${original[1]}${numeric} ${field.unit}`;
}

export function planNativeWrite(workspace, mode = 'draft') {
    if (!['draft', 'blank'].includes(mode)) throw new Error('지원하지 않는 한글 작성 모드입니다.');
    const errors = [], replacements = [], used = new Set(), reviewWarnings = [];
    if (workspace.document.format !== 'hwpx') errors.push('HWP 원본은 한글에서 HWPX 사본으로 저장한 후 분석해야 서식 보존 작성이 가능합니다.');
    if (mode === 'draft') errors.push(...validateData(workspace).errors);
    if (mode === 'draft' && workspace.interpretationStale) reviewWarnings.push('이전 평가 이후 데이터가 변경되었습니다. 표시된 진단 문구를 담당자가 재검토하세요.');
    if (workspace.confirmedRevision !== workspace.revision) errors.push('입력 양식을 먼저 확정하세요.');
    for (const field of workspace.fields) {
        if (!field.binding || field.binding.sourceSha256 !== workspace.source.sha256) { errors.push(`${field.label}: 원본 교체 위치를 연결하세요. 추가 표·행 생성은 아직 지원하지 않습니다.`); continue; }
        const slots = fieldTextSlots(workspace, field);
        const wholeCell = field.binding.scope === 'cell' && !!field.binding.cellId;
        const selected = wholeCell ? slots : [field.binding.slotId ? slots.find(slot => slot.id === field.binding.slotId) : slots.length === 1 ? slots[0] : null];
        if (!selected.length || selected.some(slot => !slot?.plain && !(wholeCell && slot?.textOnly))) { errors.push(`${field.label}: 교체할 단어·글자 서식 구간을 하나 지정하세요. 복합 개체 구간은 보존만 가능합니다.`); continue; }
        if (selected.some(slot => used.has(slot.id))) { errors.push(`${field.label}: 다른 입력항목과 교체 위치가 겹칩니다.`); continue; }
        selected.forEach(slot => used.add(slot.id));
        const value = field.valueSource && field.valueSource !== 'input' ? narrativeValue(workspace, field) : workspace.values[field.id];
        const narrative = field.valueSource && field.valueSource !== 'input';
        const missing = value == null || String(value).trim() === '';
        if (mode === 'draft' && field.required && missing && !narrative) { errors.push(`${field.label}: 교체할 새 내용이 없습니다.`); continue; }
        if (mode === 'draft' && missing && narrative) reviewWarnings.push(`${field.label}: 담당자 작성·검토 필요`);
        const text = missing ? narrative ? '[담당자 작성·검토 필요]' : '미입력·검토 필요' : `${narrative && workspace.interpretationStale ? '[데이터 변경 후 진단 문구 재검토 필요]\n' : ''}${value}`;
        const formatted = missing ? text : formatFieldValue(field, selected[0], text);
        selected.forEach((slot, index) => replacements.push({ fieldId: field.id, section: slot.section, slotId: slot.id, expectedText: slot.text,
            wholeText: wholeCell, value: mode === 'blank' || index > 0 ? '' : formatted }));
    }
    return {
        mode, sourceSha256: workspace.source.sha256, errors: [...new Set(errors)], replacements,
        warnings: [...reviewWarnings, '지정하지 않은 원본 내용·표·그림은 그대로 남습니다. 과거 측정값·판정·연도 등의 미교체 내용을 검토하세요.',
            '교체 구간의 글자 모양과 주변 문단·표·그림 구조를 유지합니다. 문장 길이에 따른 줄바꿈·셀 높이·쪽 나눔은 한글에서 검토하고 다시 저장하세요.',
            '그림 교체·표 보완·쪽 넘김·최종 결론은 담당자가 한글에서 수정합니다. HWP 입력은 HWPX 변환이 필요합니다.'],
    };
}

export async function writeNativeReport(workspace, sourceBytes, mode = 'draft') {
    const plan = planNativeWrite(workspace, mode);
    if (plan.errors.length) throw new Error(plan.errors.join('\n'));
    const output = await replaceHwpxSlots(sourceBytes, workspace.source.sha256, plan.replacements);
    return { ...output, review: { ...plan, replacements: plan.replacements.map(({ fieldId, slotId }) => ({ fieldId, slotId })), status: 'hancom-review-required' } };
}

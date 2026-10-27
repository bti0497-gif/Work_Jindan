import { addFields, proposeCellField } from './reportEngine.js';
import { fingerprint } from './collectionForms.js';
import { COLLECTION_SOURCES } from './reportWorkflow.js';
const identity = workspace => ({ projectId: workspace.projectId, discipline: workspace.discipline || 'electrical', sourceSha256: workspace.source.sha256, parserVersion: workspace.document.parserVersion, revision: workspace.revision, fields: workspace.fields });
const roles = ['input', 'diagnosis', 'conclusion', 'improvements'];

export async function createAnalysisRequest(workspace, tableIds = []) {
    const selected = new Set(tableIds);
    if (tableIds.some(id => !workspace.document.tables.some(table => table.id === id))) throw new Error('분석할 표를 찾을 수 없습니다.');
    const inputFingerprint = await fingerprint(identity(workspace));
    return {
        kind: 'jindan-analysis-request', version: 1, ...identity(workspace), inputFingerprint,
        instructions: '기존 보고서 분석→필요 자료 목록→사용자 조사 양식과 외부 수집→취합→진단 초안의 워크플로우를 위한 계획을 만든다. fields에 실제 입력 위치와 역할, collectionSource(manual 사용자 조사 / kepco 한전에서 조회할 월별 사용량·요금·역률·계약정보 / file 별도 기록)를 지정한다. materials에는 필요한 자료명·설명·수집 경로·필수 여부·연결할 원본 targetIds를 정리한다. 추가 현장 관찰·협의·적용 기준처럼 특정 셀에 연결되지 않는 필요한 자료도 targetIds 빈 배열로 요청한다. 과거 보고서의 연도를 새 조사 대상 연도로 단정하지 않는다. 수배전설비의 장비명·규격은 유지하고 새 측정·판정만 대상으로 삼는다. 기존 값은 새 값으로 쓰지 않는다. 제목·단위 셀은 교체 대상이 아니다. 자료가 모호하면 questions, 더 필요한 표는 needsTableIds로 요청한다. 원본 XML·그림은 수정하지 않는다. 제공된 tableDetails는 반복 요청하지 않는다.',
        tableIndex: workspace.document.tables.map(table => ({ id: table.id, title: table.title, rows: table.rows, columns: table.columns,
            sample: table.cells.slice(0, 8).map(cell => ({ id: cell.id, row: cell.row, column: cell.column, text: cell.text.slice(0, 120) })) })),
        tableDetails: workspace.document.tables.filter(table => selected.has(table.id)).map(table => ({ id: table.id, cells: table.cells.map(cell => ({
            id: cell.id, row: cell.row, column: cell.column, rowSpan: cell.rowSpan, colSpan: cell.colSpan, text: cell.text,
            textSlots: (cell.textSlots || []).map(({ id, text, plain, charShapeId }) => ({ id, text, plain, charShapeId })),
        })) })),
        paragraphIndex: workspace.document.paragraphs.filter(paragraph => !paragraph.tableId && paragraph.text).map(paragraph => ({ id: paragraph.id, text: paragraph.text.slice(0, 180), styleId: paragraph.styleId })),
        responseContract: { kind: 'jindan-analysis', version: 1, projectId: workspace.projectId, sourceSha256: workspace.source.sha256,
            inputFingerprint, fields: [], questions: [], needsTableIds: [],
            materials: [],
            fieldExample: { targetId: '원본 셀 또는 문단 ID', slotId: '혼합 글자 모양일 때 교체할 구간 ID (선택)', label: '측정항목 이름', group: '처리장·설비·기간', type: 'number', unit: 'V', required: true, valueSource: 'input' } },
    };
}
export async function validateAnalysis(workspace, response) {
    if (response?.kind !== 'jindan-analysis' || response.version !== 1 || response.projectId !== workspace.projectId || response.sourceSha256 !== workspace.source.sha256 || response.inputFingerprint !== await fingerprint(identity(workspace))) throw new Error('현재 프로젝트·원본·양식과 일치하지 않는 분석 결과입니다.');
    if (!Array.isArray(response.fields) || response.fields.length > 20000 || !Array.isArray(response.questions) || response.questions.some(text => typeof text !== 'string' || text.length > 4000) || !Array.isArray(response.needsTableIds) || response.needsTableIds.some(id => !workspace.document.tables.some(table => table.id === id))) throw new Error('분석 결과의 입력항목·자료 요청 형식이 올바르지 않습니다.');
    const targets = new Map();
    for (const table of workspace.document.tables) for (const cell of table.cells) targets.set(cell.id, { table, cell });
    for (const paragraph of workspace.document.paragraphs) targets.set(paragraph.id, { paragraph });
    const fields = response.fields.map(candidate => {
        const target = targets.get(candidate?.targetId);
        if (!target || typeof candidate.label !== 'string' || !candidate.label.trim() || typeof candidate.group !== 'string' || typeof candidate.unit !== 'string' || typeof candidate.required !== 'boolean' || !['text', 'number', 'date'].includes(candidate.type) || !roles.includes(candidate.valueSource) || (candidate.valueSource !== 'input' && candidate.type !== 'text')) throw new Error('분석 결과에 잘못된 입력항목 또는 원본 위치가 있습니다.');
        const base = target.cell ? proposeCellField(workspace.document, target.table, target.cell) : {
            id: target.paragraph.id, reference: target.paragraph.text,
            binding: { sourceSha256: workspace.source.sha256, paragraphId: target.paragraph.id, ...target.paragraph.anchor },
        };
        const slots = target.cell?.textSlots || target.paragraph?.textSlots || [];
        const slot = candidate.slotId ? slots.find(slot => slot.id === candidate.slotId) : null;
        if (candidate.slotId && !slot?.plain) throw new Error('분석 결과의 글자 서식 구간이 원본과 일치하지 않습니다.');
        if (candidate.collectionSource && !COLLECTION_SOURCES[candidate.collectionSource]) throw new Error('입력항목의 수집 경로가 올바르지 않습니다.');
        return { ...base, id: slot ? `${base.id}@${slot.id}` : base.id, label: candidate.label, group: candidate.group, type: candidate.type,
            collectionSource: candidate.collectionSource || 'manual',
            unit: candidate.unit, required: candidate.required, valueSource: candidate.valueSource,
            reference: slot ? slot.text : base.reference, binding: { ...base.binding, ...(!slot && target.cell && candidate.type === 'text' ? { scope: 'cell' } : {}), ...(slot ? { slotId: slot.id } : {}) } };
    });
    if (new Set(fields.map(field => field.id)).size !== fields.length) throw new Error('분석 결과에 중복된 입력항목이 있습니다.');
    if (response.materials != null && (!Array.isArray(response.materials) || response.materials.length > 2000)) throw new Error('필요 자료 목록을 확인하세요.');
    const materials = (response.materials || []).map((item, index) => {
        if (!item || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 500 || typeof item.description !== 'string' || item.description.length > 4000 || !COLLECTION_SOURCES[item.source] || typeof item.required !== 'boolean' || !Array.isArray(item.targetIds) || item.targetIds.some(id => !targets.has(id))) throw new Error('필요 자료의 이름·수집 경로·원본 위치가 올바르지 않습니다.');
        return { id: `material:${response.inputFingerprint}:${index}`, label: item.label, description: item.description, source: item.source, required: item.required,
            fieldIds: fields.filter(field => item.targetIds.includes(field.binding?.cellId || field.binding?.paragraphId)).map(field => field.id) };
    });
    return { fields, materials, questions: [...response.questions], needsTableIds: [...response.needsTableIds] };
}
export async function applyAnalysis(workspace, response) {
    const analysis = await validateAnalysis(workspace, response);
    return { ...addFields(workspace, analysis.fields), materials: analysis.materials, analysisProposal: null, analysisRequests: analysis.questions, needsTableIds: analysis.needsTableIds };
}

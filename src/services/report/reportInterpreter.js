import { fingerprint } from './collectionForms.js';
import { prepareAiReview, setNotes } from './reportEngine.js';

const snapshot = workspace => ({ sourceSha256: workspace.source.sha256, projectId: workspace.projectId, revision: workspace.revision,
    discipline: workspace.discipline || 'electrical',
    fields: workspace.fields, values: workspace.values, rules: workspace.rules, notes: workspace.notes, narrativeValues: workspace.narrativeValues || {},
    materialReceipts: workspace.materialReceipts || {}, valueOrigins: workspace.valueOrigins || {}, collectedEvidence: workspace.collectedEvidence || [] });

// The app can later supply an API adapter. This module itself never makes network requests.
export async function createInterpretationRequest(workspace) {
    return {
        ...prepareAiReview(workspace), kind: 'jindan-interpretation-request', version: 1, projectId: workspace.projectId, discipline: workspace.discipline || 'electrical',
        inputFingerprint: await fingerprint(snapshot(workspace)),
        instructions: '검증된 측정값과 계산 결과를 근거로 진단 내용·종합 의견·개선 내용의 초안을 작성한다. 담당자가 한글에서 최종 수정한다. notes는 전체 요약이고 narrativeTargets의 각 문단은 해당 설비·분야·기간에 맞추어 fieldNotes에 개별 작성한다. 같은 종합 문장을 모든 문단에 반복하지 않는다. 법령·판정 기준·예산을 추측하지 않는다. 부족한 자료는 questions에 요청하고 해당 평가는 검토 필요로 표시한다. 문서의 서식·XML은 수정하지 않는다.',
        responseContract: { kind: 'jindan-interpretation', version: 1, projectId: workspace.projectId, sourceSha256: workspace.source.sha256,
            schemaRevision: workspace.revision, inputFingerprint: await fingerprint(snapshot(workspace)),
            notes: { diagnosis: '', conclusion: '', improvements: '' }, fieldNotes: [], evidenceFieldIds: [], questions: [] },
    };
}
export async function validateInterpretation(workspace, response) {
    if (response?.kind !== 'jindan-interpretation' || response.version !== 1 || response.projectId !== workspace.projectId || response.sourceSha256 !== workspace.source.sha256 || response.schemaRevision !== workspace.revision || response.inputFingerprint !== await fingerprint(snapshot(workspace))) throw new Error('현재 프로젝트·양식·측정 데이터와 일치하지 않는 해석 결과입니다. 최신 데이터로 다시 요청하세요.');
    if (!response.notes || !['diagnosis', 'conclusion', 'improvements'].every(key => typeof response.notes[key] === 'string' && response.notes[key].length <= 200000) || !Array.isArray(response.evidenceFieldIds) || response.evidenceFieldIds.some(id => !workspace.fields.some(field => field.id === id)) || !Array.isArray(response.questions) || response.questions.some(question => typeof question !== 'string' || question.length > 4000)) throw new Error('진단 해석 결과의 문구·근거·자료 요청 형식이 올바르지 않습니다.');
    if (Object.values(response.notes).some(note => note.trim()) && !response.evidenceFieldIds.length) throw new Error('진단 문구의 근거 입력항목이 없습니다.');
    if (response.fieldNotes != null) {
        if (!Array.isArray(response.fieldNotes) || response.fieldNotes.length > workspace.fields.length || new Set(response.fieldNotes.map(item => item?.fieldId)).size !== response.fieldNotes.length) throw new Error('문단별 진단 초안 형식이 올바르지 않습니다.');
        for (const item of response.fieldNotes) {
            const target = workspace.fields.find(field => field.id === item?.fieldId);
            if (!target?.valueSource || target.valueSource === 'input' || typeof item.text !== 'string' || item.text.length > 200000 || !Array.isArray(item.evidenceFieldIds) || item.evidenceFieldIds.some(id => !workspace.fields.some(field => field.id === id && (!field.valueSource || field.valueSource === 'input'))) || (item.text.trim() && !item.evidenceFieldIds.length)) throw new Error('문단별 진단의 대상 위치·내용·근거가 올바르지 않습니다.');
        }
    }
    return structuredClone(response);
}
export async function applyInterpretation(workspace, response) {
    const reviewed = await validateInterpretation(workspace, response);
    // Store the proposal and its questions; a generated report always remains a draft for human review.
    const narrativeValues = Object.fromEntries((reviewed.fieldNotes || []).map(item => [item.fieldId, item.text]));
    return { ...setNotes(workspace, reviewed.notes), narrativeValues, interpretation: reviewed, interpretationStale: false };
}

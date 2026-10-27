import { schemaErrors, startNewRun } from './reportEngine.js';
import { reportSection } from './reportSections.js';
import { collectionFields } from './reportWorkflow.js';

export const htmlEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export async function fingerprint(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export const inputFields = workspace => workspace.fields.filter(field => !field.valueSource || field.valueSource === 'input');
export async function schemaFingerprint(workspace) {
    return fingerprint({ projectId: workspace.projectId, discipline: workspace.discipline || 'electrical', sourceSha256: workspace.source.sha256, fields: workspace.fields, rules: workspace.rules });
}
export async function createCollectionForm(workspace, { scope = 'all' } = {}) {
    if (!['all', 'manual'].includes(scope)) throw new Error('조사 양식의 범위를 확인하세요.');
    const errors = schemaErrors(workspace);
    if (workspace.confirmedRevision !== workspace.revision || errors.length) throw new Error('입력 양식을 확인·확정한 후 조사 양식을 저장하세요.');
    const fields = collectionFields(workspace, scope);
    const schema = await schemaFingerprint(workspace);
    return {
        kind: 'jindan-collection', version: 1, projectId: workspace.projectId, projectTitle: workspace.projectTitle,
        discipline: workspace.discipline || 'electrical', disciplineLabel: reportSection(workspace.discipline).label,
        sourceSha256: workspace.source.sha256, schemaRevision: workspace.revision, collectionScope: scope,
        schemaFingerprint: scope === 'all' ? schema : await fingerprint({ schema, scope, fieldIds: fields.map(field => field.id) }),
        fields: fields.map(({ id, label, group, type, unit, required }) => ({ id, label, group, type, unit, required })),
        values: Object.fromEntries(fields.map(field => [field.id, ''])),
        notes: { diagnosis: '', conclusion: '', improvements: '' },
    };
}
export async function importCollectionData(workspace, data) {
    if (workspace.confirmedRevision !== workspace.revision) throw new Error('현재 입력 양식을 먼저 확정하세요.');
    if ((data?.discipline || 'electrical') !== (workspace.discipline || 'electrical')) throw new Error('현재 분야와 일치하지 않는 조사 데이터입니다. 해당 분야 메뉴에서 가져오세요.');
    const expected = await createCollectionForm(workspace, { scope: data?.collectionScope || 'all' });
    if (data?.kind !== 'jindan-collection' || data.version !== 1 || data.projectId !== workspace.projectId || data.sourceSha256 !== workspace.source.sha256 || data.schemaRevision !== workspace.revision || data.schemaFingerprint !== expected.schemaFingerprint) throw new Error('현재 프로젝트·보고서·입력 양식 버전과 일치하지 않는 조사 데이터입니다.');
    const fields = collectionFields(workspace, data.collectionScope || 'all');
    if (!data.values || typeof data.values !== 'object' || Array.isArray(data.values) || Object.keys(data.values).length !== fields.length || fields.some(field => !Object.hasOwn(data.values, field.id)) || Object.values(data.values).some(value => typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value)))) throw new Error('조사 데이터의 항목 목록 또는 값이 올바르지 않습니다.');
    if (data.notes && (!['diagnosis', 'conclusion', 'improvements'].every(key => typeof data.notes[key] === 'string') || Object.keys(data.notes).some(key => !['diagnosis', 'conclusion', 'improvements'].includes(key)))) throw new Error('조사 메모 형식이 올바르지 않습니다.');
    const next = startNewRun(workspace);
    const values = Object.fromEntries(fields.map(field => [field.id, String(data.values[field.id])]));
    const scoped = data.collectionScope === 'manual';
    const origins = Object.fromEntries(fields.map(field => [field.id, { kind: 'user-form', filename: data.collectedFrom?.filename || '조사 양식', receivedAt: new Date().toISOString() }]));
    return { ...next, values: scoped ? { ...workspace.values, ...values } : values,
        valueOrigins: scoped ? { ...workspace.valueOrigins, ...origins } : origins,
        collectedEvidence: scoped ? workspace.collectedEvidence || [] : [], materialReceipts: scoped ? workspace.materialReceipts || {} : {},
        interpretationStale: scoped && !!workspace.interpretation,
        notes: scoped ? { ...workspace.notes, ...Object.fromEntries(Object.entries(data.notes || {}).filter(([, text]) => text.trim())) } : data.notes ? structuredClone(data.notes) : next.notes };
}

export function collectionFormHtml(form) {
    const e = htmlEscape;
    const embedded = JSON.stringify(form).replace(/[<>&\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${e(form.projectTitle)} ${e(form.disciplineLabel || "전기")} 빈 진단 조사 양식</title><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>body{font:14px/1.6 sans-serif;color:#172033;max-width:1100px;margin:30px auto;padding:20px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #a7b3c4;padding:10px;text-align:left}td:first-child{width:52%}small{display:block;color:#59677a}textarea,input{width:100%;box-sizing:border-box;font:inherit;padding:8px;border:1px solid #a7b3c4;min-height:42px}textarea{resize:vertical}button{padding:10px 18px;margin:8px;background:#285ed4;border:0;color:white;border-radius:6px}.notice{background:#edf3fc;padding:14px}tr{break-inside:avoid}@media print{.tools{display:none}body{margin:0;padding:0}textarea,input{border:0;min-height:65px}thead{display:table-header-group}.notice{background:white}}</style></head><body><h1>${e(form.projectTitle)} · ${e(form.disciplineLabel || "전기")} 진단 조사 양식</h1><p class="notice">원본 보고서에서 확정한 입력항목입니다. 화면에 새 측정값을 입력하고 ‘작성 데이터 저장’을 누른 뒤 앱에서 가져오세요. 종이로 출력해 조사할 수도 있습니다. 이 파일을 닫기 전에 데이터를 저장하세요.</p><p>조사자: ____________________  조사일: ____________________</p><small>양식 버전 ${e(form.schemaRevision)} / 원본 ${e(form.sourceSha256)}<br>양식 식별값 ${e(form.schemaFingerprint)}</small><div class="tools"><button id="print" type="button">인쇄 / PDF 저장</button><button id="save" type="button">작성 데이터 저장</button><p id="status" role="status"></p></div><table><thead><tr><th>설비·측정항목</th><th>새 진단 데이터</th><th>단위</th></tr></thead><tbody>${form.fields.map((field, index) => `<tr><td>${e(field.group)}<br><strong>${e(field.label)}${field.required ? ' *' : ''}</strong><small>${e(field.type === 'number' ? '숫자 입력 (단위 제외)' : field.type === 'date' ? '날짜' : '문자·현장 기록')}</small></td><td>${field.type === 'date' ? `<input aria-label="${e(field.label)}" id="field-${index}" type="date">` : `<textarea aria-label="${e(field.label)}" id="field-${index}" rows="2"${field.type === 'number' ? ' inputmode="decimal"' : ''}></textarea>`}</td><td>${e(field.unit || '미지정')}</td></tr>`).join('')}</tbody></table>${Object.entries({ diagnosis: '현장 관찰·진단 메모', conclusion: '협의·종합 의견 메모', improvements: '개선 요청·공사·예산 및 근거' }).map(([key, label]) => `<label>${e(label)}<textarea id="note-${key}" rows="4"></textarea></label>`).join('')}<script type="application/json" id="form-data">${embedded}</script><script>(()=>{'use strict';const form=JSON.parse(document.getElementById('form-data').textContent);document.getElementById('print').addEventListener('click',()=>window.print());document.getElementById('save').addEventListener('click',()=>{const result={...form,values:Object.fromEntries(form.fields.map((field,index)=>[field.id,document.getElementById('field-'+index).value])),notes:Object.fromEntries(['diagnosis','conclusion','improvements'].map(key=>[key,document.getElementById('note-'+key).value]))};const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=(form.disciplineLabel||'전기')+'-작성-조사데이터.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);document.getElementById('status').textContent='작성 데이터를 파일로 저장했습니다. 앱의 작성 데이터 가져오기에서 선택하세요.';});})();</script></body></html>`;
}

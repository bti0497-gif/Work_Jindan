import { analyzeReport } from './sourceParser.js';

export const ELECTRICAL_SECTIONS = [
    { id: 'kepco', title: '최근 3개년 한전 플래너', accept: '.xlsx,.csv,.pdf', hint: '계약·요금 정보, 월별 사용량·최대수요·역률 등 원본과 집계자료. 3개년의 실제 시작·종료 기간을 기록합니다.', output: '기간별 비교·요금 및 사용 특성 요약 → 진단 → 절약방법', pattern: /한전|플래너|전력\s*사용|전력량|전기\s*요금|최대\s*(?:수요|전력)|계약\s*전력/ },
    { id: 'thermal', title: '열화상 측정', accept: '.bmt,.pdf,.csv,.xlsx,.jpg,.jpeg,.png', hint: 'IRSoft에서 사용자가 탐지점을 재지정한 BMT와 측정점 결과표, 배율·위치를 조정해 내보낸 최종 사진을 받습니다. 촬영일·방사율·반사온도·측정지점·부하를 함께 확인합니다.', output: '사용자가 확정한 탐지점·사진 연결 → 결과표 수치 검토 → 요약·진단·개선안', pattern: /열화상|적외선|온도\s*상승|과열/ },
    { id: 'quality', title: '전력품질 측정', accept: '.pwv,.csv,.xlsx,.pdf', hint: 'PWV 원본 또는 장비 내보내기 파일, 지점·측정기간·CT/PT 설정. 단위·환산·제외구간을 검증합니다.', output: '전압·전류·역률·고조파·불평형 등 요약 → 진단 → 관리·개선', pattern: /전력\s*품질|고조파|THD|불평형|전압\s*변동/ },
    { id: 'insulation', title: '절연저항 직접 측정', accept: '.xlsx,.csv,.pdf,.hwpx', hint: '직접 작성한 엑셀: 설비·측정점, 일시, 시험전압, 측정값과 단위, 측정조건을 함께 확인합니다.', output: '설비별 측정표 → 기준·조건 확인 → 판정 및 관리요점', pattern: /절연\s*저항|절연\s*측정/ },
    { id: 'current', title: '운전전류 직접 측정', accept: '.xlsx,.csv,.pdf,.hwpx', hint: '직접 작성한 엑셀: 설비·정격, 상별 운전전류, 부하조건·운전상태와 측정일시를 확인합니다.', output: '정격·상별 전류 비교 → 이상 여부 → 관리요점', pattern: /운전\s*전류|부하\s*전류|전류\s*측정|전동기\s*전류/ },
    { id: 'equipment', title: '전기기기·계측기 목록과 점검', accept: '.xlsx,.csv,.pdf,.hwpx', hint: '기기·계측기 목록, 태그·위치·규격, 이상 유무·증상·사진과 확인 근거를 받습니다.', output: '기기·계측기별 현황 → 이상 유무 확인 → 정비·교체 검토', pattern: /전기\s*(?:기기|설비)|계측\s*기|계장|수배전|배전반|점검\s*결과/ },
    { id: 'management', title: '일반 관리요령', accept: '.hwpx,.pdf,.xlsx,.csv', hint: '시설의 운전·점검 절차와 관리 현황. 전회 권고의 현재 이행 여부, 적용 기준과 확인일을 기록합니다.', output: '현재 관리상태 확인 → 정기점검·예방보전 요령', pattern: /관리\s*(?:요령|요점|방안)|유지\s*관리|예방\s*보전|정기\s*점검/ },
    { id: 'improvement', title: '금회 개선사항 협의', accept: '.hwpx,.pdf,.xlsx,.csv', hint: '금회 반영할 개선 제안의 대상·문제·근거·방법·예상효과와 협의 결과를 정리합니다.', output: '제안 → 협의 → 합의 문구 확정 → 보고서 반영', pattern: /개선\s*(?:방안|사항|대책)|절감\s*방안|절약\s*방법|에너지\s*절감/ },
];

/** Keyword matches locate review candidates only; no judgement, values or replacement is inferred. */
export async function inspectElectricalSource(bytes, filename) {
    const document = await analyzeReport(bytes, filename);
    if (document.format !== 'hwpx') throw new Error('교체 위치 준비에는 HWPX 원본이 필요합니다.');
    return electricalCandidates(document);
}
export function electricalCandidates(document) {
    const candidates = [], limit = 800;
    let totalMatches = 0;
    const add = (kind, item, text, context = '') => {
        const sections = ELECTRICAL_SECTIONS.filter(section => section.pattern.test(text)).map(section => section.id);
        if (!sections.length) return;
        totalMatches++;
        if (candidates.length >= limit) return;
        candidates.push({ id: item.id, kind, sections, excerpt: text.slice(0, 900), context: context.slice(-250),
            anchor: item.anchor, ...(kind === 'table' ? { rows: item.rows, columns: item.columns, cells: item.cells.map(cell => ({ id: cell.id, row: cell.row, column: cell.column, rowSpan: cell.rowSpan, colSpan: cell.colSpan })) } : {}) });
    };
    let context = '';
    for (const paragraph of document.paragraphs) {
        if (paragraph.tableId) continue;
        if (/^(?:제\s*\d+\s*장|\d+(?:\.\d+)+)\s*/.test(paragraph.text)) context = paragraph.text;
        add('paragraph', paragraph, paragraph.text, context);
    }
    for (const table of document.tables) add('table', table, `${table.title || ''}\n${table.cells.map(cell => cell.text).join(' | ')}`, table.title || '');
    return { source: document.source, candidates, totalMatches, truncated: totalMatches > limit, status: 'candidates', reportReady: false };
}
export function electricalPdfCandidates(analysis,projectId,settings={}) {
    if(analysis?.schema!=='jindan-pdf-analysis/1'||analysis.projectId!==projectId)throw new Error('현재 프로젝트의 PDF 분석을 선택하세요.');
    const pages=analysis.pages.filter(page=>(settings.disciplines?.[page.number]||page.discipline)==='electrical');
    const document={source:analysis.source,paragraphs:[],tables:[]};
    for(const page of pages){
        for(const [index,line]of(page.ocr?.mergedLines||page.lines).entries())document.paragraphs.push({id:`pdf:p${page.number}:line${index}`,text:line.text,anchor:{pdfPage:page.number,bbox:line.bbox}});
        for(const table of page.tables)document.tables.push({...table,title:`PDF ${page.number}쪽 표`,anchor:{pdfPage:page.number,bbox:table.bbox}});
    }
    const result=electricalCandidates(document);
    const incomplete=pages.some(page=>page.kind==='scan'||page.images.some(i=>i.kind==='text-raster')&&!page.ocr);
    return {...result,truncated:result.truncated||incomplete,incompletePdfText:incomplete,entryId:`pdf:${analysis.source.materialId}`,materialId:analysis.source.materialId,relativePath:analysis.source.filename};
}
export function linkElectricalInput(material, sectionId) {
    const section = ELECTRICAL_SECTIONS.find(section => section.id === sectionId);
    if (!section || !material?.id || !/^[a-f0-9]{64}$/i.test(material.sha256 || '')) throw new Error('입력자료의 원본 연결을 확인하세요.');
    if (!section.accept.split(',').includes(`.${material.format}`)) throw new Error(`${section.title}에 맞는 파일 형식을 선택하세요.`);
    return { materialId: material.id, sha256: material.sha256, filename: material.filename, linkedAt: new Date().toISOString() };
}
export function electricalPlanIsCurrent(plan, signature, entries) {
    return !!plan && plan.signature === signature && plan.files.every(file => entries.some(entry => entry.id === file.entryId && entry.sha256 === file.source.sha256));
}

export function resolveKepcoScope(state = {}, planIsCurrent = false) {
    if (['include', 'exclude'].includes(state.kepcoMode)) return { mode: state.kepcoMode, reason: '사용자 지정' };
    if (state.inputs?.kepco?.length || state.periodStart || state.periodEnd) return { mode: 'include', reason: '기존에 연결한 한전 자료·조회 기간 유지' };
    const plan = state.plan;
    if (!planIsCurrent || !plan?.files?.length) return { mode: 'pending', reason: '기준 보고서 분석 후 항목 유무를 확인합니다.' };
    const matches = plan.files.reduce((sum, file) => sum + file.candidates.filter(candidate => candidate.sections.includes('kepco')).length, 0);
    if (matches) return { mode: 'include', reason: `기준 보고서에서 한전·사용정보 관련 후보 ${matches}개 확인 · 원문 검토 필요` };
    if (plan.failures?.length || plan.files.some(file => file.truncated)) return { mode: 'pending', reason: '분석 누락 또는 후보 한도가 있어 항목 부재를 확정할 수 없습니다.' };
    return { mode: 'exclude', reason: '분석한 HWPX에서 관련 표·문단 후보가 없어 자료 요청을 생략합니다. 이미지·PDF 내용은 원문에서 확인하세요.' };
}

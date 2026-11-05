export const RETENTION_PURPOSES={ 'static-label':'고정 라벨·양식 문구', 'fixed-asset':'승인한 고정 그림·자산', 'historical-comparison':'전회 비교자료로 명시', 'current-reverified':'금회 근거로 재확인' };
export const historicalDataRisk=text=>/^\s*[+-]?(?:\d[\d,]*(?:\.\d+)?)(?:\s*[-~∼]\s*[+-]?\d+(?:\.\d+)?)?\s*$/.test(text||'')||/^\s*(?:정상|비정상|불량|적정|부적정|양호|적합|부적합|이상\s*없음|합격|불합격|OK|NG|PASS|FAIL)\s*$/i.test(text||'')||/(?:19|20)\d{2}|\d[\d.,]*\s*(?:%|℃|kW|mg\s*\/\s*L|m³|MΩ|V\b|A\b)|과거|전회|양호|불량|적합|부적합|판단됨|판정됨|결론/.test(text||'');
export function retentionBlockers({decision,contentRole,kind,sourceText,retentionPurpose,note,evidence=[]}){
    if(decision!=='keep')return [];
    const sensitive=['measurement','diagnosis','improvement','context'].includes(contentRole)||historicalDataRisk(sourceText)||kind==='picture';
    if(!retentionPurpose)return sensitive?['유지 목적 확인 필요 · 과거 값을 금회 결과로 자동 재사용할 수 없음']:[];
    if(!Object.hasOwn(RETENTION_PURPOSES,retentionPurpose))throw new Error('유지 목적을 확인하세요.');
    if(retentionPurpose==='fixed-asset')return kind==='picture'?[]:['고정 자산 유지는 그림에만 지정하세요.'];
    if(retentionPurpose==='static-label')return kind==='picture'||['measurement','diagnosis','improvement'].includes(contentRole)||historicalDataRisk(sourceText)?['측정·판정·개선 역할 또는 과거 값은 고정 라벨로 유지할 수 없음 · 실제 라벨이면 내용 역할부터 정정하세요']:[];
    if(retentionPurpose==='current-reverified')return [...(!evidence.length?['금회 재확인 근거자료 연결 필요']:[]),...(!note?.trim()?['금회 재확인 근거 설명 필요']:[])];
    return kind==='picture'?['비교 그림은 별도 자료로 연결하고 원문 그림은 제외하거나 고정 자산으로 검토하세요.']:!note?.trim()?['전회 비교자료의 기준 시점·사용 목적 설명 필요']:[];
}

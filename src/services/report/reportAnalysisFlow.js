import { createAnalysisRequest, validateAnalysis } from './reportAnalyzer.js';

// Ask for details only once per requested table; reuse the index and merge proposals into one reviewable plan.
export async function analyzeWorkflow(workspace, execute, { tableIds = [], previous = null, onProgress = () => {}, active = () => true } = {}) {
    let merged = null, lastAi;
    const visited = new Set(), pending = new Set(tableIds);
    let first = true, requests = 0;
    while (first || pending.size) {
        if (!active()) throw new Error('보고서 분석이 취소되었거나 입력 내용이 바뀌었습니다.');
        const batch = [...pending].filter(id => !visited.has(id)).slice(0, 2);
        if (!first && !batch.length) break;
        first = false; batch.forEach(id => { visited.add(id); pending.delete(id); });
        const request = await createAnalysisRequest(workspace, batch);
        if (batch.length) { request.paragraphIndex = []; request.tableIndex = request.tableIndex.filter(table => batch.includes(table.id)); }
        onProgress({ requests: ++requests, tablesRead: visited.size, pending: pending.size });
        const result = await execute(request);
        await validateAnalysis(workspace, result.response);
        if (!merged) merged = { ...result.response, fields: [], materials: [], questions: [], needsTableIds: [] };
        const prior = previous?.inputFingerprint === request.inputFingerprint ? previous : null;
        previous = null;
        merged.fields = [...new Map([...(prior?.fields || []), ...merged.fields, ...result.response.fields].map(field => [`${field.targetId}@${field.slotId || ''}`, field])).values()];
        merged.materials = [...new Map([...(prior?.materials || []), ...merged.materials, ...(result.response.materials || [])].map(item => [JSON.stringify([item.label, item.source, item.targetIds]), item])).values()];
        merged.questions = [...new Set([...(prior?.questions || []), ...merged.questions, ...result.response.questions])];
        for (const id of [...(prior?.needsTableIds || []), ...result.response.needsTableIds]) {
            if (!visited.has(id)) pending.add(id);
            else if (!batch.includes(id)) merged.questions.push(`이미 분석한 표 ${id}의 추가 확인이 필요합니다.`);
        }
        lastAi = { model: result.model, cacheHit: result.cacheHit, usage: result.usage, generatedAt: new Date().toISOString(), requests };
    }
    merged.needsTableIds = [...pending];
    await validateAnalysis(workspace, merged);
    return { response: merged, lastAi };
}

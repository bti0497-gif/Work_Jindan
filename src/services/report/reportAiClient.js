async function invoke(channel, data) {
    if (!window.electron?.invoke) throw new Error('AI 연결은 설치형 앱에서 사용할 수 있습니다.');
    const result = await window.electron.invoke(channel, data);
    if (result === undefined && channel !== 'report-ai-cancel') throw new Error('AI 연결을 적용하려면 앱을 다시 실행하세요.');
    return result;
}
export const getReportAiStatus = () => invoke('report-ai-status');
export const configureReportAi = config => invoke('report-ai-configure', config);
export const listReportAiModels = () => invoke('report-ai-models');
export function startReportAi(request) {
    const id = crypto.randomUUID();
    return { id, result: invoke('report-ai-run', { id, request }), cancel: () => invoke('report-ai-cancel', { id }) };
}

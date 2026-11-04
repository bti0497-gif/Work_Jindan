async function invoke(channel, data) {
    if (!window.electron?.invoke) throw new Error('AI 연결은 설치형 앱에서 사용할 수 있습니다.');
    const result = await window.electron.invoke(channel, data);
    if (result === undefined && channel !== 'report-ai-cancel') throw new Error('AI 연결을 적용하려면 앱을 다시 실행하세요.');
    return result;
}
export const getReportAiStatus = async () => {
    const status=await invoke('report-ai-status');
    if(status?.provider!=='openai')throw new Error('OpenAI 연결을 적용하려면 개발앱을 완전히 종료한 뒤 다시 실행하세요.');
    return status;
};
export const configureReportAi = async config => {await getReportAiStatus();return invoke('report-ai-configure', config);};
export const listReportAiModels = async () => {await getReportAiStatus();return invoke('report-ai-models');};
export function startReportAi(request) {
    const id = crypto.randomUUID();
    const controller=new AbortController();
    return { id, result: getReportAiStatus().then(()=>{if(controller.signal.aborted)throw new Error('AI 요청을 취소했습니다.');return invoke('report-ai-run', { id, request });}), cancel: () => {controller.abort();return invoke('report-ai-cancel', { id });} };
}

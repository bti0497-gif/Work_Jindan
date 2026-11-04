import { useEffect, useState } from 'react';
import { configureReportAi, getReportAiStatus, listReportAiModels } from '../services/report/reportAiClient.js';

const noop=()=>{};
export default function ReportAiSettings({ onChange=noop }) {
    const [status, setStatus] = useState(null);
    const [model, setModel] = useState('gpt-6.1-terra');
    const [apiKey, setApiKey] = useState('');
    const [models, setModels] = useState([]);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        let active = true;
        getReportAiStatus().then(value => { if (active) { setStatus(value); setModel(value.model); onChange(value); } }).catch(error => { if (active) setMessage(error.message); });
        return () => { active = false; };
    }, [onChange]);
    const save = async () => {
        setBusy(true); setMessage('');
        try { const value = await configureReportAi({ model, apiKey }); setStatus(value); onChange(value); setApiKey(''); setMessage('AI 설정을 저장했습니다.'); }
        catch (error) { setMessage(error.message); }
        finally { setBusy(false); }
    };
    const check = async () => {
        setBusy(true); setMessage('');
        try { const values = await listReportAiModels(); setModels(values); setMessage(`OpenAI 연결 확인 · 사용 가능한 모델 ${values.length}개`); }
        catch (error) { setMessage(error.message); }
        finally { setBusy(false); }
    };
    return <details className="report-card" aria-label="OpenAI 연결 설정"><summary>보고서 AI 설정 · OpenAI · {status?.configured ? `${status.model} 설정됨` : '연결 설정 필요'}</summary>
        <p>AI 분석·초안 작성 버튼을 누르면 선택한 표·본문 또는 진단 데이터가 OpenAI로 전송됩니다. 생성된 내용은 담당자가 검토할 초안입니다.</p>
        <p>개발앱에서는 .env.local의 OPENAI_API_KEY를 사용합니다. 키를 입력한 뒤 ‘설정 상태 새로고침’을 누르세요.</p>
        <div className="report-form-row"><label>OpenAI 모델<input aria-label="OpenAI 모델" list="report-ai-models" value={model} onChange={event => setModel(event.target.value)} /><datalist id="report-ai-models">{models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</datalist></label>
            <label>API 키 {status?.configured ? '(변경할 때만 입력)' : ''}<input aria-label="OpenAI API 키" type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={status?.keySource === 'environment' ? 'OPENAI_API_KEY 설정 사용 중' : status?.configured ? '저장된 OpenAI 키 사용 중' : 'OpenAI API 키'} /></label></div>
        {status?.keySource==='environment'&&<p>.env.local 또는 환경 변수의 키를 우선 사용합니다. 키 변경은 해당 설정에서 해주세요.</p>}
        <button disabled={busy} onClick={async()=>{setBusy(true);try{const value=await getReportAiStatus();setStatus(value);setModel(value.model);onChange(value);setMessage(value.configured?'OpenAI 키 설정을 확인했습니다.':'OPENAI_API_KEY를 입력하세요.');}catch(error){setMessage(error.message);}finally{setBusy(false);}}}>설정 상태 새로고침</button>
        <div className="report-toolbar"><button disabled={busy} onClick={save}>설정 저장</button><button disabled={busy || !status?.configured || !!apiKey} onClick={check}>연결 확인 · 모델 목록</button></div>{message && <p role="status">{message}</p>}
    </details>;
}

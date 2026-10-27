import { useEffect, useState } from 'react';
import { configureReportAi, getReportAiStatus, listReportAiModels } from '../services/report/reportAiClient.js';

export default function ReportAiSettings({ onChange }) {
    const [status, setStatus] = useState(null);
    const [model, setModel] = useState('gemini-2.5-flash');
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
        try { const values = await listReportAiModels(); setModels(values); setMessage(`Gemini 연결 확인 · 사용 가능한 모델 ${values.length}개`); }
        catch (error) { setMessage(error.message); }
        finally { setBusy(false); }
    };
    return <details className="report-card"><summary>보고서 AI 설정 · {status?.configured ? `${status.model} 설정됨` : '연결 설정 필요'}</summary>
        <p>AI 분석·초안 작성 버튼을 누르면 해당 표·본문 또는 입력한 진단 데이터가 Google Gemini로 전송됩니다. 생성된 내용은 담당자가 수정할 초안입니다.</p>
        <div className="report-form-row"><label>Gemini 모델<input list="report-ai-models" value={model} onChange={event => setModel(event.target.value)} /><datalist id="report-ai-models">{models.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</datalist></label>
            <label>API 키 {status?.configured ? '(변경할 때만 입력)' : ''}<input type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={status?.keySource === 'environment' ? '기존 개발 환경 설정 사용 중' : status?.configured ? '저장된 키 사용 중' : 'Gemini API 키'} /></label></div>
        <div className="report-toolbar"><button disabled={busy} onClick={save}>설정 저장</button><button disabled={busy || !status?.configured || !!apiKey} onClick={check}>연결 확인 · 모델 목록</button></div>{message && <p role="status">{message}</p>}
    </details>;
}

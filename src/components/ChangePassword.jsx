import { useState } from 'react';
import { createPortal } from 'react-dom';
import { changeOwnPassword } from '../services/firebaseBoardAuth';

const ChangePassword = ({ onClose, showAlert }) => {
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [saving, setSaving] = useState(false);
    const inputStyle = { border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 12px', width: '100%', color: '#1e293b', background: '#fff' };
    const submit = async event => {
        event.preventDefault();
        if (saving) return;
        if (next !== confirm) return showAlert('새 비밀번호가 서로 다릅니다.');
        setSaving(true);
        try {
            await changeOwnPassword(current, next);
            onClose();
            await showAlert('비밀번호를 변경했습니다. 다음 로그인부터 새 비밀번호를 사용해 주세요.', '성공', 'success');
        } catch (error) { await showAlert(error.message, '변경 실패', 'error'); }
        finally { setSaving(false); }
    };
    return createPortal(<div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form role="dialog" aria-modal="true" aria-labelledby="change-password-title" onSubmit={submit} style={{ width: 360, background: '#fff', color: '#1e293b', padding: 24, borderRadius: 12, display: 'grid', gap: 12 }}>
            <h2 id="change-password-title" style={{ fontSize: 18 }}>비밀번호 변경</h2>
            <label htmlFor="current-password">현재 비밀번호</label>
            <input id="current-password" style={inputStyle} type="password" autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value)} required autoFocus />
            <label htmlFor="next-password">새 비밀번호</label>
            <input id="next-password" style={inputStyle} type="password" autoComplete="new-password" value={next} onChange={event => setNext(event.target.value)} minLength={4} required />
            <label htmlFor="confirm-password">새 비밀번호 확인</label>
            <input id="confirm-password" style={inputStyle} type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} minLength={4} required />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, paddingTop: 12 }}>
                <button type="button" style={{ padding: '10px 16px', border: '1px solid #cbd5e1', borderRadius: 8 }} onClick={onClose} disabled={saving}>취소</button>
                <button type="submit" style={{ padding: '10px 16px', color: '#fff', background: '#2563eb', borderRadius: 8 }} disabled={saving}>{saving ? '변경 중...' : '변경하기'}</button>
            </div>
        </form>
    </div>, document.body);
};
export default ChangePassword;

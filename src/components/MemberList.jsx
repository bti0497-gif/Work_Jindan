import { useState, useEffect } from 'react';
import { firebaseMemberService } from '../services/firebaseMemberService';
import { Users, RefreshCw, ChevronLeft, ChevronRight, User, Hash, Calendar, ShieldCheck, Trash2, UserPlus, Edit3, X, Save } from 'lucide-react';

const MemberList = ({ showAlert, showConfirm, onDataChange }) => {
    const [members, setMembers] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const emptyForm = { person_id: '', password: '', name: '', position: '사원', role: 'user' };
    const [formData, setFormData] = useState(emptyForm);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchMembers = async () => {
        setLoading(true); setError(null);
        try { setMembers(await firebaseMemberService.list()); }
        catch (err) { setError(`회원 목록을 불러오지 못했습니다: ${err.message}`); }
        finally { setLoading(false); }
    };
    useEffect(() => { const frame = requestAnimationFrame(fetchMembers); return () => cancelAnimationFrame(frame); }, []);
    const handleSelectAll = event => setSelectedIds(event.target.checked ? new Set(members.map(member => member.person_id)) : new Set());
    const handleSelectMember = id => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };
    const handleDelete = async () => {
        if (!selectedIds.size || !await showConfirm(`선택한 ${selectedIds.size}명의 계정을 비활성화하시겠습니까?`)) return;
        try {
            await firebaseMemberService.deactivate(members.filter(member => selectedIds.has(member.person_id)));
            await fetchMembers(); setSelectedIds(new Set());
            await showAlert('계정을 비활성화했습니다.', '성공', 'success');
            onDataChange?.();
        } catch (err) { await showAlert(`처리 실패: ${err.message}`, '오류', 'error'); }
    };
    const openAddModal = () => { setIsEditMode(false); setFormData(emptyForm); setShowModal(true); };
    const openEditModal = () => {
        if (selectedIds.size !== 1) return;
        const member = members.find(item => item.person_id === [...selectedIds][0]);
        if (member) { setIsEditMode(true); setFormData({ ...member, password: '' }); setShowModal(true); }
    };
    const handleFormSubmit = async event => {
        event.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            if (!isEditMode && members.some(member => member.person_id === formData.person_id)) throw new Error('이미 존재하는 아이디입니다.');
            const existing = isEditMode ? members.find(member => member.person_id === formData.person_id) : null;
            await firebaseMemberService.save(formData, existing);
            await fetchMembers(); setShowModal(false); setSelectedIds(new Set());
            await showAlert(isEditMode ? '수정되었습니다.' : '회원 계정이 등록되었습니다.', '성공', 'success');
            onDataChange?.();
        } catch (err) { await showAlert(`저장 실패: ${err.message}`, '오류', 'error'); }
        finally { setIsSubmitting(false); }
    };

    return (
        <div className="board-list-container">
            {/* Header: Title & Refresh */}
            <div className="board-header">
                <div>
                    <h1 className="board-title">회원관리</h1>
                    <p className="post-count">총 {members.length}명의 팀원</p>
                </div>
                <button className="refresh-btn" onClick={fetchMembers} disabled={loading}>
                    <RefreshCw size={16} className={loading ? 'spin' : ''} />
                </button>
            </div>

            {/* Member Table Body */}
            <div className="board-body member-table-body">
                {loading ? (
                    <div className="status-container font-loading">
                        <RefreshCw size={32} className="spin text-blue-500" />
                        <p>멤버 리스트 동기화 중...</p>
                    </div>
                ) : error ? (
                    <div className="status-container error">
                        <p>{error}</p>
                        <button onClick={fetchMembers}>다시 시도</button>
                    </div>
                ) : members.length === 0 ? (
                    <div className="status-container empty">
                        <Users size={48} className="text-slate-200" />
                        <p>등록된 회원이 없습니다.</p>
                    </div>
                ) : (
                    <div className="member-table-wrapper">
                        <table className="member-table">
                            <thead>
                                <tr>
                                    <th className="w-10">
                                        <input
                                            type="checkbox"
                                            onChange={handleSelectAll}
                                            checked={members.length > 0 && selectedIds.size === members.length}
                                        />
                                    </th>
                                    <th className="w-16"><Hash size={14} /> No</th>
                                    <th><User size={14} /> 아이디</th>
                                    <th><Users size={14} /> 이름 / 직급</th>
                                    <th className="w-40"><Calendar size={14} /> 가입날짜</th>
                                </tr>
                            </thead>
                            <tbody>
                                {members.map((member, index) => (
                                    <tr key={member.person_id || index} className={selectedIds.has(member.person_id) ? 'selected-row' : ''}>
                                        <td className="text-center">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(member.person_id)}
                                                onChange={() => handleSelectMember(member.person_id)}
                                            />
                                        </td>
                                        <td className="text-center font-bold text-slate-400">{index + 1}</td>
                                        <td className="font-medium text-slate-700">{member.person_id}</td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold">{member.name}</span>
                                                <span className="text-[11px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
                                                    {member.position}
                                                </span>
                                                {member.position === '관리자' && <ShieldCheck size={14} className="text-blue-500" />}
                                            </div>
                                        </td>
                                        <td className="text-slate-500 text-xs">
                                            {new Date(member.joinDate || member.createdAt || '').toLocaleDateString('ko-KR', {
                                                year: 'numeric',
                                                month: '2-digit',
                                                day: '2-digit'
                                            })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Footer: Pagination & Actions (Fixed Consistency) */}
            <div className="board-footer">
                <div className="pagination">
                    <button className="page-btn disabled"><ChevronLeft size={16} /></button>
                    <button className="page-btn active">1</button>
                    <button className="page-btn"><ChevronRight size={16} /></button>
                </div>

                <div className="footer-right-actions">
                    <button
                        className="footer-action-btn delete"
                        disabled={selectedIds.size === 0}
                        onClick={handleDelete}
                    >
                        <Trash2 size={14} /> 삭제
                    </button>
                    <button
                        className="footer-action-btn edit"
                        disabled={selectedIds.size !== 1}
                        onClick={openEditModal}
                    >
                        <Edit3 size={14} /> 수정
                    </button>

                    <button className="footer-action-btn primary member-add" onClick={openAddModal}>
                        <UserPlus size={14} />
                        <span>회원추가</span>
                    </button>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .member-table-body {
                    padding: 0;
                }
                .member-table-wrapper {
                    overflow-x: auto;
                }
                .member-table {
                    width: 100%;
                    border-collapse: collapse;
                    text-align: left;
                }
                .member-table th {
                    background: #f8fafc;
                    padding: 12px 15px;
                    font-size: 13px;
                    font-weight: 700;
                    color: #64748b;
                    border-bottom: 2px solid #e2e8f0;
                    white-space: nowrap;
                }
                .member-table th svg { display: inline; vertical-align: middle; margin-right: 4px; }
                .member-table td {
                    padding: 14px 15px;
                    border-bottom: 1px solid #f1f5f9;
                    font-size: 14px;
                    color: #1e293b;
                }
                .member-table tr:hover { background: #fdfdfd; }
                .member-table tr.selected-row { background: #eff6ff; }
                
                .w-10 { width: 40px; text-align: center; }
                .w-16 { width: 64px; }
                .w-40 { width: 160px; }
                .text-center { text-align: center; }

                .footer-right-actions {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                }
                .footer-action-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 14px;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                    background: #fff;
                    font-size: 13px;
                    font-weight: 600;
                    color: #475569;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }
                .footer-action-btn:hover:not(:disabled) { 
                    background: #f8fafc; 
                    border-color: #cbd5e1;
                    transform: translateY(-1px);
                }
                .footer-action-btn.delete:hover:not(:disabled) { 
                    background: #fef2f2; 
                    border-color: #fecaca; 
                    color: #ef4444; 
                }
                .footer-action-btn.edit:hover:not(:disabled) { 
                    background: #f0f9ff; 
                    border-color: #bae6fd; 
                    color: #0284c7; 
                }
                .footer-action-btn.primary {
                    background: #3b82f6;
                    border-color: #2563eb;
                    color: #fff;
                }
                .footer-action-btn.primary:hover:not(:disabled) {
                    background: #2563eb;
                    border-color: #1d4ed8;
                    transform: translateY(-1px);
                }
                .footer-action-btn:disabled { 
                    opacity: 0.5; 
                    cursor: not-allowed; 
                    box-shadow: none;
                }

                .member-add {
                    margin-left: 5px;
                }

                /* Modal Styles */
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.4);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    animation: fadeIn 0.2s ease-out;
                }
                .modal-content {
                    background: #fff;
                    width: 100%;
                    max-width: 450px;
                    border-radius: 16px;
                    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
                    overflow: hidden;
                    animation: slideUp 0.3s cubic-bezier(0.165, 0.84, 0.44, 1);
                }
                .modal-header {
                    padding: 20px 24px;
                    border-bottom: 1px solid #f1f5f9;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .modal-title { font-size: 18px; font-weight: 800; color: #1e293b; margin: 0; }
                .modal-close { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; border-radius: 6px; }
                .modal-close:hover { background: #f1f5f9; color: #64748b; }

                .modal-form { padding: 24px; }
                .form-row { display: flex; gap: 16px; margin-bottom: 16px; }
                .form-group { display: flex; flex-direction: column; gap: 6px; }
                .form-group label { font-size: 13px; font-weight: 600; color: #64748b; }
                .form-group input, .form-select {
                    padding: 10px 12px;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                    font-size: 14px;
                    outline: none;
                    transition: all 0.2s;
                    color: #1e293b;
                }
                .form-group input:focus, .form-select:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
                .form-group input:disabled { background: #f8fafc; color: #94a3b8; cursor: not-allowed; }
                .flex-1 { flex: 1; }

                .modal-footer {
                    margin-top: 24px;
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                }
                .modal-btn-cancel {
                    padding: 10px 20px;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                    background: #fff;
                    font-size: 14px;
                    font-weight: 600;
                    color: #64748b;
                    cursor: pointer;
                }
                .modal-btn-cancel:hover { background: #f8fafc; }
                .modal-btn-save {
                    padding: 10px 24px;
                    border-radius: 8px;
                    border: none;
                    background: #3b82f6;
                    color: #fff;
                    font-size: 14px;
                    font-weight: 700;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s;
                }
                .modal-btn-save:hover { background: #2563eb; transform: translateY(-1px); }
                .modal-btn-save:disabled { opacity: 0.7; cursor: not-allowed; transform: none; }

                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            ` }} />

            {/* Member Form Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2 className="modal-title">{isEditMode ? '회원 정보 수정' : '새 회원 등록'}</h2>
                            <button type="button" className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleFormSubmit} className="modal-form">
                            <div className="form-row">
                                <div className="form-group flex-1">
                                    <label>아이디</label>
                                    <input
                                        type="text"
                                        value={formData.person_id}
                                        onChange={e => setFormData({ ...formData, person_id: e.target.value })}
                                        disabled={isEditMode}
                                        placeholder="아이디 입력"
                                        required
                                    />
                                </div>
                                {!isEditMode && <div className="form-group flex-1">
                                    <label>비밀번호</label>
                                    <input
                                        type="password"
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        placeholder="비밀번호 입력"
                                        required
                                    />
                                </div>}
                            </div>
                            <label style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={formData.role === 'admin'} onChange={event => setFormData({ ...formData, role: event.target.checked ? 'admin' : 'user' })} /> 관리자 권한</label>
                            <div className="form-row">
                                <div className="form-group flex-1">
                                    <label>이름</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="실명 입력"
                                        required
                                    />
                                </div>
                                <div className="form-group flex-1">
                                    <label>직급</label>
                                    <select
                                        value={formData.position}
                                        onChange={e => setFormData({ ...formData, position: e.target.value })}
                                        className="form-select"
                                    >
                                        <option value="사원">사원</option>
                                        <option value="과장">과장</option>
                                        <option value="부장">부장</option>
                                        <option value="이사">이사</option>
                                        <option value="전무">전무</option>
                                        <option value="관리자">관리자</option>
                                    </select>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="modal-btn-cancel" onClick={() => setShowModal(false)}>취소</button>
                                <button type="submit" className="modal-btn-save" disabled={isSubmitting}>
                                    {isSubmitting ? <RefreshCw size={16} className="spin" /> : <Save size={16} />}
                                    {isEditMode ? '수정하기' : '저장하기'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MemberList;

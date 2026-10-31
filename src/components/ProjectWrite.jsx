
import React, { useState, useRef, useEffect } from 'react';
import { getCurrentUser } from '../services/authService';
import { dbService } from '../services/dbService';
import { ArrowLeft, Save, X, Calendar, RefreshCw } from 'lucide-react';

const ProjectWrite = ({ onCancel, onSaveSuccess, initialData, showAlert }) => {
    const [title, setTitle] = useState(initialData?.title || '');
    const [startDate, setStartDate] = useState(initialData?.startDate || '');
    const [endDate, setEndDate] = useState(initialData?.endDate || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const editorRef = useRef(null);

    useEffect(() => {
        if (initialData && editorRef.current) {
            editorRef.current.innerHTML = initialData.content || '';
        }
    }, [initialData]);

    const handleSave = async () => {
        if (!title.trim() || !startDate || !endDate) {
            return showAlert('제목과 기간을 모두 입력해 주세요.');
        }

        const content = editorRef.current?.innerHTML || '';
        const user = getCurrentUser();

        try {
            const projectId = initialData?.id || crypto.randomUUID();
            const projectData = {
                id: projectId,
                title,
                startDate,
                endDate,
                content,
                author: initialData?.author || (user ? `${user.name} ${user.position}` : '익명'),
                authorId: initialData?.authorId || (user ? user.person_id : 'anonymous'),
                createdAt: initialData?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                menu: '프로젝트관리',
                fileId: initialData?.fileId || null
            };

            // 1. 로컬 DB 동기화 (즉시 반영 - 낙관적 업데이트)
            dbService.save('프로젝트관리', projectData);

            // 2. UI 즉시 대기 상태 해제 및 성공 알림
            if (onSaveSuccess) onSaveSuccess();
            showAlert(initialData ? '프로젝트가 수정되었습니다.' : '프로젝트가 등록되었습니다.', '성공', 'success');

            // Firebase 전송은 로컬 큐에서 재시도하며 Drive 연결을 기다리지 않는다.

        } catch (err) {
            showAlert(`저장 실패: ${err.message}`, '오류', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const execCmd = (command, value = null) => {
        document.execCommand(command, false, value);
    };

    return (
        <div className="bg-gray-50 flex justify-center w-full h-full">
            <div className="relative flex h-full w-full max-w-[650px] flex-col bg-white shadow-2xl overflow-hidden">
                {/* Header */}
                <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <button onClick={onCancel} className="p-2 hover:bg-gray-50 rounded-full">
                        <ArrowLeft size={20} className="text-gray-600" />
                    </button>
                    <h1 className="text-lg font-bold text-gray-900">
                        {initialData ? '프로젝트 수정' : '새 프로젝트 등록'}
                    </h1>
                    <div className="w-10"></div>
                </header>

                <main className="flex-1 overflow-y-auto p-6">
                    <div className="space-y-6">
                        {/* Title Input */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">프로젝트 명</label>
                            <input
                                type="text"
                                className="w-full text-xl font-bold border-none focus:ring-0 p-0 placeholder:text-gray-200"
                                placeholder="프로젝트 제목을 입력하세요"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>

                        {/* Date Range */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                    <Calendar size={12} /> 시작일
                                </label>
                                <input
                                    type="date"
                                    className="w-full border-gray-100 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                    <Calendar size={12} /> 종료일
                                </label>
                                <input
                                    type="date"
                                    className="w-full border-gray-100 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Content Editor */}
                        <div className="space-y-2 flex flex-col h-[400px]">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">주요 내용</label>
                            <div className="flex-1 border border-gray-100 rounded-xl overflow-hidden flex flex-col">
                                {/* Simple Toolbar */}
                                <div className="bg-gray-50 px-2 py-1.5 border-b border-gray-100 flex gap-0.5">
                                    <button onClick={() => execCmd('bold')} className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all"><span className="text-xs font-bold">B</span></button>
                                    <button onClick={() => execCmd('italic')} className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all italic text-xs">I</button>
                                    <button onClick={() => execCmd('underline')} className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all underline text-xs">U</button>
                                </div>
                                <div
                                    ref={editorRef}
                                    className="flex-1 p-4 outline-none overflow-y-auto text-sm leading-relaxed"
                                    contentEditable
                                    data-placeholder="프로젝트 상세 내용을 입력해 주세요..."
                                />
                            </div>
                        </div>
                    </div>
                </main>

                <footer className="p-4 border-t border-gray-100 bg-white flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 active:scale-95 transition-all"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSubmitting}
                        className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <RefreshCw size={16} className="spin" />
                        ) : (
                            <Save size={16} />
                        )}
                        {initialData ? '수정완료' : '등록하기'}
                    </button>
                </footer>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                [contenteditable]:empty:before {
                    content: attr(data-placeholder);
                    color: #cbd5e1;
                    cursor: text;
                }
            `}} />
        </div>
    );
};

export default ProjectWrite;

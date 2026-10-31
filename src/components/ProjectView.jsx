
import React from 'react';
import { ArrowLeft, User, Calendar, Edit, Trash2, Clock } from 'lucide-react';
import { getCurrentUser } from '../services/authService';
import { dbService } from '../services/dbService';

const ProjectView = ({ project, onBack, onEdit, onDeleteSuccess, showAlert, showConfirm }) => {
    const user = getCurrentUser();
    const isAuthor = user && (user.person_id === project.authorId || user.name === project.author);

    const handleDelete = async () => {
        const confirmed = await showConfirm('정말로 이 프로젝트를 삭제하시겠습니까?');
        if (!confirmed) return;

        try {
            // 로컬 삭제와 Firebase 삭제 큐를 함께 기록한다.
            dbService.remove('프로젝트관리', project.id);

            await showAlert('프로젝트가 삭제되었습니다.', '성공', 'success');
            if (onDeleteSuccess) onDeleteSuccess();
        } catch (err) {
            showAlert(`삭제 실패: ${err.message}`, '오류', 'error');
        }
    };

    return (
        <div className="board-view-container flex justify-center w-full h-full bg-gray-50 overflow-y-auto">
            <div className="w-full max-w-[650px] bg-white min-h-screen shadow-2xl flex flex-col">
                {/* Header */}
                <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
                    <button className="flex items-center gap-1.5 text-gray-600 hover:text-blue-600 font-bold transition-colors" onClick={onBack}>
                        <ArrowLeft size={18} />
                        <span className="text-sm">목록</span>
                    </button>
                    {isAuthor && (
                        <div className="flex gap-2">
                            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-blue-50 rounded-lg text-gray-600 hover:text-blue-600 transition-all font-medium text-sm">
                                <Edit size={16} />
                                <span>수정</span>
                            </button>
                            <button onClick={handleDelete} className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-red-50 rounded-lg text-gray-600 hover:text-red-600 transition-all font-medium text-sm">
                                <Trash2 size={16} />
                                <span>삭제</span>
                            </button>
                        </div>
                    )}
                </header>

                <main className="p-8">
                    {/* Project Header Info */}
                    <div className="mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="text-xs font-black text-blue-500 uppercase tracking-widest mb-2">Project Details</div>
                        <h1 className="text-2xl font-black text-slate-900 leading-tight mb-6">{project.title}</h1>

                        <div className="grid grid-cols-2 gap-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border border-slate-200 shadow-sm text-slate-400">
                                    <User size={14} />
                                </div>
                                <div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase">담당자</div>
                                    <div className="text-sm font-bold text-slate-700">{project.author}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border border-slate-200 shadow-sm text-slate-400">
                                    <Calendar size={14} />
                                </div>
                                <div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase">프로젝트 기간</div>
                                    <div className="text-sm font-bold text-slate-700">{project.startDate} ~ {project.endDate}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border border-slate-200 shadow-sm text-slate-400">
                                    <Clock size={14} />
                                </div>
                                <div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase">최종 업데이트</div>
                                    <div className="text-sm font-bold text-slate-700">
                                        {new Date(project.updatedAt || project.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Project Content */}
                    <div className="prose prose-slate max-w-none">
                        <div
                            className="text-slate-700 leading-relaxed min-h-[300px]"
                            dangerouslySetInnerHTML={{ __html: project.content }}
                        />
                    </div>
                </main>
            </div>
        </div>
    );
};

export default ProjectView;

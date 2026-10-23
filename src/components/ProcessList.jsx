
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService';
import { getProjectPeriodProgress } from '../services/scheduleService';
import { saveJsonData, saveActionLog } from '../services/dataService';
import { deleteFile } from '../services/driveService';
import { getCurrentUser } from '../services/authService';
import { Search, Plus, CheckCircle, Calendar, Briefcase, X, ChevronRight, RefreshCw, AlertCircle, Edit, Trash2 } from 'lucide-react';

const ProcessList = ({ showAlert, showConfirm }) => {
    // Selection state
    const [selectedProject, setSelectedProject] = useState(null);
    const [showProjectModal, setShowProjectModal] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);

    // Data state
    const [projects, setProjects] = useState([]);
    const [processes, setProcesses] = useState([]);
    const [checkedProcessIds, setCheckedProcessIds] = useState(new Set()); // For completion
    const [selectedProcessIds, setSelectedProcessIds] = useState(new Set()); // For edit/delete

    // UI state
    const [searchInput, setSearchInput] = useState(''); // 입력 중인 검색어
    const [searchTerm, setSearchTerm] = useState(''); // 실제 필터링에 사용되는 검색어
    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state for Add/Edit Modal
    const [newProcess, setNewProcess] = useState({ title: '', startDate: '', endDate: '' });
    const [editingProcess, setEditingProcess] = useState(null);

    // 1. 초기 프로젝트 목록 로드
    useEffect(() => {
        const projs = dbService.getAll('프로젝트관리');
        setProjects([...projs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    }, []);

    // 2. 선택된 프로젝트의 공정 목록 로드
    useEffect(() => {
        if (selectedProject) {
            loadProcesses();
            setCheckedProcessIds(new Set());
        }
    }, [selectedProject]);

    const loadProcesses = () => {
        const allProcs = dbService.getAll('공정관리');
        const projectProcs = allProcs.filter(p => p.projectId === selectedProject.id);
        const sortedProcs = projectProcs.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
        setProcesses(sortedProcs);
    };

    const handleProjectSelect = (project) => {
        setSelectedProject(project);
        setShowProjectModal(false);
    };

    const toggleProcessCheck = (id) => {
        const next = new Set(checkedProcessIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setCheckedProcessIds(next);
    };

    const handleCompleteSelected = async () => {
        if (checkedProcessIds.size === 0) return;
        const confirmed = await showConfirm(`선택한 ${checkedProcessIds.size}개의 공정을 완료 처리하시겠습니까?`);
        if (!confirmed) return;

        try {
            setLoading(true);
            const allProcs = dbService.getAll('공정관리');

            for (const id of checkedProcessIds) {
                const proc = allProcs.find(p => p.id === id);
                if (proc) {
                    const updatedProc = { ...proc, isCompleted: true };
                    await saveJsonData('공정관리', updatedProc);
                    await saveActionLog('UPDATE', '공정관리', id);
                    dbService.save('공정관리', updatedProc);
                }
            }

            loadProcesses();
            setCheckedProcessIds(new Set());
            await showAlert('공정이 완료 처리되었습니다.', '성공', 'success');
        } catch (err) {
            showAlert(`완료 처리 실패: ${err.message}`, '오류', 'error');
        } finally {
            setLoading(false);
        }
    };

    const toggleProcessSelection = (id) => {
        const next = new Set(selectedProcessIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedProcessIds(next);
    };

    const handleEditSelected = () => {
        if (selectedProcessIds.size !== 1) {
            return showAlert('수정할 공정 하나를 선택해 주세요.');
        }
        const procId = Array.from(selectedProcessIds)[0];
        const proc = processes.find(p => p.id === procId);
        if (proc) {
            setEditingProcess(proc);
            setNewProcess({ title: proc.title, startDate: proc.startDate, endDate: proc.endDate });
            setShowAddModal(true);
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedProcessIds.size === 0) {
            return showAlert('삭제할 공정을 선택해 주세요.');
        }
        const confirmed = await showConfirm(`선택한 ${selectedProcessIds.size}개의 공정을 삭제하시겠습니까?`);
        if (!confirmed) return;

        try {
            setLoading(true);
            for (const id of selectedProcessIds) {
                const proc = processes.find(p => p.id === id);
                if (proc) {
                    // Delete from Drive if fileId exists
                    if (proc.fileId) {
                        await deleteFile(proc.fileId);
                    }
                    // Log deletion
                    await saveActionLog('DELETE', '공정관리', id);
                    // Remove from local DB
                    dbService.remove('공정관리', id);
                }
            }
            loadProcesses();
            setSelectedProcessIds(new Set());
            await showAlert('공정이 삭제되었습니다.', '성공', 'success');
        } catch (err) {
            showAlert(`삭제 실패: ${err.message}`, '오류', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveProcess = async (e) => {
        e.preventDefault();
        if (!newProcess.title || !newProcess.startDate || !newProcess.endDate) {
            return showAlert('모든 필드를 입력해 주세요.');
        }

        try {
            setIsSubmitting(true);
            const user = getCurrentUser();

            if (editingProcess) {
                // Update existing process
                const updatedProc = {
                    ...editingProcess,
                    title: newProcess.title,
                    startDate: newProcess.startDate,
                    endDate: newProcess.endDate
                };
                await saveJsonData('공정관리', updatedProc);
                await saveActionLog('UPDATE', '공정관리', updatedProc.id);
                dbService.save('공정관리', updatedProc);
                await showAlert('공정이 수정되었습니다.', '성공', 'success');
            } else {
                // Create new process
                const procData = {
                    id: crypto.randomUUID(),
                    projectId: selectedProject.id,
                    title: newProcess.title,
                    startDate: newProcess.startDate,
                    endDate: newProcess.endDate,
                    isCompleted: false,
                    author: user?.name || '알 수 없음',
                    authorId: user?.person_id || '',
                    createdAt: new Date().toISOString()
                };
                await saveJsonData('공정관리', procData);
                await saveActionLog('CREATE', '공정관리', procData.id);
                dbService.save('공정관리', procData);
                await showAlert('공정이 추가되었습니다.', '성공', 'success');
            }

            loadProcesses();
            setShowAddModal(false);
            setEditingProcess(null);
            setNewProcess({ title: '', startDate: '', endDate: '' });
            setSelectedProcessIds(new Set());
        } catch (err) {
            showAlert(`${editingProcess ? '수정' : '추가'} 실패: ${err.message}`, '오류', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSearch = () => {
        setSearchTerm(searchInput);
    };

    const handleSearchKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    const filteredProjects = projects.filter(p =>
        p.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Check if selected processes are owned by current user
    const user = getCurrentUser();
    const selectedProcesses = processes.filter(p => selectedProcessIds.has(p.id));
    const canEditDelete = selectedProcesses.length > 0 && selectedProcesses.every(p => p.authorId === user?.person_id);

    return (
        <div className="board-list-container relative">
            {/* Header: Project Name */}
            <div className="board-header">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="board-title">공정관리</h1>
                        {selectedProject && (
                            <p className="post-count">총 {processes.length}개의 세부공정</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-blue-500 uppercase">Selected Project</span>
                        <button
                            onClick={() => setShowProjectModal(true)}
                            className="text-xs font-bold text-slate-800 flex items-center gap-1 hover:text-blue-600 transition-colors"
                        >
                            {selectedProject ? selectedProject.title : '프로젝트를 선택해 주세요'}
                            <RefreshCw size={10} />
                        </button>
                    </div>
                </div>
                <div className="flex gap-2">
                    {canEditDelete && (
                        <>
                            <button
                                onClick={handleEditSelected}
                                disabled={selectedProcessIds.size !== 1}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Edit size={14} />
                                수정
                            </button>
                            <button
                                onClick={handleDeleteSelected}
                                disabled={selectedProcessIds.size === 0}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Trash2 size={14} />
                                삭제
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* List Body */}
            <div className="board-body overflow-x-auto">
                {!selectedProject ? (
                    <div className="status-container font-loading">
                        <AlertCircle size={48} className="text-slate-100 mb-2" />
                        <p>프로젝트를 먼저 선택해 주세요.</p>
                        <button onClick={() => setShowProjectModal(true)} className="px-4 py-2 mt-4 bg-blue-600 text-white rounded-lg font-bold text-xs">프로젝트 선택</button>
                    </div>
                ) : processes.length === 0 ? (
                    <div className="status-container empty">
                        <CheckCircle size={48} className="text-slate-200" />
                        <p>등록된 공정이 없습니다. 아래 '공정 추가' 버튼을 눌러보세요.</p>
                    </div>
                ) : (
                    <div className="post-list">
                        <div className="flex items-center px-4 py-3 bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <div className="w-10 text-center">선택</div>
                            <div className="flex-1">공정 명칭</div>
                            <div className="w-40 text-center">기간</div>
                            <div className="w-16 text-center">완료체크</div>
                        </div>
                        {processes.map((proc) => {
                            const isOwnedByUser = proc.authorId === user?.person_id;
                            return (
                                <div key={proc.id} className={`flex items-center px-4 py-4 border-b border-gray-50 hover:bg-slate-50 transition-colors ${proc.isCompleted ? 'bg-gray-50 opacity-60' : ''} ${selectedProcessIds.has(proc.id) ? 'bg-blue-50' : ''}`}>
                                    <div className="w-10 flex justify-center">
                                        {isOwnedByUser && (
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                checked={selectedProcessIds.has(proc.id)}
                                                onChange={() => toggleProcessSelection(proc.id)}
                                            />
                                        )}
                                    </div>
                                    <div className="flex-1 flex flex-col">
                                        <span className={`text-sm font-bold ${proc.isCompleted ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                            {proc.title}
                                        </span>
                                        {proc.author && (
                                            <span className="text-[10px] text-slate-400 mt-0.5">{proc.author}</span>
                                        )}
                                    </div>
                                    <div className="w-40 text-center text-xs text-slate-500 font-medium">
                                        {proc.startDate} ~ {proc.endDate}
                                    </div>
                                    <div className="w-16 flex justify-center">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            checked={proc.isCompleted || checkedProcessIds.has(proc.id)}
                                            disabled={proc.isCompleted}
                                            onChange={() => toggleProcessCheck(proc.id)}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="board-footer">
                <div className="pagination">
                    {/* Placeholder for project overall completion? */}
                    {selectedProject && (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400">기간 진행률</span>
                            <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-green-500 transition-all duration-1000"
                                    style={{ width: `${getProjectPeriodProgress(selectedProject, processes)}%` }}
                                ></div>
                            </div>
                            <span className="text-[10px] font-black text-slate-900">
                                {getProjectPeriodProgress(selectedProject, processes)}%
                            </span>
                        </div>
                    )}
                </div>
                <div className="flex gap-2">
                    <button
                        className={`text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${checkedProcessIds.size > 0 ? 'bg-green-600 text-white shadow-lg shadow-green-100' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                        disabled={checkedProcessIds.size === 0 || loading}
                        onClick={handleCompleteSelected}
                    >
                        {loading ? <RefreshCw size={14} className="spin" /> : <CheckCircle size={14} />}
                        공정완료
                    </button>
                    <button
                        className="write-btn-float static rounded-lg scale-100 px-4 py-2 shadow-none flex items-center gap-2"
                        disabled={!selectedProject}
                        onClick={() => setShowAddModal(true)}
                    >
                        <Plus size={14} />
                        공정 추가
                    </button>
                </div>
            </div>

            {/* Project Selection Modal */}
            {showProjectModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-white/80 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[80%]">
                        <div className="p-6 border-b border-slate-50 flex justify-between items-center">
                            <h2 className="text-lg font-black text-slate-900">프로젝트 선택</h2>
                            {selectedProject && (
                                <button onClick={() => setShowProjectModal(false)} className="p-1 hover:bg-slate-50 rounded-full text-slate-400">
                                    <X size={20} />
                                </button>
                            )}
                        </div>
                        <div className="p-4 bg-slate-50 border-b border-slate-100">
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="프로젝트 검색..."
                                        className="w-full pl-10 pr-4 py-2 bg-white border-none rounded-xl text-sm shadow-sm focus:ring-2 focus:ring-blue-100"
                                        value={searchInput}
                                        onChange={(e) => setSearchInput(e.target.value)}
                                        onKeyPress={handleSearchKeyPress}
                                    />
                                </div>
                                <button
                                    onClick={handleSearch}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
                                >
                                    <Search size={14} />
                                    검색
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto no-scrollbar p-2">
                            {filteredProjects.map(p => (
                                <div
                                    key={p.id}
                                    onClick={() => handleProjectSelect(p)}
                                    className="flex items-center justify-between p-4 hover:bg-blue-50 rounded-2xl cursor-pointer transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                            <Briefcase size={18} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-800">{p.title}</span>
                                            <span className="text-[10px] font-medium text-slate-400">{p.startDate} ~ {p.endDate}</span>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-600 transition-all" />
                                </div>
                            ))}
                            {filteredProjects.length === 0 && (
                                <div className="p-8 text-center text-slate-400 text-sm italic">
                                    프로젝트가 없습니다.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Process Modal */}
            {showAddModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-[2px]">
                    <form onSubmit={handleSaveProcess} className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-black text-slate-900">
                                {editingProcess ? '공정 수정' : '새 공정 추가'}
                            </h2>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAddModal(false);
                                    setEditingProcess(null);
                                    setNewProcess({ title: '', startDate: '', endDate: '' });
                                }}
                                className="text-slate-400 hover:text-red-500"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">공정 명칭</label>
                                <input
                                    type="text"
                                    placeholder="공정 제목을 입력하세요"
                                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-100"
                                    value={newProcess.title}
                                    onChange={(e) => setNewProcess({ ...newProcess, title: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Calendar size={10} /> 시작일</label>
                                    <input
                                        type="date"
                                        className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-xs focus:ring-2 focus:ring-blue-100 font-bold text-slate-600"
                                        value={newProcess.startDate}
                                        onChange={(e) => setNewProcess({ ...newProcess, startDate: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Calendar size={10} /> 종료일</label>
                                    <input
                                        type="date"
                                        className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-xs focus:ring-2 focus:ring-blue-100 font-bold text-slate-600"
                                        value={newProcess.endDate}
                                        onChange={(e) => setNewProcess({ ...newProcess, endDate: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full py-3 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? <RefreshCw size={16} className="spin" /> : <Save size={16} />}
                                {editingProcess ? '공정 수정' : '공정 저장'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

const Save = ({ size }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2-2 0 0 1-2-2V5a2-2 0 0 1 2-2h11l5 5v11a2-2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>;

export default ProcessList;


import React, { useState, useMemo } from 'react';
import { Project, Process, User } from '../types';
import ProcessForm from './ProcessForm';

interface ProcessManagementProps {
  projects: Project[];
  processes: Process[];
  currentUser: User; // 현재 사용자 정보 추가
  onToggleProcess: (id: string) => void;
  onAddProcess: (process: any) => void;
  onUpdateProcess: (process: Process) => void;
}

const ProcessManagement: React.FC<ProcessManagementProps> = ({ projects, processes, currentUser, onToggleProcess, onAddProcess, onUpdateProcess }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingProcess, setEditingProcess] = useState<Process | null>(null);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  
  const recentProjects = useMemo(() => 
    [...projects].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 5)
  , [projects]);

  const [selectedProjectId, setSelectedProjectId] = useState(recentProjects[0]?.id || '');

  const selectedProject = useMemo(() => 
    projects.find(p => p.id === selectedProjectId) || projects[0]
  , [projects, selectedProjectId]);

  const filteredProcesses = useMemo(() => 
    processes.filter(p => p.projectId === selectedProjectId)
  , [processes, selectedProjectId]);

  const handleEditClick = (proc: Process) => {
    // 본인이 생성한 공정만 수정 가능하도록 제한
    if (proc.authorId !== currentUser.id) {
      alert('작성자만 공정을 수정할 수 있습니다.');
      return;
    }
    setEditingProcess(proc);
    setShowForm(true);
  };

  const handleCreateClick = () => {
    setEditingProcess(null);
    setShowForm(true);
  };

  if (showForm) {
    return (
      <div className="flex-1 overflow-y-auto bg-slate-50/50">
        <div className="max-w-5xl mx-auto py-12 px-6">
          <button 
            onClick={() => setShowForm(false)}
            className="mb-8 flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold text-sm transition-colors group"
          >
            <span className="material-symbols-outlined group-hover:-translate-x-1 transition-transform">arrow_back</span>
            공정 목록으로 돌아가기
          </button>
          <ProcessForm 
            initialData={editingProcess || undefined}
            onCancel={() => setShowForm(false)} 
            projectMembers={selectedProject?.members || []}
            onSave={(newProcessData) => {
              if (editingProcess) {
                onUpdateProcess({ ...editingProcess, ...newProcessData });
              } else {
                onAddProcess({ 
                  ...newProcessData, 
                  projectId: selectedProjectId,
                  authorId: currentUser.id // 생성 시 authorId 부여
                });
              }
              setShowForm(false);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-8 bg-slate-50/30 overflow-hidden">
      <div className="max-w-7xl mx-auto w-full flex flex-col h-full">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div className="relative">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2 px-1">대상 프로젝트 선택</label>
            <button 
              onClick={() => setIsSelectorOpen(!isSelectorOpen)}
              className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl px-5 py-3.5 shadow-sm hover:border-blue-300 transition-all min-w-[360px] group text-left"
            >
              <div className="size-11 bg-slate-900 rounded-xl flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-white text-2xl">folder_managed</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{selectedProject?.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                   <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden max-w-[60px]">
                      <div className="h-full bg-blue-600" style={{width: `${selectedProject?.progress}%`}}></div>
                   </div>
                   <span className="text-[10px] font-bold text-blue-600">{selectedProject?.progress}% 완료</span>
                </div>
              </div>
              <span className={`material-symbols-outlined text-slate-400 transition-transform ${isSelectorOpen ? 'rotate-180' : ''}`}>unfold_more</span>
            </button>

            {isSelectorOpen && (
              <div className="absolute top-full left-0 mt-2 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 border-t-4 border-t-blue-600">
                <div className="p-2 max-h-[400px] overflow-y-auto sidebar-dark-scrollbar">
                  {recentProjects.map((p) => (
                    <button 
                      key={p.id}
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        setIsSelectorOpen(false);
                      }}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all text-left group ${
                        selectedProjectId === p.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className={`size-2.5 rounded-full ${selectedProjectId === p.id ? 'bg-blue-600 scale-125' : 'bg-slate-300 group-hover:bg-slate-400'}`} />
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-bold block truncate ${selectedProjectId === p.id ? 'text-blue-700' : 'text-slate-700'}`}>
                          {p.title}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">진행률: {p.progress}% | 마감: {p.dueDate}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button 
            onClick={handleCreateClick}
            className="bg-blue-600 text-white px-8 py-4 rounded-2xl text-sm font-bold shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2 h-fit"
          >
            <span className="material-symbols-outlined text-[20px]">add_circle</span>
            신규 공정 추가
          </button>
        </div>

        {/* Process List Table */}
        <div className="flex-1 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className="py-5 px-6 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-12">No.</th>
                  <th className="py-5 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">공정 정보 및 담당 업무</th>
                  <th className="py-5 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-40">기간</th>
                  <th className="py-5 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider w-32 text-center">작성자</th>
                  <th className="py-5 px-8 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider w-24">완료여부</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredProcesses.length > 0 ? (
                  filteredProcesses.map((proc, idx) => {
                    const isMine = proc.authorId === currentUser.id;
                    return (
                      <tr 
                        key={proc.id} 
                        onClick={() => handleEditClick(proc)}
                        className={`group transition-all cursor-pointer ${proc.isCompleted ? 'bg-blue-50/20' : 'hover:bg-slate-50/50'} ${!isMine ? 'cursor-default' : ''}`}
                      >
                        <td className="py-7 px-6 align-top">
                          <span className={`text-[12px] font-bold ${proc.isCompleted ? 'text-blue-300' : 'text-slate-300'}`}>
                            {(idx + 1).toString().padStart(2, '0')}
                          </span>
                        </td>
                        <td className="py-7 px-4 align-top">
                          <div className="flex flex-col gap-2">
                            <h4 className={`text-[15px] font-bold transition-all ${proc.isCompleted ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                              {proc.title}
                              {!isMine && <span className="material-symbols-outlined text-[16px] text-slate-300 ml-2">lock</span>}
                            </h4>
                            <p className={`text-[12px] leading-relaxed max-w-xl ${proc.isCompleted ? 'text-slate-300' : 'text-slate-500'}`}>
                              {proc.description}
                            </p>
                          </div>
                        </td>
                        <td className="py-7 px-4 align-top">
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">Duration</span>
                            <p className={`text-[12px] font-bold ${proc.isCompleted ? 'text-slate-400' : 'text-slate-700'}`}>
                              {proc.startDate.replace(/-/g, '.')} ~ {proc.endDate.replace(/-/g, '.')}
                            </p>
                          </div>
                        </td>
                        <td className="py-7 px-4 align-top text-center">
                          <div className="flex flex-col items-center gap-1">
                             <img src={`https://picsum.photos/seed/${proc.authorId}/40/40`} className="size-6 rounded-full border border-slate-200" alt="Author" />
                             <span className="text-[10px] font-bold text-slate-400 uppercase">{proc.authorId}</span>
                          </div>
                        </td>
                        <td className="py-7 px-8 align-top text-right">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isMine) onToggleProcess(proc.id);
                              else alert('작성자만 공정 상태를 변경할 수 있습니다.');
                            }}
                            className={`size-9 rounded-xl border-2 flex items-center justify-center transition-all shadow-sm ${
                              proc.isCompleted 
                                ? 'bg-blue-600 border-blue-600 text-white' 
                                : isMine ? 'bg-white border-slate-200 text-transparent hover:border-blue-400 hover:text-blue-200' : 'bg-slate-50 border-slate-100 text-transparent'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[24px] font-bold">check</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-24 text-center">
                      <div className="flex flex-col items-center gap-4 text-slate-300">
                        <span className="material-symbols-outlined text-7xl opacity-50">data_thresholding</span>
                        <p className="font-bold text-lg">해당 프로젝트에 등록된 공정이 없습니다.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProcessManagement;

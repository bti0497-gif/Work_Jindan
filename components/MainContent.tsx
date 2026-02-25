
import React, { useState, useMemo } from 'react';
import { Project } from '../types';
import ProjectCard from './ProjectCard';
import ProjectForm from './ProjectForm';

interface MainContentProps {
  projects: Project[];
  onSelectProject: (project: Project) => void; // 콜백 추가
}

/**
 * ToolBar sub-component
 */
const ToolBar: React.FC<{ 
  layoutMode: 'grid' | 'list'; 
  setLayoutMode: (mode: 'grid' | 'list') => void;
  selectionMode: boolean;
  setSelectionMode: (mode: boolean) => void;
  onDeleteSelected: () => void;
  selectedCount: number;
  sortOrder: 'latest' | 'oldest';
  setSortOrder: (order: 'latest' | 'oldest') => void;
}> = ({ layoutMode, setLayoutMode, selectionMode, setSelectionMode, onDeleteSelected, selectedCount, sortOrder, setSortOrder }) => (
  <div className="flex items-center justify-between mb-6">
    <div className="flex items-center gap-5 text-slate-500 text-sm font-medium">
      <div 
        onClick={() => setSortOrder('latest')}
        className={`flex items-center gap-2 cursor-pointer transition-all group ${sortOrder === 'latest' ? 'text-blue-600 font-bold' : 'hover:text-blue-400'}`}
      >
        <span className="material-symbols-outlined text-[20px]">sort</span>
        <span className="text-[13px] tracking-tight">최신순</span>
      </div>
      <span className="text-slate-300">|</span>
      <div 
        onClick={() => setSortOrder('oldest')}
        className={`flex items-center gap-2 cursor-pointer transition-all group ${sortOrder === 'oldest' ? 'text-blue-600 font-bold' : 'hover:text-blue-400'}`}
      >
        <span className="material-symbols-outlined text-[20px]">history</span>
        <span className="text-[13px] tracking-tight">과거순</span>
      </div>
    </div>
    
    <div className="flex items-center gap-3">
      <div className="flex bg-slate-200/50 p-1 rounded-lg">
        <button onClick={() => setLayoutMode('grid')} className={`px-3 py-1.5 rounded-md transition-all ${layoutMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>
          <span className="material-symbols-outlined text-[20px]">grid_view</span>
        </button>
        <button onClick={() => setLayoutMode('list')} className={`px-3 py-1.5 rounded-md transition-all ${layoutMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>
          <span className="material-symbols-outlined text-[20px]">view_list</span>
        </button>
      </div>
    </div>
  </div>
);

const MainContent: React.FC<MainContentProps> = ({ projects, onSelectProject }) => {
  const [viewMode, setViewMode] = useState<'list' | 'create'>('list');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');
  const [sortOrder, setSortOrder] = useState<'latest' | 'oldest'>('latest');
  
  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => sortOrder === 'latest' ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id));
  }, [projects, sortOrder]);

  if (viewMode === 'create') {
    return (
      <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50/30">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => setViewMode('list')} className="mb-6 flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold text-sm">
            <span className="material-symbols-outlined">arrow_back</span>목록으로 돌아가기
          </button>
          <ProjectForm onCancel={() => setViewMode('list')} />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50/30">
      <div className="max-w-7xl mx-auto flex flex-col min-h-full pb-8">
        <ToolBar layoutMode={layoutMode} setLayoutMode={setLayoutMode} selectionMode={false} setSelectionMode={()=>{}} onDeleteSelected={()=>{}} selectedCount={0} sortOrder={sortOrder} setSortOrder={setSortOrder} />

        {layoutMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-fr">
            {sortedProjects.map((project) => (
              <div key={project.id} onClick={() => onSelectProject(project)}>
                <ProjectCard project={project} />
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200">
                  <th className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">상태</th>
                  <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">프로젝트 정보</th>
                  <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">진행률</th>
                  <th className="py-3 pr-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">마감일</th>
                </tr>
              </thead>
              <tbody>
                {sortedProjects.map((project) => (
                  <tr key={project.id} onClick={() => onSelectProject(project)} className="group hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100 last:border-0">
                    <td className="py-4 px-4">
                      <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border uppercase tracking-tighter ${project.status === 'Completed' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                        {project.status === 'Completed' ? '완료' : '진행중'}
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors truncate">{project.title}</span>
                        <span className="text-[11px] text-slate-400 truncate max-w-[300px]">{project.description}</span>
                      </div>
                    </td>
                    <td className="py-4 text-center">
                       <span className="text-[12px] font-bold text-slate-600">{project.progress}%</span>
                    </td>
                    <td className="py-4 pr-4 text-right font-bold text-[12px] text-slate-700">{project.dueDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-12 flex justify-end">
          <button onClick={() => setViewMode('create')} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg">
            <span className="material-symbols-outlined">add</span>신규 프로젝트 등록
          </button>
        </div>
      </div>
    </main>
  );
};

export default MainContent;

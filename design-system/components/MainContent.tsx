
import React, { useState, useMemo } from 'react';
import { Project } from '../types';
import ProjectCard from './ProjectCard';
import ProjectForm from './ProjectForm';
import ProjectDetail from './ProjectDetail';

interface MainContentProps {
  projects: Project[];
}

/**
 * ToolBar sub-component with Sort toggle and Selection controls
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
    <div className="flex items-center gap-4 text-slate-500 text-sm font-medium">
      <div 
        onClick={() => setSortOrder('latest')}
        className={`flex items-center gap-1.5 cursor-pointer transition-all group ${sortOrder === 'latest' ? 'text-blue-600 font-bold' : 'hover:text-blue-400'}`}
      >
        <span className={`material-symbols-outlined text-[20px] transition-transform ${sortOrder === 'latest' ? 'scale-110' : 'group-hover:scale-110'}`}>sort</span>
        <span>최신순</span>
      </div>
      <span className="text-slate-300">|</span>
      <div 
        onClick={() => setSortOrder('oldest')}
        className={`flex items-center gap-1.5 cursor-pointer transition-all group ${sortOrder === 'oldest' ? 'text-blue-600 font-bold' : 'hover:text-blue-400'}`}
      >
        <span className={`material-symbols-outlined text-[20px] transition-transform ${sortOrder === 'oldest' ? 'scale-110' : 'group-hover:scale-110'}`}>history</span>
        <span>과거순</span>
      </div>
    </div>
    
    <div className="flex items-center gap-3">
      {/* Selection Controls */}
      <div className="flex items-center gap-2 mr-2">
        {!selectionMode ? (
          <button 
            onClick={() => setSelectionMode(true)}
            className="text-[13px] font-bold text-slate-600 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-all flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[18px]">check_box</span>
            선택
          </button>
        ) : (
          <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
            <button 
              onClick={onDeleteSelected}
              disabled={selectedCount === 0}
              className={`text-[13px] font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                selectedCount > 0 ? 'text-red-600 hover:bg-red-50' : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
              선택 삭제 ({selectedCount})
            </button>
            <button 
              onClick={() => setSelectionMode(false)}
              className="text-[13px] font-bold text-slate-400 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-all"
            >
              취소
            </button>
          </div>
        )}
      </div>

      {/* Layout Toggles */}
      <div className="flex bg-slate-200/50 p-1 rounded-lg">
        <button 
          onClick={() => setLayoutMode('grid')}
          className={`px-3 py-1.5 rounded-md transition-all flex items-center ${
            layoutMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">grid_view</span>
        </button>
        <button 
          onClick={() => setLayoutMode('list')}
          className={`px-3 py-1.5 rounded-md transition-all flex items-center ${
            layoutMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">view_list</span>
        </button>
      </div>
    </div>
  </div>
);

/**
 * Project List Item for Table View
 */
const ProjectListItem: React.FC<{ 
  project: Project; 
  onClick: () => void; 
  selectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (e: React.MouseEvent) => void;
}> = ({ project, onClick, selectionMode, isSelected, onToggleSelect }) => {
  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'Completed': return 'bg-blue-50 text-blue-600 border-blue-100';
      default: return 'bg-green-50 text-green-600 border-green-100';
    }
  };

  return (
    <tr 
      onClick={onClick}
      className={`group hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100 last:border-0 ${isSelected ? 'bg-blue-50/50' : ''}`}
    >
      {selectionMode && (
        <td className="py-4 pl-4 w-10" onClick={onToggleSelect}>
          <div className={`size-5 rounded border flex items-center justify-center transition-all ${
            isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'
          }`}>
            {isSelected && <span className="material-symbols-outlined text-white text-[16px]">check</span>}
          </div>
        </td>
      )}
      <td className={`py-4 ${!selectionMode ? 'pl-4' : ''}`}>
        <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border uppercase tracking-tighter ${getStatusStyles(project.status)}`}>
          {project.status === 'Completed' ? '완료' : '진행중'}
        </span>
      </td>
      <td className="py-4">
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors truncate">{project.title}</span>
          <span className="text-[11px] text-slate-400 truncate max-w-[300px]">{project.description}</span>
        </div>
      </td>
      <td className="py-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 max-w-[100px] h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ${project.status === 'Completed' ? 'bg-blue-600' : 'bg-green-500'}`} 
              style={{ width: `${project.progress}%` }}
            />
          </div>
          <span className="text-[11px] font-bold text-slate-600">{project.progress}%</span>
        </div>
      </td>
      <td className="py-4">
        <div className="flex -space-x-1.5">
          {project.members.slice(0, 3).map((avatar, idx) => (
            <img 
              key={idx} 
              src={avatar} 
              className="size-6 rounded-full border border-white object-cover" 
              alt="Member" 
            />
          ))}
          {project.members.length > 3 && (
            <div className="size-6 rounded-full bg-slate-100 border border-white flex items-center justify-center text-[8px] font-bold text-slate-500">
              +{project.members.length - 3}
            </div>
          )}
        </div>
      </td>
      <td className="py-4 pr-4 text-right">
        <span className="text-[11px] font-bold text-slate-700">{project.dueDate}</span>
      </td>
    </tr>
  );
};

const NavigationFooter: React.FC<{ onNewProject: () => void }> = ({ onNewProject }) => (
  <div className="mt-12 grid grid-cols-3 items-center">
    <div />
    <div className="flex justify-center items-center gap-1">
      <button className="size-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
        <span className="material-symbols-outlined text-[18px]">chevron_left</span>
      </button>
      {[1, 2, 3, 4, 5].map((num) => (
        <button 
          key={num}
          className={`size-8 flex items-center justify-center rounded-lg text-sm font-bold transition-all ${
            num === 1 
            ? 'bg-blue-600 text-white shadow-md shadow-blue-200' 
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
          }`}
        >
          {num}
        </button>
      ))}
      <button className="size-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
        <span className="material-symbols-outlined text-[18px]">chevron_right</span>
      </button>
    </div>
    <div className="flex justify-end">
      <button 
        onClick={onNewProject}
        className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-100 hover:bg-blue-700 hover:shadow-blue-200 active:scale-95 transition-all"
      >
        <span className="material-symbols-outlined text-[20px]">add</span>
        신규 프로젝트 추가
      </button>
    </div>
  </div>
);

const MainContent: React.FC<MainContentProps> = ({ projects }) => {
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'detail'>('list');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [sortOrder, setSortOrder] = useState<'latest' | 'oldest'>('latest');
  
  // Selection States
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sorting Logic
  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      if (sortOrder === 'latest') {
        return b.id.localeCompare(a.id);
      } else {
        return a.id.localeCompare(b.id);
      }
    });
  }, [projects, sortOrder]);

  const handleOpenDetail = (project: Project) => {
    if (selectionMode) {
      toggleSelect(project.id);
      return;
    }
    setSelectedProject(project);
    setViewMode('detail');
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDeleteSelected = () => {
    if (confirm(`${selectedIds.size}개의 프로젝트를 삭제하시겠습니까?`)) {
      console.log('Deleting projects:', Array.from(selectedIds));
      setSelectedIds(new Set());
      setSelectionMode(false);
    }
  };

  const handleBackToList = () => {
    setSelectedProject(null);
    setViewMode('list');
  };

  if (viewMode === 'create') {
    return (
      <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50/30">
        <div className="max-w-4xl mx-auto">
          <button 
            onClick={handleBackToList}
            className="mb-6 flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold text-sm transition-colors group"
          >
            <span className="material-symbols-outlined group-hover:-translate-x-1 transition-transform">arrow_back</span>
            목록으로 돌아가기
          </button>
          <ProjectForm onCancel={handleBackToList} />
        </div>
      </main>
    );
  }

  if (viewMode === 'detail' && selectedProject) {
    return (
      <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50/30">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <button 
              onClick={handleBackToList}
              className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold text-sm transition-colors group"
            >
              <span className="material-symbols-outlined group-hover:-translate-x-1 transition-transform">arrow_back</span>
              목록으로 돌아가기
            </button>
            <button 
              className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold text-sm transition-colors group"
            >
              공정관리로 가기
              <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </button>
          </div>
          <ProjectDetail project={selectedProject} onBack={handleBackToList} />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50/30">
      <div className="max-w-7xl mx-auto flex flex-col min-h-full pb-8">
        <ToolBar 
          layoutMode={layoutMode} 
          setLayoutMode={setLayoutMode}
          selectionMode={selectionMode}
          setSelectionMode={(mode) => {
            setSelectionMode(mode);
            if (!mode) setSelectedIds(new Set());
          }}
          onDeleteSelected={handleDeleteSelected}
          selectedCount={selectedIds.size}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
        />

        {layoutMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-fr">
            {sortedProjects.map((project) => (
              <div key={project.id} onClick={() => handleOpenDetail(project)}>
                <ProjectCard 
                  project={project} 
                  selectionMode={selectionMode}
                  isSelected={selectedIds.has(project.id)}
                  onToggleSelect={(e) => {
                    e.stopPropagation();
                    toggleSelect(project.id);
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200">
                  {selectionMode && <th className="py-3 pl-4 w-10"></th>}
                  <th className={`py-3 ${!selectionMode ? 'pl-4' : ''} text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24`}>상태</th>
                  <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">프로젝트 정보</th>
                  <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-40">진행률</th>
                  <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">참여자</th>
                  <th className="py-3 pr-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">마감일</th>
                </tr>
              </thead>
              <tbody>
                {sortedProjects.map((project) => (
                  <ProjectListItem 
                    key={project.id} 
                    project={project} 
                    onClick={() => handleOpenDetail(project)}
                    selectionMode={selectionMode}
                    isSelected={selectedIds.has(project.id)}
                    onToggleSelect={(e) => {
                      e.stopPropagation();
                      toggleSelect(project.id);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-auto">
          <NavigationFooter onNewProject={() => setViewMode('create')} />
        </div>
      </div>
    </main>
  );
};

export default MainContent;

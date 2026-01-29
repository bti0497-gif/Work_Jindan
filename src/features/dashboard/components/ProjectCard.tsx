import React from 'react';
import { Project } from '@/types/common';

interface ProjectCardProps {
  project: Project;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (e: React.MouseEvent) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, selectionMode, isSelected, onToggleSelect }) => {
  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'Completed': return 'bg-blue-50 text-blue-600 border-blue-100';
      default: return 'bg-green-50 text-green-600 border-green-100';
    }
  };

  const getProgressColor = (status: string) => {
    return status === 'Completed' ? '#2563eb' : '#10b981';
  };

  const dashArray = 100;
  const dashOffset = dashArray - project.progress;

  return (
    <div className={`relative bg-white border rounded-2xl p-5 hover:shadow-xl transition-all cursor-pointer group ${
      isSelected 
      ? 'border-blue-600 ring-2 ring-blue-50 bg-blue-50/20' 
      : 'border-slate-200 hover:border-blue-100'
    }`}>
      {/* Selection Checkbox */}
      {selectionMode && (
        <div 
          onClick={onToggleSelect}
          className="absolute top-4 left-4 z-10 animate-in zoom-in-50 duration-200"
        >
          <div className={`size-6 rounded-lg border flex items-center justify-center transition-all ${
            isSelected ? 'bg-blue-600 border-blue-600 shadow-sm' : 'bg-white border-slate-300'
          }`}>
            {isSelected && <span className="material-symbols-outlined text-white text-[18px]">check</span>}
          </div>
        </div>
      )}

      <div className="flex justify-between items-start mb-6">
        <div className={`relative size-14 shrink-0 transition-opacity ${selectionMode ? 'ml-8 opacity-40' : ''}`}>
          <svg className="size-full -rotate-90" viewBox="0 0 36 36">
            <circle className="stroke-slate-100" cx="18" cy="18" fill="none" r="16" strokeWidth="3"></circle>
            <circle 
              className="transition-all duration-1000 ease-out"
              cx="18" cy="18" fill="none" r="16" 
              stroke={getProgressColor(project.status)}
              strokeWidth="3"
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
            ></circle>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-slate-700">
            {project.progress}%
          </div>
        </div>
        <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border uppercase tracking-tighter ${getStatusStyles(project.status)}`}>
          {project.status === 'Completed' ? '완료' : '진행중'}
        </span>
      </div>
      
      <h3 className={`font-bold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors truncate ${selectionMode ? 'pl-8' : ''}`}>
        {project.title}
      </h3>
      <p className={`text-xs text-slate-500 mb-5 leading-relaxed line-clamp-2 ${selectionMode ? 'pl-8' : ''}`}>
        {project.description}
      </p>

      <div className="flex items-center justify-between pt-4 border-t border-slate-50">
        <div className="flex -space-x-2">
          {project.members.slice(0, 3).map((avatar, idx) => (
            <img 
              key={idx} 
              src={avatar} 
              className="size-7 rounded-full border-2 border-white object-cover" 
              alt="Member" 
            />
          ))}
          {project.members.length > 3 && (
            <div className="size-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-500">
              +{project.members.length - 3}
            </div>
          )}
        </div>
        <div className="text-right">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight block">Deadline</span>
          <span className="text-[11px] font-bold text-slate-700">{project.dueDate}</span>
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;

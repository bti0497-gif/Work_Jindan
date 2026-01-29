import { useState, useMemo } from 'react';
import { Project, Process } from '@/types/common';

export const useProjectViewModel = (initialProjects: Project[], initialProcesses: Process[]) => {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [processes, setProcesses] = useState<Process[]>(initialProcesses);

  // 로직: 공정 상태에 따른 프로젝트 진행률 자동 계산
  const projectsWithProgress = useMemo(() => {
    return projects.map(project => {
      const projectProcesses = processes.filter(p => p.projectId === project.id);
      if (projectProcesses.length === 0) return { ...project, progress: 0, status: 'In Progress' as const };
      
      const completedCount = projectProcesses.filter(p => p.isCompleted).length;
      const progress = Math.round((completedCount / projectProcesses.length) * 100);
      
      return { 
        ...project, 
        progress, 
        status: progress === 100 ? 'Completed' : 'In Progress' 
      };
    });
  }, [projects, processes]);

  const actions = {
    addProject: (newProject: Project) => setProjects(prev => [newProject, ...prev]),
    updateProject: (updated: Project) => setProjects(prev => prev.map(p => p.id === updated.id ? updated : p)),
    
    addProcess: (newProcess: Process) => setProcesses(prev => [...prev, newProcess]),
    toggleProcess: (id: string) => setProcesses(prev => prev.map(p => p.id === id ? { ...p, isCompleted: !p.isCompleted } : p)),
    updateProcess: (updated: Process) => setProcesses(prev => prev.map(p => p.id === updated.id ? updated : p))
  };

  return {
    projects: projectsWithProgress,
    processes,
    actions
  };
};

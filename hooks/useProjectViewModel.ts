import { useState, useMemo, useEffect } from 'react';
import { Project, Process } from '../types';
import { apiClient } from '../services/apiClient';

export const useProjectViewModel = (initialProjects: Project[], initialProcesses: Process[]) => {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [processes, setProcesses] = useState<Process[]>(initialProcesses);

  useEffect(() => {
    const load = async () => {
      try {
        const [projectData, processData] = await Promise.all([
          apiClient.get<Project[]>(`/projects?page=1&limit=200`),
          apiClient.get<Process[]>(`/processes?page=1&limit=500`)
        ]);
        setProjects(projectData);
        setProcesses(processData);
      } catch (error) {
        console.error('Failed to load projects/processes', error);
      }
    };

    load();
  }, []);

  const projectsWithProgress = useMemo(() => {
    return projects.map((project): Project => {
      const projectProcesses = processes.filter(p => p.projectId === project.id);
      if (projectProcesses.length === 0) return { ...project, progress: 0, status: 'In Progress' };
      
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
    addProject: async (newProject: Project) => {
      const created = await apiClient.post<Project>('/projects', {
        title: newProject.title,
        description: newProject.description,
        dueDate: newProject.dueDate,
        members: newProject.members
      });
      setProjects(prev => [created, ...prev]);
    },
    updateProject: async (updated: Project) => {
      const saved = await apiClient.patch<Project>(`/projects/${updated.id}`, updated);
      setProjects(prev => prev.map(p => p.id === saved.id ? saved : p));
    },
    deleteProject: async (id: string) => {
      await apiClient.delete(`/projects/${id}`);
      setProjects(prev => prev.filter(p => p.id !== id));
    },
    addProcess: async (newProcess: Process) => {
      const created = await apiClient.post<Process>(`/projects/${newProcess.projectId}/processes`, {
        title: newProcess.title,
        startDate: newProcess.startDate,
        endDate: newProcess.endDate,
        description: newProcess.description,
        members: newProcess.members
      });
      setProcesses(prev => [...prev, created]);
    },
    toggleProcess: async (id: string) => {
      const updated = await apiClient.patch<Process>(`/processes/${id}/toggle`, {});
      setProcesses(prev => prev.map(p => p.id === updated.id ? updated : p));
    },
    updateProcess: async (updated: Process) => {
      const saved = await apiClient.patch<Process>(`/processes/${updated.id}`, updated);
      setProcesses(prev => prev.map(p => p.id === saved.id ? saved : p));
    },
    deleteProcess: async (id: string) => {
      await apiClient.delete(`/processes/${id}`);
      setProcesses(prev => prev.filter(p => p.id !== id));
    }
  };

  return {
    projects: projectsWithProgress,
    processes,
    actions
  };
};

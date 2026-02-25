import { useState, useMemo, useEffect } from 'react';
import { Task } from '../types';
import { TaskRequestParams, CreateTaskParams } from '../services/apiContract';
import { apiClient } from '../services/apiClient';

export const useTaskViewModel = (initialTasks: Task[], currentUser: { id: string, name: string, avatar: string }) => {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const query: TaskRequestParams = { page: 1, limit: 200 };
        const result = await apiClient.get<Task[]>(`/tasks?page=${query.page}&limit=${query.limit}`);
        setTasks(result);
      } catch (error) {
        console.error('Failed to load tasks', error);
      }
    };

    fetchTasks();
  }, [currentUser.id]);

  // 로직: 내 할일과 공지사항만 필터링
  const visibleTasks = useMemo(() => {
    return tasks.filter(t => t.authorId === currentUser.id || t.isPublic);
  }, [tasks, currentUser.id]);

  const actions = {
    addTask: async (params: CreateTaskParams) => {
      const newTask = await apiClient.post<Task>('/tasks', params);
      setTasks(prev => [newTask, ...prev]);
    },
    updateTask: async (updated: Task) => {
      const saved = await apiClient.patch<Task>(`/tasks/${updated.id}`, updated);
      setTasks(prev => prev.map(t => t.id === saved.id ? saved : t));
    },
    deleteTask: async (id: string) => {
      await apiClient.delete(`/tasks/${id}`);
      setTasks(prev => prev.filter(t => t.id !== id));
    },
    toggleComplete: async (id: string) => {
      const target = tasks.find(t => t.id === id);
      if (!target) return;
      const saved = await apiClient.patch<Task>(`/tasks/${id}`, { ...target, completed: !target.completed });
      setTasks(prev => prev.map(t => t.id === saved.id ? saved : t));
    }
  };

  return {
    tasks: visibleTasks,
    allTasks: tasks, // 전체 원본 데이터가 필요한 경우
    actions
  };
};

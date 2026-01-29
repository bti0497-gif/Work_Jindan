
import { useState, useMemo } from 'react';
import { Task } from '../types';
import { TaskRequestParams, CreateTaskParams } from '../services/apiContract';

export const useTaskViewModel = (initialTasks: Task[], currentUser: { id: string, name: string, avatar: string }) => {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);

  // 로직: 내 할일과 공지사항만 필터링
  const visibleTasks = useMemo(() => {
    return tasks.filter(t => t.authorId === currentUser.id || t.isPublic);
  }, [tasks, currentUser.id]);

  const actions = {
    addTask: (params: CreateTaskParams) => {
      const newTask: Task = {
        id: `task-${Date.now()}`,
        text: params.text,
        targetDate: params.targetDate,
        regDate: new Date().toISOString().split('T')[0],
        completed: false,
        author: currentUser.name,
        authorId: currentUser.id,
        authorAvatar: currentUser.avatar,
        isPublic: params.isPublic
      };
      setTasks(prev => [newTask, ...prev]);
    },
    updateTask: (updated: Task) => {
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    },
    deleteTask: (id: string) => {
      setTasks(prev => prev.filter(t => t.id !== id));
    },
    toggleComplete: (id: string) => {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
    }
  };

  return {
    tasks: visibleTasks,
    allTasks: tasks, // 전체 원본 데이터가 필요한 경우
    actions
  };
};

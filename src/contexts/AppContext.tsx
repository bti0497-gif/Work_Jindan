// 컴포넌트 간 공통 상태 관리를 위한 Context

'use client';

import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Project, Task, User, Milestone, Schedule, Post, Comment } from '@/types/database';
import { LOADING_STATES } from '@/lib/constants';

// === 상태 타입 정의 ===
interface AppState {
  // 로딩 상태
  loading: Record<string, 'idle' | 'loading' | 'success' | 'error'>;
  
  // 에러 상태
  errors: Record<string, string | null>;
  
  // 사용자 관련
  currentUser: User | null;
  users: User[];
  
  // 프로젝트 관련
  projects: Project[];
  currentProject: Project | null;
  
  // 작업 관련
  tasks: Task[];
  
  // 마일스톤 관련
  milestones: Milestone[];
  
  // 일정 관련
  schedules: Schedule[];
  
  // 게시글 관련
  posts: Post[];
  
  // 댓글 관련
  comments: Comment[];
  
  // UI 상태
  ui: {
    sidebarCollapsed: boolean;
    activeTab: string;
    selectedItems: string[];
    modals: Record<string, boolean>;
    theme: 'light' | 'dark';
  };
}

// === 액션 타입 정의 ===
type AppAction =
  // 로딩 상태 액션
  | { type: 'SET_LOADING'; payload: { key: string; state: 'idle' | 'loading' | 'success' | 'error' } }
  | { type: 'CLEAR_LOADING'; payload: string }
  
  // 에러 상태 액션
  | { type: 'SET_ERROR'; payload: { key: string; error: string } }
  | { type: 'CLEAR_ERROR'; payload: string }
  | { type: 'CLEAR_ALL_ERRORS' }
  
  // 사용자 액션
  | { type: 'SET_CURRENT_USER'; payload: User | null }
  | { type: 'SET_USERS'; payload: User[] }
  | { type: 'ADD_USER'; payload: User }
  | { type: 'UPDATE_USER'; payload: User }
  | { type: 'DELETE_USER'; payload: string }
  
  // 프로젝트 액션
  | { type: 'SET_PROJECTS'; payload: Project[] }
  | { type: 'SET_CURRENT_PROJECT'; payload: Project | null }
  | { type: 'ADD_PROJECT'; payload: Project }
  | { type: 'UPDATE_PROJECT'; payload: Project }
  | { type: 'DELETE_PROJECT'; payload: string }
  
  // 작업 액션
  | { type: 'SET_TASKS'; payload: Task[] }
  | { type: 'ADD_TASK'; payload: Task }
  | { type: 'UPDATE_TASK'; payload: Task }
  | { type: 'DELETE_TASK'; payload: string }
  
  // 마일스톤 액션
  | { type: 'SET_MILESTONES'; payload: Milestone[] }
  | { type: 'ADD_MILESTONE'; payload: Milestone }
  | { type: 'UPDATE_MILESTONE'; payload: Milestone }
  | { type: 'DELETE_MILESTONE'; payload: string }
  
  // 일정 액션
  | { type: 'SET_SCHEDULES'; payload: Schedule[] }
  | { type: 'ADD_SCHEDULE'; payload: Schedule }
  | { type: 'UPDATE_SCHEDULE'; payload: Schedule }
  | { type: 'DELETE_SCHEDULE'; payload: string }
  
  // 게시글 액션
  | { type: 'SET_POSTS'; payload: Post[] }
  | { type: 'ADD_POST'; payload: Post }
  | { type: 'UPDATE_POST'; payload: Post }
  | { type: 'DELETE_POST'; payload: string }
  
  // 댓글 액션
  | { type: 'SET_COMMENTS'; payload: Comment[] }
  | { type: 'ADD_COMMENT'; payload: Comment }
  | { type: 'UPDATE_COMMENT'; payload: Comment }
  | { type: 'DELETE_COMMENT'; payload: string }
  
  // UI 액션
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_ACTIVE_TAB'; payload: string }
  | { type: 'SET_SELECTED_ITEMS'; payload: string[] }
  | { type: 'TOGGLE_MODAL'; payload: { key: string; isOpen?: boolean } }
  | { type: 'SET_THEME'; payload: 'light' | 'dark' }
  | { type: 'RESET_UI' };

// === 초기 상태 ===
const initialState: AppState = {
  loading: {},
  errors: {},
  currentUser: null,
  users: [],
  projects: [],
  currentProject: null,
  tasks: [],
  milestones: [],
  schedules: [],
  posts: [],
  comments: [],
  ui: {
    sidebarCollapsed: false,
    activeTab: 'dashboard',
    selectedItems: [],
    modals: {},
    theme: 'light',
  },
};

// === 리듀서 함수 ===
const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    // 로딩 상태 관리
    case 'SET_LOADING':
      return {
        ...state,
        loading: { ...state.loading, [action.payload.key]: action.payload.state },
      };
    
    case 'CLEAR_LOADING':
      const { [action.payload]: _, ...restLoading } = state.loading;
      return { ...state, loading: restLoading };
    
    // 에러 상태 관리
    case 'SET_ERROR':
      return {
        ...state,
        errors: { ...state.errors, [action.payload.key]: action.payload.error },
      };
    
    case 'CLEAR_ERROR':
      const { [action.payload]: __, ...restErrors } = state.errors;
      return { ...state, errors: restErrors };
    
    case 'CLEAR_ALL_ERRORS':
      return { ...state, errors: {} };
    
    // 사용자 관리
    case 'SET_CURRENT_USER':
      return { ...state, currentUser: action.payload };
    
    case 'SET_USERS':
      return { ...state, users: action.payload };
    
    case 'ADD_USER':
      return { ...state, users: [...state.users, action.payload] };
    
    case 'UPDATE_USER':
      return {
        ...state,
        users: state.users.map(user => 
          user.id === action.payload.id ? action.payload : user
        ),
        currentUser: state.currentUser?.id === action.payload.id 
          ? action.payload 
          : state.currentUser,
      };
    
    case 'DELETE_USER':
      return {
        ...state,
        users: state.users.filter(user => user.id !== action.payload),
        currentUser: state.currentUser?.id === action.payload 
          ? null 
          : state.currentUser,
      };
    
    // 프로젝트 관리
    case 'SET_PROJECTS':
      return { ...state, projects: action.payload };
    
    case 'SET_CURRENT_PROJECT':
      return { ...state, currentProject: action.payload };
    
    case 'ADD_PROJECT':
      return { ...state, projects: [...state.projects, action.payload] };
    
    case 'UPDATE_PROJECT':
      return {
        ...state,
        projects: state.projects.map(project => 
          project.id === action.payload.id ? action.payload : project
        ),
        currentProject: state.currentProject?.id === action.payload.id 
          ? action.payload 
          : state.currentProject,
      };
    
    case 'DELETE_PROJECT':
      return {
        ...state,
        projects: state.projects.filter(project => project.id !== action.payload),
        currentProject: state.currentProject?.id === action.payload 
          ? null 
          : state.currentProject,
      };
    
    // 작업 관리
    case 'SET_TASKS':
      return { ...state, tasks: action.payload };
    
    case 'ADD_TASK':
      return { ...state, tasks: [...state.tasks, action.payload] };
    
    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map(task => 
          task.id === action.payload.id ? action.payload : task
        ),
      };
    
    case 'DELETE_TASK':
      return {
        ...state,
        tasks: state.tasks.filter(task => task.id !== action.payload),
      };
    
    // 마일스톤 관리
    case 'SET_MILESTONES':
      return { ...state, milestones: action.payload };
    
    case 'ADD_MILESTONE':
      return { ...state, milestones: [...state.milestones, action.payload] };
    
    case 'UPDATE_MILESTONE':
      return {
        ...state,
        milestones: state.milestones.map(milestone => 
          milestone.id === action.payload.id ? action.payload : milestone
        ),
      };
    
    case 'DELETE_MILESTONE':
      return {
        ...state,
        milestones: state.milestones.filter(milestone => milestone.id !== action.payload),
      };
    
    // 일정 관리
    case 'SET_SCHEDULES':
      return { ...state, schedules: action.payload };
    
    case 'ADD_SCHEDULE':
      return { ...state, schedules: [...state.schedules, action.payload] };
    
    case 'UPDATE_SCHEDULE':
      return {
        ...state,
        schedules: state.schedules.map(schedule => 
          schedule.id === action.payload.id ? action.payload : schedule
        ),
      };
    
    case 'DELETE_SCHEDULE':
      return {
        ...state,
        schedules: state.schedules.filter(schedule => schedule.id !== action.payload),
      };
    
    // 게시글 관리
    case 'SET_POSTS':
      return { ...state, posts: action.payload };
    
    case 'ADD_POST':
      return { ...state, posts: [...state.posts, action.payload] };
    
    case 'UPDATE_POST':
      return {
        ...state,
        posts: state.posts.map(post => 
          post.id === action.payload.id ? action.payload : post
        ),
      };
    
    case 'DELETE_POST':
      return {
        ...state,
        posts: state.posts.filter(post => post.id !== action.payload),
      };
    
    // 댓글 관리
    case 'SET_COMMENTS':
      return { ...state, comments: action.payload };
    
    case 'ADD_COMMENT':
      return { ...state, comments: [...state.comments, action.payload] };
    
    case 'UPDATE_COMMENT':
      return {
        ...state,
        comments: state.comments.map(comment => 
          comment.id === action.payload.id ? action.payload : comment
        ),
      };
    
    case 'DELETE_COMMENT':
      return {
        ...state,
        comments: state.comments.filter(comment => comment.id !== action.payload),
      };
    
    // UI 상태 관리
    case 'TOGGLE_SIDEBAR':
      return {
        ...state,
        ui: { ...state.ui, sidebarCollapsed: !state.ui.sidebarCollapsed },
      };
    
    case 'SET_ACTIVE_TAB':
      return {
        ...state,
        ui: { ...state.ui, activeTab: action.payload },
      };
    
    case 'SET_SELECTED_ITEMS':
      return {
        ...state,
        ui: { ...state.ui, selectedItems: action.payload },
      };
    
    case 'TOGGLE_MODAL':
      return {
        ...state,
        ui: {
          ...state.ui,
          modals: {
            ...state.ui.modals,
            [action.payload.key]: action.payload.isOpen ?? !state.ui.modals[action.payload.key],
          },
        },
      };
    
    case 'SET_THEME':
      return {
        ...state,
        ui: { ...state.ui, theme: action.payload },
      };
    
    case 'RESET_UI':
      return {
        ...state,
        ui: initialState.ui,
      };
    
    default:
      return state;
  }
};

// === Context 생성 ===
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

// === Provider 컴포넌트 ===
interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};

// === 커스텀 훅 ===
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

// === 특화된 훅들 ===

// 로딩 상태 관리 훅
export const useLoading = () => {
  const { state, dispatch } = useAppContext();
  
  const setLoading = (key: string, loadingState: 'idle' | 'loading' | 'success' | 'error') => {
    dispatch({ type: 'SET_LOADING', payload: { key, state: loadingState } });
  };
  
  const clearLoading = (key: string) => {
    dispatch({ type: 'CLEAR_LOADING', payload: key });
  };
  
  const isLoading = (key: string) => {
    return state.loading[key] === LOADING_STATES.LOADING;
  };
  
  return { loading: state.loading, setLoading, clearLoading, isLoading };
};

// 에러 상태 관리 훅
export const useError = () => {
  const { state, dispatch } = useAppContext();
  
  const setError = (key: string, error: string) => {
    dispatch({ type: 'SET_ERROR', payload: { key, error } });
  };
  
  const clearError = (key: string) => {
    dispatch({ type: 'CLEAR_ERROR', payload: key });
  };
  
  const clearAllErrors = () => {
    dispatch({ type: 'CLEAR_ALL_ERRORS' });
  };
  
  return { errors: state.errors, setError, clearError, clearAllErrors };
};

// 사용자 관리 훅
export const useUser = () => {
  const { state, dispatch } = useAppContext();
  
  const setCurrentUser = (user: User | null) => {
    dispatch({ type: 'SET_CURRENT_USER', payload: user });
  };
  
  const setUsers = (users: User[]) => {
    dispatch({ type: 'SET_USERS', payload: users });
  };
  
  const addUser = (user: User) => {
    dispatch({ type: 'ADD_USER', payload: user });
  };
  
  const updateUser = (user: User) => {
    dispatch({ type: 'UPDATE_USER', payload: user });
  };
  
  const deleteUser = (userId: string) => {
    dispatch({ type: 'DELETE_USER', payload: userId });
  };
  
  return {
    currentUser: state.currentUser,
    users: state.users,
    setCurrentUser,
    setUsers,
    addUser,
    updateUser,
    deleteUser,
  };
};

// 프로젝트 관리 훅
export const useProject = () => {
  const { state, dispatch } = useAppContext();
  
  const setProjects = (projects: Project[]) => {
    dispatch({ type: 'SET_PROJECTS', payload: projects });
  };
  
  const setCurrentProject = (project: Project | null) => {
    dispatch({ type: 'SET_CURRENT_PROJECT', payload: project });
  };
  
  const addProject = (project: Project) => {
    dispatch({ type: 'ADD_PROJECT', payload: project });
  };
  
  const updateProject = (project: Project) => {
    dispatch({ type: 'UPDATE_PROJECT', payload: project });
  };
  
  const deleteProject = (projectId: string) => {
    dispatch({ type: 'DELETE_PROJECT', payload: projectId });
  };
  
  return {
    projects: state.projects,
    currentProject: state.currentProject,
    setProjects,
    setCurrentProject,
    addProject,
    updateProject,
    deleteProject,
  };
};

// UI 상태 관리 훅
export const useUI = () => {
  const { state, dispatch } = useAppContext();
  
  const toggleSidebar = () => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
  };
  
  const setActiveTab = (tab: string) => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: tab });
  };
  
  const setSelectedItems = (items: string[]) => {
    dispatch({ type: 'SET_SELECTED_ITEMS', payload: items });
  };
  
  const toggleModal = (key: string, isOpen?: boolean) => {
    dispatch({ type: 'TOGGLE_MODAL', payload: { key, isOpen } });
  };
  
  const setTheme = (theme: 'light' | 'dark') => {
    dispatch({ type: 'SET_THEME', payload: theme });
  };
  
  const resetUI = () => {
    dispatch({ type: 'RESET_UI' });
  };
  
  return {
    ui: state.ui,
    toggleSidebar,
    setActiveTab,
    setSelectedItems,
    toggleModal,
    setTheme,
    resetUI,
  };
};
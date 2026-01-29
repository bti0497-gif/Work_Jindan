// 컴포넌트 Props 타입 정의
import React from 'react';
import { UserLevel } from '@/lib/permissions';
import { 
  Project, 
  User, 
  Task, 
  Milestone, 
  Schedule, 
  UserSchedule, 
  ProjectFile, 
  Post, 
  Comment,
  FacilityContact,
  ProjectStatus,
  TaskStatus,
  TaskPriority,
  MilestoneStatus 
} from './database';

// 기본 컴포넌트 Props
export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
}

// 권한 인식 Props
export interface PermissionAwareProps {
  userLevel: UserLevel;
  permissions: any;
}

// 프로젝트 인식 Props
export interface ProjectAwareProps {
  projectId?: string;
  selectedProject?: Project | null;
  onProjectSelect?: (project: Project | null) => void;
}

// === 레이아웃 컴포넌트 Props ===

export interface MainLayoutProps extends BaseComponentProps {
  // 레이아웃 관련 props는 children만 필요
}

export interface HeaderProps extends BaseComponentProps {
  title: string;
  user?: User | null;
  onUserMenuClick?: () => void;
}

export interface LeftSidebarProps extends BaseComponentProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export interface RightSidebarProps extends BaseComponentProps {
  messages: any[];
  onSendMessage?: (message: string) => void;
}

export interface TabNavigationProps extends BaseComponentProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs?: TabConfig[];
}

export interface TabConfig {
  id: string;
  label: string;
  icon?: React.ComponentType<any>;
  disabled?: boolean;
  badge?: number;
}

// === 프로젝트 관련 컴포넌트 Props ===

export interface ProjectListViewProps extends BaseComponentProps {
  projects?: Project[];
  loading?: boolean;
  error?: string | null;
  onProjectSelect?: (project: Project) => void;
  onProjectCreate?: () => void;
  onProjectEdit?: (project: Project) => void;
  onProjectDelete?: (project: Project) => void;
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  sortBy?: string;
  onSortChange?: (sortBy: string) => void;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

export interface CompactProjectManagerProps extends BaseComponentProps, PermissionAwareProps {
  selectedProject?: Project | null;
  mode?: 'create' | 'edit' | 'view';
  onSubmit?: (data: any) => void;
  onCancel?: () => void;
  loading?: boolean;
  error?: string | null;
}

export interface ProjectCardProps extends BaseComponentProps {
  project: Project;
  onClick?: (project: Project) => void;
  onEdit?: (project: Project) => void;
  onDelete?: (project: Project) => void;
  showActions?: boolean;
}

// === 작업 관리 컴포넌트 Props ===

export interface TaskManagerProps extends BaseComponentProps, ProjectAwareProps {
  tasks?: Task[];
  loading?: boolean;
  error?: string | null;
  onTaskCreate?: (data: any) => void;
  onTaskUpdate?: (id: string, data: any) => void;
  onTaskDelete?: (id: string) => void;
  onStatusChange?: (id: string, status: TaskStatus) => void;
}

export interface TaskCardProps extends BaseComponentProps {
  task: Task;
  onClick?: (task: Task) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onStatusChange?: (task: Task, status: TaskStatus) => void;
  showProject?: boolean;
  showAssignee?: boolean;
}

export interface TaskFormProps extends BaseComponentProps {
  task?: Task | null;
  projectId?: string;
  mode?: 'create' | 'edit';
  onSubmit?: (data: any) => void;
  onCancel?: () => void;
  loading?: boolean;
  error?: string | null;
}

// === 공정 관리 컴포넌트 Props ===

export interface ProcessManagerProps extends BaseComponentProps, ProjectAwareProps {
  milestones?: Milestone[];
  loading?: boolean;
  error?: string | null;
  onMilestoneCreate?: (data: any) => void;
  onMilestoneUpdate?: (id: string, data: any) => void;
  onMilestoneDelete?: (id: string) => void;
  onProgressUpdate?: (id: string, progress: number) => void;
}

export interface MilestoneCardProps extends BaseComponentProps {
  milestone: Milestone;
  onClick?: (milestone: Milestone) => void;
  onEdit?: (milestone: Milestone) => void;
  onDelete?: (milestone: Milestone) => void;
  onProgressChange?: (milestone: Milestone, progress: number) => void;
  showProject?: boolean;
}

export interface GanttChartProps extends BaseComponentProps {
  milestones: Milestone[];
  onMilestoneClick?: (milestone: Milestone) => void;
  onDateChange?: (milestoneId: string, startDate: string, endDate: string) => void;
  readOnly?: boolean;
}

// === 일정 & 작업 통합 관리 컴포넌트 Props ===

export interface ScheduleTaskManagerProps extends BaseComponentProps, ProjectAwareProps {
  schedules?: Schedule[];
  tasks?: Task[];
  userSchedules?: UserSchedule[];
  loading?: boolean;
  error?: string | null;
  activeView?: 'calendar' | 'tasks';
  onViewChange?: (view: 'calendar' | 'tasks') => void;
  onScheduleCreate?: (data: any) => void;
  onScheduleUpdate?: (id: string, data: any) => void;
  onScheduleDelete?: (id: string) => void;
  onTaskCreate?: (data: any) => void;
  onTaskUpdate?: (id: string, data: any) => void;
  onTaskDelete?: (id: string) => void;
  onTaskStatusChange?: (id: string, status: TaskStatus) => void;
}

// === 기존 일정 관리 컴포넌트 Props (하위 호환성) ===

export interface CalendarManagerProps extends BaseComponentProps, ProjectAwareProps {
  schedules?: Schedule[];
  userSchedules?: UserSchedule[];
  loading?: boolean;
  error?: string | null;
  onScheduleCreate?: (data: any) => void;
  onScheduleUpdate?: (id: string, data: any) => void;
  onScheduleDelete?: (id: string) => void;
  view?: 'month' | 'week' | 'day';
  onViewChange?: (view: string) => void;
}

export interface CalendarProps extends BaseComponentProps {
  events: (Schedule | UserSchedule)[];
  onEventClick?: (event: Schedule | UserSchedule) => void;
  onDateClick?: (date: string) => void;
  onEventDrop?: (eventId: string, newDate: string) => void;
  view?: 'month' | 'week' | 'day';
  currentDate?: string;
  onDateChange?: (date: string) => void;
}

// === 파일 관리 컴포넌트 Props ===

export interface FileManagerProps extends BaseComponentProps, ProjectAwareProps {
  files?: ProjectFile[];
  loading?: boolean;
  error?: string | null;
  onFileUpload?: (files: File[]) => void;
  onFileDelete?: (id: string) => void;
  onFileDownload?: (id: string) => void;
  onFileRename?: (id: string, newName: string) => void;
  maxFileSize?: number;
  allowedTypes?: string[];
}

export interface FileListProps extends BaseComponentProps {
  files: ProjectFile[];
  onFileClick?: (file: ProjectFile) => void;
  onFileDelete?: (file: ProjectFile) => void;
  onFileDownload?: (file: ProjectFile) => void;
  onFileRename?: (file: ProjectFile, newName: string) => void;
  showActions?: boolean;
  viewMode?: 'list' | 'grid';
}

export interface FileUploadProps extends BaseComponentProps {
  onFileSelect?: (files: File[]) => void;
  onUpload?: (files: File[]) => void;
  maxFileSize?: number;
  allowedTypes?: string[];
  multiple?: boolean;
  dragAndDrop?: boolean;
}

// === 게시판 컴포넌트 Props ===

export interface GlobalBoardProps extends BaseComponentProps {
  posts?: Post[];
  loading?: boolean;
  error?: string | null;
  onPostCreate?: (data: any) => void;
  onPostUpdate?: (id: string, data: any) => void;
  onPostDelete?: (id: string) => void;
  onPostView?: (id: string) => void;
  showNoticeOnly?: boolean;
}

export interface PostCardProps extends BaseComponentProps {
  post: Post;
  onClick?: (post: Post) => void;
  onEdit?: (post: Post) => void;
  onDelete?: (post: Post) => void;
  showAuthor?: boolean;
  showCommentCount?: boolean;
  compact?: boolean;
}

export interface PostFormProps extends BaseComponentProps {
  post?: Post | null;
  mode?: 'create' | 'edit';
  onSubmit?: (data: any) => void;
  onCancel?: () => void;
  loading?: boolean;
  error?: string | null;
  allowNotice?: boolean;
}

export interface CommentListProps extends BaseComponentProps {
  comments: Comment[];
  onCommentCreate?: (data: any) => void;
  onCommentUpdate?: (id: string, data: any) => void;
  onCommentDelete?: (id: string) => void;
  loading?: boolean;
  error?: string | null;
}

// === 사용자 관리 컴포넌트 Props ===

export interface UserManagementProps extends BaseComponentProps, PermissionAwareProps {
  users?: User[];
  loading?: boolean;
  error?: string | null;
  onUserCreate?: (data: any) => void;
  onUserUpdate?: (id: string, data: any) => void;
  onUserDelete?: (id: string) => void;
  onUserLevelChange?: (id: string, level: UserLevel) => void;
  onUserStatusChange?: (id: string, isActive: boolean) => void;
}

export interface UserProfileProps extends BaseComponentProps {
  user: User;
  editable?: boolean;
  onUpdate?: (data: any) => void;
  onPasswordChange?: (data: any) => void;
  loading?: boolean;
  error?: string | null;
}

// === 폼 관련 컴포넌트 Props ===

export interface FormState<T> {
  data: T;
  errors: Partial<Record<keyof T, string>>;
  isSubmitting: boolean;
  isDirty: boolean;
}

export interface FormFieldProps extends BaseComponentProps {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password' | 'tel' | 'url' | 'number' | 'date' | 'datetime-local' | 'textarea' | 'select';
  value?: any;
  onChange?: (value: any) => void;
  onBlur?: () => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: any }>;
  rows?: number;
  autoComplete?: string;
}

export interface SearchInputProps extends BaseComponentProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onSearch?: (value: string) => void;
  debounceMs?: number;
}

// === 모달 관련 Props ===

export interface ModalState {
  isOpen: boolean;
  mode: 'create' | 'edit' | 'delete' | 'view';
  data?: any;
}

export interface ModalProps extends BaseComponentProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closable?: boolean;
  maskClosable?: boolean;
  footer?: React.ReactNode;
}

export interface ConfirmModalProps extends BaseComponentProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'warning' | 'error' | 'success';
}

// === 권한 컴포넌트 Props ===

export interface PermissionWrapperProps extends BaseComponentProps {
  userLevel: UserLevel;
  requiredLevel?: UserLevel;
  requiredPermissions?: string[];
  fallback?: React.ReactNode;
}

export interface PermissionButtonProps extends BaseComponentProps {
  userLevel: UserLevel;
  requiredLevel?: UserLevel;
  requiredPermissions?: string[];
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
}

// === 상태 표시 컴포넌트 Props ===

export interface StatusBadgeProps extends BaseComponentProps {
  status: ProjectStatus | TaskStatus | MilestoneStatus | string;
  variant?: 'default' | 'outlined' | 'filled';
  size?: 'sm' | 'md' | 'lg';
}

export interface ProgressBarProps extends BaseComponentProps {
  value: number;
  max?: number;
  showLabel?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

// === 로딩 및 오류 표시 Props ===

export interface LoadingSpinnerProps extends BaseComponentProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  overlay?: boolean;
}

export interface ErrorBoundaryProps extends BaseComponentProps {
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
  onError?: (error: Error, errorInfo: any) => void;
}

export interface EmptyStateProps extends BaseComponentProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

// === 네비게이션 관련 Props ===

export interface BreadcrumbProps extends BaseComponentProps {
  items: Array<{
    label: string;
    href?: string;
    onClick?: () => void;
    active?: boolean;
  }>;
  separator?: React.ReactNode;
}

export interface PaginationProps extends BaseComponentProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showFirstLast?: boolean;
  showPrevNext?: boolean;
  maxVisiblePages?: number;
  disabled?: boolean;
}
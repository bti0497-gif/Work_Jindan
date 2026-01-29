import { Project, Process, Task, BoardPost, User } from '@/types/common';

/**
 * 인증(Auth) API 규격
 */
export interface LoginParams {
  id: string;
  password?: string;
  rememberId: boolean;
}

export interface SignupParams {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  detailAddress: string;
  avatar: string;
}

export interface UpdateProfileParams extends Partial<SignupParams> {
  currentPassword?: string;
  newPassword?: string;
}

/**
 * 공통 페이징/검색 규격
 */
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface SearchParams {
  keyword?: string;
  sortBy?: 'latest' | 'oldest' | 'views' | 'priority';
}

/**
 * 게시판(Board) API 규격
 */
export interface BoardRequestParams extends PaginationParams, SearchParams {
  category?: string;
}

export interface BoardResponse {
  items: BoardPost[];
  totalCount: number;
  currentPage: number;
}

/**
 * 할일(Task) API 규격
 */
// Fix: Added TaskRequestParams and CreateTaskParams to resolve import errors in hooks/useTaskViewModel.ts
export interface TaskRequestParams extends PaginationParams, SearchParams {
  completed?: boolean;
  authorId?: string;
}

export interface CreateTaskParams {
  text: string;
  targetDate: string;
  isPublic: boolean;
}

/**
 * 프로젝트(Project) 및 공정(Process) API 규격
 */
export interface ProjectRequestParams extends PaginationParams, SearchParams {
  status?: 'In Progress' | 'Completed';
}

export interface CreateProcessParams {
  title: string;
  startDate: string;
  endDate: string;
  description: string;
  members: string[];
}

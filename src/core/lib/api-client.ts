// 클라이언트용 API 호출 함수들
import { 
  ApiResponse,
  ProjectResponse,
  ProjectListResponse,
  CreateProjectData,
  UpdateProjectData,
  ProjectFilter,
  TaskResponse,
  TaskListResponse,
  CreateTaskData,
  UpdateTaskData,
  TaskFilter,
  MilestoneResponse,
  MilestoneListResponse,
  CreateMilestoneData,
  UpdateMilestoneData,
  MilestoneFilter,
  ScheduleResponse,
  ScheduleListResponse,
  UserScheduleResponse,
  UserScheduleListResponse,
  CreateScheduleData,
  UpdateScheduleData,
  CreateUserScheduleData,
  UpdateUserScheduleData,
  ScheduleFilter,
  FileResponse,
  FileListResponse,
  FileUploadResponse,
  CreateFileData,
  FileFilter,
  UserResponse,
  UserListResponse,
  CreateUserData,
  UpdateUserData,
  ChangePasswordData,
  PostResponse,
  PostListResponse,
  CreatePostData,
  UpdatePostData,
  PostFilter,
  CommentResponse,
  CommentListResponse,
  CreateCommentData,
  UpdateCommentData
} from '@/types/api';

// 기본 API 설정
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

// API 요청 헬퍼 함수
class ApiClient {
  private static async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  private static buildQueryString(params: Record<string, any>): string {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    });

    return searchParams.toString();
  }

  // GET 요청
  static async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const queryString = params ? this.buildQueryString(params) : '';
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    
    return this.request<T>(url, {
      method: 'GET',
    });
  }

  // POST 요청
  static async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // PUT 요청
  static async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // DELETE 요청
  static async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }

  // 파일 업로드
  static async upload<T>(endpoint: string, formData: FormData): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: formData,
      headers: {
        // Content-Type은 FormData 사용 시 자동 설정
      },
    });
  }
}

// === 프로젝트 API ===
export class ProjectAPI {
  // 프로젝트 목록 조회
  static async getProjects(filter?: ProjectFilter): Promise<ProjectListResponse> {
    return ApiClient.get<ProjectListResponse>('/api/projects', filter);
  }

  // 단일 프로젝트 조회
  static async getProject(id: string): Promise<ProjectResponse> {
    return ApiClient.get<ProjectResponse>(`/api/projects/${id}`);
  }

  // 프로젝트 생성
  static async createProject(data: CreateProjectData): Promise<ProjectResponse> {
    return ApiClient.post<ProjectResponse>('/api/projects', data);
  }

  // 프로젝트 수정
  static async updateProject(id: string, data: UpdateProjectData): Promise<ProjectResponse> {
    return ApiClient.put<ProjectResponse>(`/api/projects/${id}`, data);
  }

  // 프로젝트 삭제
  static async deleteProject(id: string): Promise<ApiResponse> {
    return ApiClient.delete<ApiResponse>(`/api/projects/${id}`);
  }

  // 프로젝트 멤버 추가
  static async addMember(projectId: string, data: { userId: string; role?: string; specialty?: string }): Promise<ApiResponse> {
    return ApiClient.post<ApiResponse>(`/api/projects/${projectId}/members`, data);
  }

  // 프로젝트 멤버 제거
  static async removeMember(projectId: string, userId: string): Promise<ApiResponse> {
    return ApiClient.delete<ApiResponse>(`/api/projects/${projectId}/members/${userId}`);
  }
}

// === 작업 API ===
export class TaskAPI {
  // 작업 목록 조회
  static async getTasks(filter?: TaskFilter): Promise<TaskListResponse> {
    return ApiClient.get<TaskListResponse>('/api/tasks', filter);
  }

  // 단일 작업 조회
  static async getTask(id: string): Promise<TaskResponse> {
    return ApiClient.get<TaskResponse>(`/api/tasks/${id}`);
  }

  // 작업 생성
  static async createTask(data: CreateTaskData): Promise<TaskResponse> {
    return ApiClient.post<TaskResponse>('/api/tasks', data);
  }

  // 작업 수정
  static async updateTask(id: string, data: UpdateTaskData): Promise<TaskResponse> {
    return ApiClient.put<TaskResponse>(`/api/tasks/${id}`, data);
  }

  // 작업 삭제
  static async deleteTask(id: string): Promise<ApiResponse> {
    return ApiClient.delete<ApiResponse>(`/api/tasks/${id}`);
  }
}

// === 공정관리 API ===
export class MilestoneAPI {
  // 마일스톤 목록 조회
  static async getMilestones(filter?: MilestoneFilter): Promise<MilestoneListResponse> {
    return ApiClient.get<MilestoneListResponse>('/api/milestones', filter);
  }

  // 단일 마일스톤 조회
  static async getMilestone(id: string): Promise<MilestoneResponse> {
    return ApiClient.get<MilestoneResponse>(`/api/milestones/${id}`);
  }

  // 마일스톤 생성
  static async createMilestone(data: CreateMilestoneData): Promise<MilestoneResponse> {
    return ApiClient.post<MilestoneResponse>('/api/milestones', data);
  }

  // 마일스톤 수정
  static async updateMilestone(id: string, data: UpdateMilestoneData): Promise<MilestoneResponse> {
    return ApiClient.put<MilestoneResponse>(`/api/milestones/${id}`, data);
  }

  // 마일스톤 삭제
  static async deleteMilestone(id: string): Promise<ApiResponse> {
    return ApiClient.delete<ApiResponse>(`/api/milestones/${id}`);
  }

  // 진행률 업데이트
  static async updateProgress(id: string, progress: number): Promise<MilestoneResponse> {
    return ApiClient.put<MilestoneResponse>(`/api/milestones/${id}`, { progress });
  }
}

// === 일정 API ===
export class ScheduleAPI {
  // 프로젝트 일정 목록 조회
  static async getSchedules(filter?: ScheduleFilter): Promise<ScheduleListResponse> {
    return ApiClient.get<ScheduleListResponse>('/api/schedules', filter);
  }

  // 사용자 일정 목록 조회
  static async getUserSchedules(filter?: { userId?: string; date?: string }): Promise<UserScheduleListResponse> {
    return ApiClient.get<UserScheduleListResponse>('/api/schedules/user', filter);
  }

  // 단일 일정 조회
  static async getSchedule(id: string): Promise<ScheduleResponse> {
    return ApiClient.get<ScheduleResponse>(`/api/schedules/${id}`);
  }

  // 사용자 일정 조회
  static async getUserSchedule(id: string): Promise<UserScheduleResponse> {
    return ApiClient.get<UserScheduleResponse>(`/api/schedules/user/${id}`);
  }

  // 프로젝트 일정 생성
  static async createSchedule(data: CreateScheduleData): Promise<ScheduleResponse> {
    return ApiClient.post<ScheduleResponse>('/api/schedules', data);
  }

  // 사용자 일정 생성
  static async createUserSchedule(data: CreateUserScheduleData): Promise<UserScheduleResponse> {
    return ApiClient.post<UserScheduleResponse>('/api/schedules/user', data);
  }

  // 프로젝트 일정 수정
  static async updateSchedule(id: string, data: UpdateScheduleData): Promise<ScheduleResponse> {
    return ApiClient.put<ScheduleResponse>(`/api/schedules/${id}`, data);
  }

  // 사용자 일정 수정
  static async updateUserSchedule(id: string, data: UpdateUserScheduleData): Promise<UserScheduleResponse> {
    return ApiClient.put<UserScheduleResponse>(`/api/schedules/user/${id}`, data);
  }

  // 일정 삭제
  static async deleteSchedule(id: string): Promise<ApiResponse> {
    return ApiClient.delete<ApiResponse>(`/api/schedules/${id}`);
  }

  // 사용자 일정 삭제
  static async deleteUserSchedule(id: string): Promise<ApiResponse> {
    return ApiClient.delete<ApiResponse>(`/api/schedules/user/${id}`);
  }
}

// === 파일 API ===
export class FileAPI {
  // 파일 목록 조회
  static async getFiles(filter?: FileFilter): Promise<FileListResponse> {
    return ApiClient.get<FileListResponse>('/api/files', filter);
  }

  // 단일 파일 정보 조회
  static async getFile(id: string): Promise<FileResponse> {
    return ApiClient.get<FileResponse>(`/api/files/${id}`);
  }

  // 파일 업로드
  static async uploadFile(projectId: string, files: File[]): Promise<FileUploadResponse> {
    const formData = new FormData();
    formData.append('projectId', projectId);
    
    files.forEach((file, index) => {
      formData.append(`files`, file);
    });

    return ApiClient.upload<FileUploadResponse>('/api/files/upload', formData);
  }

  // 파일 삭제
  static async deleteFile(id: string): Promise<ApiResponse> {
    return ApiClient.delete<ApiResponse>(`/api/files/${id}`);
  }

  // 파일 다운로드 URL 생성
  static getDownloadUrl(id: string): string {
    return `${API_BASE_URL}/api/files/${id}/download`;
  }
}

// === 사용자 API ===
export class UserAPI {
  // 사용자 목록 조회
  static async getUsers(filter?: { search?: string; userLevel?: number; isActive?: boolean }): Promise<UserListResponse> {
    return ApiClient.get<UserListResponse>('/api/admin/users', filter);
  }

  // 단일 사용자 조회
  static async getUser(id: string): Promise<UserResponse> {
    return ApiClient.get<UserResponse>(`/api/admin/users/${id}`);
  }

  // 현재 사용자 프로필 조회
  static async getProfile(): Promise<UserResponse> {
    return ApiClient.get<UserResponse>('/api/user/profile');
  }

  // 사용자 생성
  static async createUser(data: CreateUserData): Promise<UserResponse> {
    return ApiClient.post<UserResponse>('/api/admin/users', data);
  }

  // 사용자 정보 수정
  static async updateUser(id: string, data: UpdateUserData): Promise<UserResponse> {
    return ApiClient.put<UserResponse>(`/api/admin/users/${id}`, data);
  }

  // 프로필 수정
  static async updateProfile(data: UpdateUserData): Promise<UserResponse> {
    return ApiClient.put<UserResponse>('/api/user/profile', data);
  }

  // 비밀번호 변경
  static async changePassword(data: ChangePasswordData): Promise<ApiResponse> {
    return ApiClient.put<ApiResponse>('/api/user/change-password', data);
  }

  // 사용자 삭제
  static async deleteUser(id: string): Promise<ApiResponse> {
    return ApiClient.delete<ApiResponse>(`/api/admin/users/${id}`);
  }

  // 사용자 레벨 변경
  static async changeUserLevel(id: string, userLevel: number, reason?: string): Promise<ApiResponse> {
    return ApiClient.put<ApiResponse>(`/api/admin/users/${id}/level`, { userLevel, reason });
  }

  // 사용자 활성화/비활성화
  static async toggleUserStatus(id: string, isActive: boolean, reason?: string): Promise<ApiResponse> {
    return ApiClient.put<ApiResponse>(`/api/admin/users/${id}/toggle`, { isActive, reason });
  }
}

// === 게시판 API ===
export class PostAPI {
  // 게시글 목록 조회
  static async getPosts(filter?: PostFilter): Promise<PostListResponse> {
    return ApiClient.get<PostListResponse>('/api/posts', filter);
  }

  // 단일 게시글 조회
  static async getPost(id: string): Promise<PostResponse> {
    return ApiClient.get<PostResponse>(`/api/posts/${id}`);
  }

  // 게시글 생성
  static async createPost(data: CreatePostData): Promise<PostResponse> {
    return ApiClient.post<PostResponse>('/api/posts', data);
  }

  // 게시글 수정
  static async updatePost(id: string, data: UpdatePostData): Promise<PostResponse> {
    return ApiClient.put<PostResponse>(`/api/posts/${id}`, data);
  }

  // 게시글 삭제
  static async deletePost(id: string): Promise<ApiResponse> {
    return ApiClient.delete<ApiResponse>(`/api/posts/${id}`);
  }

  // 조회수 증가
  static async incrementViewCount(id: string): Promise<ApiResponse> {
    return ApiClient.post<ApiResponse>(`/api/posts/${id}/view`);
  }
}

// === 댓글 API ===
export class CommentAPI {
  // 댓글 목록 조회
  static async getComments(postId: string): Promise<CommentListResponse> {
    return ApiClient.get<CommentListResponse>(`/api/comments?postId=${postId}`);
  }

  // 댓글 생성
  static async createComment(data: CreateCommentData): Promise<CommentResponse> {
    return ApiClient.post<CommentResponse>('/api/comments', data);
  }

  // 댓글 수정
  static async updateComment(id: string, data: UpdateCommentData): Promise<CommentResponse> {
    return ApiClient.put<CommentResponse>(`/api/comments/${id}`, data);
  }

  // 댓글 삭제
  static async deleteComment(id: string): Promise<ApiResponse> {
    return ApiClient.delete<ApiResponse>(`/api/comments/${id}`);
  }
}

// 모든 API 클래스를 하나의 객체로 내보내기
export const API = {
  Project: ProjectAPI,
  Task: TaskAPI,
  Milestone: MilestoneAPI,
  Schedule: ScheduleAPI,
  File: FileAPI,
  User: UserAPI,
  Post: PostAPI,
  Comment: CommentAPI,
};

export default API;
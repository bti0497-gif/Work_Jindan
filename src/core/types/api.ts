// API 요청/응답 타입 정의
import { 
  Project, 
  ProjectStatus, 
  User, 
  Task, 
  TaskStatus, 
  TaskPriority,
  Milestone,
  MilestoneStatus,
  Schedule,
  UserSchedule,
  ProjectFile,
  Post,
  Comment,
  FacilityContact,
  MemberRole 
} from './database';

// 기본 API 응답 인터페이스
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 페이지네이션 정보
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// 페이지네이션된 응답
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: PaginationInfo;
}

// 필터 및 정렬 타입들
export interface BaseFilter {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

// === 프로젝트 API 타입들 ===

export interface ProjectFilter extends BaseFilter {
  status?: ProjectStatus;
  ownerId?: string;
  facilityType?: string;
  diagnosisType?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateProjectData {
  name: string;
  description?: string;
  color?: string;
  status?: ProjectStatus;
  
  // 처리장 특화 필드
  facilityType?: string;
  facilityName?: string;
  address?: string;
  diagnosisType?: string;
  startDate?: string;
  endDate?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  specialNotes?: string;
}

export interface UpdateProjectData extends Partial<CreateProjectData> {
  id?: never; // id는 수정할 수 없음
  ownerId?: never; // ownerId도 수정할 수 없음
}

export interface ProjectResponse extends ApiResponse<Project> {}
export interface ProjectListResponse extends ApiResponse<Project[]> {}

// === 작업 API 타입들 ===

export interface TaskFilter extends BaseFilter {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  projectId?: string;
  dueDate?: string;
}

export interface CreateTaskData {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string;
  projectId: string;
  assigneeId?: string;
}

export interface UpdateTaskData extends Partial<CreateTaskData> {
  id?: never;
}

export interface TaskResponse extends ApiResponse<Task> {}
export interface TaskListResponse extends ApiResponse<Task[]> {}

// === 공정관리 API 타입들 ===

export interface MilestoneFilter extends BaseFilter {
  status?: MilestoneStatus;
  projectId?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateMilestoneData {
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  status?: MilestoneStatus;
  progress?: number;
  projectId: string;
  order?: number;
  dependencies?: string[];
}

export interface UpdateMilestoneData extends Partial<CreateMilestoneData> {
  id?: never;
}

export interface MilestoneResponse extends ApiResponse<Milestone> {}
export interface MilestoneListResponse extends ApiResponse<Milestone[]> {}

// === 일정 API 타입들 ===

export interface ScheduleFilter extends BaseFilter {
  date?: string;
  projectId?: string;
  userId?: string;
  isTeamEvent?: boolean;
  isCompleted?: boolean;
  isNotice?: boolean;
  priority?: string;
}

export interface CreateScheduleData {
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  projectId: string;
  
  // 공지 관련 필드 (관리자용)
  isNotice?: boolean;
  priority?: 'high' | 'normal' | 'low';
}

export interface UpdateScheduleData extends Partial<CreateScheduleData> {
  id?: never;
}

export interface CreateUserScheduleData {
  title: string;
  description?: string;
  date: string;
  isTeamEvent?: boolean;
  userId: string;
}

export interface UpdateUserScheduleData extends Partial<CreateUserScheduleData> {
  id?: never;
}

export interface ScheduleResponse extends ApiResponse<Schedule> {}
export interface ScheduleListResponse extends ApiResponse<Schedule[]> {}
export interface UserScheduleResponse extends ApiResponse<UserSchedule> {}
export interface UserScheduleListResponse extends ApiResponse<UserSchedule[]> {}

// === 파일 API 타입들 ===

export interface FileFilter extends BaseFilter {
  projectId?: string;
  mimeType?: string;
  uploadedById?: string;
}

export interface CreateFileData {
  fileName: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  filePath: string;
  projectId: string;
  uploadedById: string;
}

export interface FileResponse extends ApiResponse<ProjectFile> {}
export interface FileListResponse extends ApiResponse<ProjectFile[]> {}

export interface FileUploadResponse extends ApiResponse<{
  file: ProjectFile;
  uploadUrl?: string;
}> {}

// === 게시판 API 타입들 ===

export interface PostFilter extends BaseFilter {
  isNotice?: boolean;
  authorId?: string;
}

export interface CreatePostData {
  title: string;
  content: string;
  isNotice?: boolean;
  authorId: string;
}

export interface UpdatePostData extends Partial<CreatePostData> {
  id?: never;
  authorId?: never;
}

export interface CreateCommentData {
  content: string;
  postId: string;
  authorId: string;
}

export interface UpdateCommentData {
  content: string;
}

export interface PostResponse extends ApiResponse<Post> {}
export interface PostListResponse extends ApiResponse<Post[]> {}
export interface CommentResponse extends ApiResponse<Comment> {}
export interface CommentListResponse extends ApiResponse<Comment[]> {}

// === 사용자 API 타입들 ===

export interface UserFilter extends BaseFilter {
  userLevel?: number;
  isActive?: boolean;
  position?: string;
}

export interface CreateUserData {
  email: string;
  name: string;
  password: string;
  phone?: string;
  position?: string;
  userLevel?: number;
  isActive?: boolean;
}

export interface UpdateUserData {
  name?: string;
  phone?: string;
  position?: string;
  userLevel?: number;
  isActive?: boolean;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface UserResponse extends ApiResponse<User> {}
export interface UserListResponse extends ApiResponse<User[]> {}

// === 프로젝트 멤버 API 타입들 ===

export interface AddProjectMemberData {
  userId: string;
  role?: MemberRole;
  specialty?: string;
}

export interface UpdateProjectMemberData {
  role?: MemberRole;
  specialty?: string;
}

// === 처리장 담당자 API 타입들 ===

export interface ContactFilter extends BaseFilter {
  projectId?: string;
  isPrimary?: boolean;
  isActive?: boolean;
  specialty?: string;
}

export interface CreateContactData {
  projectId: string;
  name: string;
  position: string;
  department?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  extension?: string;
  responsibilities?: string;
  specialty?: string;
  isPrimary?: boolean;
  isActive?: boolean;
  notes?: string;
}

export interface UpdateContactData extends Partial<CreateContactData> {
  id?: never;
  projectId?: never;
}

export interface ContactResponse extends ApiResponse<FacilityContact> {}
export interface ContactListResponse extends ApiResponse<FacilityContact[]> {}

// === 인증 API 타입들 ===

export interface LoginData {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  name: string;
  password: string;
  confirmPassword: string;
  phone?: string;
  position?: string;
}

export interface LoginResponse extends ApiResponse<{
  user: User;
  token?: string;
}> {}

export interface RegisterResponse extends ApiResponse<{
  user: User;
  message: string;
}> {}

// === 대시보드 API 타입들 ===

export interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  completedTasks: number;
  pendingTasks: number;
  upcomingDeadlines: number;
  teamMembers: number;
}

export interface DashboardResponse extends ApiResponse<DashboardStats> {}

// === 통계 API 타입들 ===

export interface ProjectStats {
  projectId: string;
  projectName: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  completionRate: number;
  totalFiles: number;
  totalMembers: number;
  lastActivity: string;
}

export interface ProjectStatsResponse extends ApiResponse<ProjectStats[]> {}

// === 검색 API 타입들 ===

export interface SearchFilter {
  query: string;
  type?: 'projects' | 'tasks' | 'posts' | 'files' | 'all';
  projectId?: string;
  limit?: number;
}

export interface SearchResult {
  type: 'project' | 'task' | 'post' | 'file' | 'user';
  id: string;
  title: string;
  description?: string;
  url: string;
  relevance: number;
}

export interface SearchResponse extends ApiResponse<SearchResult[]> {}
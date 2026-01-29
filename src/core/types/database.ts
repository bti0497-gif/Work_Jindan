// 데이터베이스 모델에서 확장된 타입 정의
import { UserLevel } from '@/lib/permissions';

// 기본 엔티티 인터페이스
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

// 사용자 타입
export interface User extends BaseEntity {
  email: string;
  name: string;
  phone?: string;
  position?: string;
  userLevel: UserLevel;
  isActive: boolean;
  avatar?: string;
}

// 프로젝트 상태 타입
export type ProjectStatus = 'planning' | 'active' | 'completed' | 'on_hold' | 'cancelled';

// 프로젝트 타입
export interface Project extends BaseEntity {
  name: string;
  description?: string;
  color: string;
  status: ProjectStatus;
  ownerId: string;
  
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
  
  // 관계 데이터
  owner?: User;
  members?: ProjectMember[];
  facilityContacts?: FacilityContact[];
  
  // 계산된 필드
  memberCount?: number;
  scheduleCount?: number;
  taskCount?: number;
  fileCount?: number;
  
  // 통계 데이터
  taskStats?: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
  };
}

// 프로젝트 멤버 역할
export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';

// 프로젝트 멤버 타입
export interface ProjectMember extends BaseEntity {
  projectId: string;
  userId: string;
  role: MemberRole;
  specialty?: string;
  joinedAt: string;
  user: User;
}

// 작업 상태 및 우선순위
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// 작업 타입
export interface Task extends BaseEntity {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  projectId: string;
  assigneeId?: string;
  
  // 관계 데이터
  project?: Project;
  assignee?: User;
}

// 공정 상태
export type MilestoneStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';

// 공정 단계 (마일스톤) 타입
export interface Milestone extends BaseEntity {
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  status: MilestoneStatus;
  progress: number;
  projectId: string;
  order: number;
  dependencies?: string[];
  
  // 관계 데이터
  project?: Project;
}

// 일정 타입
export interface Schedule extends BaseEntity {
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  projectId: string;
  
  // 공지 관련 필드
  isNotice: boolean;
  createdBy?: string;
  priority: 'high' | 'normal' | 'low';
  
  // 관계 데이터
  project?: Project;
}

// 사용자 일정 타입
export interface UserSchedule extends BaseEntity {
  title: string;
  description?: string;
  date: string;
  isCompleted: boolean;
  isTeamEvent: boolean;
  userId: string;
  
  // 관계 데이터
  user: User;
}

// 파일 타입
export interface ProjectFile extends BaseEntity {
  fileName: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  filePath: string;
  projectId: string;
  uploadedById: string;
  
  // 관계 데이터
  project?: Project;
  uploadedBy?: User;
}

// 게시글 타입
export interface Post extends BaseEntity {
  title: string;
  content: string;
  isNotice: boolean;
  viewCount: number;
  authorId: string;
  
  // 관계 데이터
  author: User;
  comments?: Comment[];
  _count?: {
    comments: number;
  };
}

// 댓글 타입
export interface Comment extends BaseEntity {
  content: string;
  postId: string;
  authorId: string;
  
  // 관계 데이터
  post?: Post;
  author: User;
}

// 처리장 담당자 타입
export interface FacilityContact extends BaseEntity {
  projectId: string;
  
  // 담당자 기본 정보
  name: string;
  position: string;
  department?: string;
  
  // 연락처 정보
  phone?: string;
  mobile?: string;
  email?: string;
  extension?: string;
  
  // 담당 업무
  responsibilities?: string;
  specialty?: string;
  
  // 기타 정보
  isPrimary: boolean;
  isActive: boolean;
  notes?: string;
  
  // 관계 데이터
  project?: Project;
}

// 메시지 타입
export interface Message extends BaseEntity {
  content: string;
  projectId: string;
  authorId: string;
  
  // 관계 데이터
  project: Project;
  author: User;
}

// 사용자 관리 로그 타입
export interface UserManagementLog extends BaseEntity {
  managerId: string;
  targetUserId: string;
  action: 'LEVEL_CHANGE' | 'DEACTIVATE' | 'ACTIVATE' | 'DELETE';
  oldValue?: string;
  newValue?: string;
  reason?: string;
  
  // 관계 데이터
  manager: User;
  targetUser: User;
}
// 권한 관리 유틸리티

export type UserLevel = 0 | 1 | 2;

// 사용자 레벨 정의
export const USER_LEVELS = {
  SUPER_ADMIN: 0,    // 최고관리자 - 모든 권한
  ADMIN: 1,          // 관리자 - 프로젝트/공정/팀일정 관리
  USER: 2            // 일반회원 - 제한된 권한
} as const;

// 권한 타입 정의
export interface Permissions {
  // 프로젝트 권한
  canCreateProject: boolean;
  canEditProject: boolean;
  canDeleteProject: boolean;
  canViewProject: boolean;
  
  // 공정 관리 권한
  canManageProcess: boolean;
  canViewProcess: boolean;
  
  // 일정 관리 권한
  canManageTeamSchedule: boolean;
  canManagePersonalSchedule: boolean;
  canViewSchedule: boolean;
  
  // 파일 관리 권한
  canCreateFolder: boolean;
  canUploadFile: boolean;
  canDeleteFile: boolean;
  canDownloadFile: boolean;
  canViewFile: boolean;
  
  // 작업 관리 권한
  canCreateTask: boolean;
  canEditTask: boolean;
  canDeleteTask: boolean;
  canViewTask: boolean;
  
  // 팀 관리 권한
  canManageUsers: boolean;
  canViewUsers: boolean;
  
  // 게시판 권한
  canCreatePost: boolean;
  canEditPost: boolean;
  canDeletePost: boolean;
  canViewPost: boolean;
}

// 사용자 레벨별 권한 정의
export function getPermissions(userLevel: UserLevel): Permissions {
  switch (userLevel) {
    case USER_LEVELS.SUPER_ADMIN: // 레벨 0 - 최고관리자
      return {
        // 모든 권한 보유
        canCreateProject: true,
        canEditProject: true,
        canDeleteProject: true,
        canViewProject: true,
        
        canManageProcess: false, // 공정관리 비활성화
        canViewProcess: false,   // 공정관리 비활성화
        
        canManageTeamSchedule: true,
        canManagePersonalSchedule: true,
        canViewSchedule: true,
        
        canCreateFolder: true,
        canUploadFile: true,
        canDeleteFile: true,
        canDownloadFile: true,
        canViewFile: true,
        
        canCreateTask: true,
        canEditTask: true,
        canDeleteTask: true,
        canViewTask: true,
        
        canManageUsers: true,
        canViewUsers: true,
        
        canCreatePost: true,
        canEditPost: true,
        canDeletePost: true,
        canViewPost: true,
      };
      
    case USER_LEVELS.ADMIN: // 레벨 1 - 관리자
      return {
        // 프로젝트 생성/수정/삭제 권한
        canCreateProject: true,
        canEditProject: true,
        canDeleteProject: true,
        canViewProject: true,
        
        // 공정 관리 권한 - 비활성화
        canManageProcess: false,
        canViewProcess: false,
        
        // 팀 일정 + 개인 일정 관리
        canManageTeamSchedule: true,
        canManagePersonalSchedule: true,
        canViewSchedule: true,
        
        // 파일 관리 권한
        canCreateFolder: true,
        canUploadFile: true,
        canDeleteFile: true,
        canDownloadFile: true,
        canViewFile: true,
        
        // 작업 관리 권한
        canCreateTask: true,
        canEditTask: true,
        canDeleteTask: true,
        canViewTask: true,
        
        // 제한된 사용자 관리
        canManageUsers: false,
        canViewUsers: true,
        
        // 게시판 권한
        canCreatePost: true,
        canEditPost: true,
        canDeletePost: false, // 본인 글만 삭제 가능 (별도 로직)
        canViewPost: true,
      };
      
    case USER_LEVELS.USER: // 레벨 2 - 일반회원
    default:
      return {
        // 프로젝트 조회만 가능
        canCreateProject: false,
        canEditProject: false,
        canDeleteProject: false,
        canViewProject: true,
        
        // 공정 관리 - 비활성화
        canManageProcess: false,
        canViewProcess: false,
        
        // 개인 일정만 관리 가능
        canManageTeamSchedule: false,
        canManagePersonalSchedule: true,
        canViewSchedule: true,
        
        // 파일 관리 권한 (모든 팀원 동일)
        canCreateFolder: true,
        canUploadFile: true,
        canDeleteFile: true,
        canDownloadFile: true,
        canViewFile: true,
        
        // 개인 작업 관리
        canCreateTask: true,
        canEditTask: true,
        canDeleteTask: true, // 본인 작업만
        canViewTask: true,
        
        // 사용자 조회만 가능
        canManageUsers: false,
        canViewUsers: true,
        
        // 게시판 권한
        canCreatePost: true,
        canEditPost: true,
        canDeletePost: false, // 본인 글만 삭제 가능 (별도 로직)
        canViewPost: true,
      };
  }
}

// 권한 체크 훅
export function usePermissions(userLevel?: UserLevel): Permissions {
  if (userLevel === undefined) {
    // 로그인하지 않은 경우 모든 권한 false
    return {
      canCreateProject: false,
      canEditProject: false,
      canDeleteProject: false,
      canViewProject: false,
      
      canManageProcess: false,
      canViewProcess: false,
      
      canManageTeamSchedule: false,
      canManagePersonalSchedule: false,
      canViewSchedule: false,
      
      canCreateFolder: false,
      canUploadFile: false,
      canDeleteFile: false,
      canDownloadFile: false,
      canViewFile: false,
      
      canCreateTask: false,
      canEditTask: false,
      canDeleteTask: false,
      canViewTask: false,
      
      canManageUsers: false,
      canViewUsers: false,
      
      canCreatePost: false,
      canEditPost: false,
      canDeletePost: false,
      canViewPost: false,
    };
  }
  
  return getPermissions(userLevel);
}

// 사용자 레벨 텍스트 변환
export function getUserLevelText(userLevel: UserLevel): string {
  switch (userLevel) {
    case USER_LEVELS.SUPER_ADMIN:
      return '최고관리자';
    case USER_LEVELS.ADMIN:
      return '관리자';
    case USER_LEVELS.USER:
      return '일반회원';
    default:
      return '알 수 없음';
  }
}

// 사용자 레벨 색상
export function getUserLevelColor(userLevel: UserLevel): string {
  switch (userLevel) {
    case USER_LEVELS.SUPER_ADMIN:
      return 'bg-red-100 text-red-800';
    case USER_LEVELS.ADMIN:
      return 'bg-blue-100 text-blue-800';
    case USER_LEVELS.USER:
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

// 프로젝트별 권한 체크
export function hasProjectPermission(
  userLevel: UserLevel, 
  action: string, 
  projectOwnerId?: string, 
  userId?: string
): boolean {
  const permissions = getPermissions(userLevel);
  
  // 관리자는 모든 프로젝트에 대한 권한
  if (userLevel <= USER_LEVELS.ADMIN) {
    return true;
  }
  
  // 프로젝트 소유자인 경우
  if (projectOwnerId === userId) {
    return ['view', 'edit', 'delete'].includes(action);
  }
  
  // 일반 사용자는 조회만 가능
  return action === 'view';
}

// 작업별 권한 체크
export function hasTaskPermission(
  userLevel: UserLevel, 
  action: string, 
  taskAssigneeId?: string, 
  userId?: string
): boolean {
  const permissions = getPermissions(userLevel);
  
  // 관리자는 모든 권한
  if (userLevel <= USER_LEVELS.ADMIN) {
    return true;
  }
  
  // 작업 담당자인 경우
  if (taskAssigneeId === userId) {
    return ['view', 'edit', 'delete'].includes(action);
  }
  
  // 일반 사용자도 작업 생성 가능
  if (action === 'create') {
    return permissions.canCreateTask;
  }
  
  return action === 'view';
}

// 컴포넌트별 렌더링 권한 체크
export function shouldRenderComponent(componentName: string, userLevel: UserLevel): boolean {
  const permissions = getPermissions(userLevel);
  
  switch (componentName) {
    case 'ProjectManager':
      return permissions.canViewProject;
    case 'ProcessManager':
      return permissions.canViewProcess;
    case 'ScheduleTaskManager':
      return permissions.canViewSchedule && permissions.canViewTask;
    case 'FileManager':
      return permissions.canViewFile;
    case 'UserManagement':
      return permissions.canViewUsers;
    case 'GlobalBoard':
      return permissions.canViewPost;
    default:
      return true;
  }
}

// UI 요소별 권한 체크
export function canShowUIElement(elementType: string, userLevel: UserLevel, context?: any): boolean {
  const permissions = getPermissions(userLevel);
  
  switch (elementType) {
    case 'createButton':
      return permissions.canCreateProject || permissions.canCreateTask || permissions.canCreatePost;
    case 'editButton':
      return permissions.canEditProject || permissions.canEditTask || permissions.canEditPost;
    case 'deleteButton':
      return permissions.canDeleteProject || permissions.canDeleteTask || permissions.canDeletePost;
    case 'adminPanel':
      return userLevel <= USER_LEVELS.ADMIN;
    case 'userManagement':
      return permissions.canViewUsers;
    default:
      return true;
  }
}
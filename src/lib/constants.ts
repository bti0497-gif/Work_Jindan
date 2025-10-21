// 공통 상수 정의

// === API 관련 상수 ===
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export const API_ENDPOINTS = {
  // 인증
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
  },
  
  // 사용자
  USERS: {
    BASE: '/user',
    PROFILE: '/user/profile',
    CHANGE_PASSWORD: '/user/change-password',
    ADMIN: '/admin/users',
  },
  
  // 프로젝트
  PROJECTS: {
    BASE: '/projects',
    BY_ID: (id: string) => `/projects/${id}`,
  },
  
  // 작업
  TASKS: {
    BASE: '/tasks',
    BY_ID: (id: string) => `/tasks/${id}`,
  },
  
  // 마일스톤
  MILESTONES: {
    BASE: '/milestones',
    BY_ID: (id: string) => `/milestones/${id}`,
  },
  
  // 일정
  SCHEDULES: {
    BASE: '/schedules',
    BY_ID: (id: string) => `/schedules/${id}`,
    USER: '/schedules/user',
    USER_BY_ID: (id: string) => `/schedules/user/${id}`,
  },
  
  // 파일
  FILES: {
    BASE: '/files',
    BY_ID: (id: string) => `/files/${id}`,
    UPLOAD: '/files/upload',
    DOWNLOAD: (id: string) => `/files/${id}/download`,
  },
  
  // 게시글
  POSTS: {
    BASE: '/posts',
    BY_ID: (id: string) => `/posts/${id}`,
    VIEW: (id: string) => `/posts/${id}/view`,
  },
  
  // 댓글
  COMMENTS: {
    BASE: '/comments',
    BY_ID: (id: string) => `/comments/${id}`,
  },
} as const;

// === HTTP 상태 코드 ===
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// === 사용자 역할 및 권한 ===
export const USER_ROLES = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  USER: 'USER',
} as const;

export const USER_LEVELS = {
  1: '초급',
  2: '중급',
  3: '고급',
  4: '전문가',
  5: '마스터',
} as const;

export const PERMISSIONS = {
  // 프로젝트 권한
  PROJECT_CREATE: 'project:create',
  PROJECT_READ: 'project:read',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_MANAGE_MEMBERS: 'project:manage-members',
  
  // 사용자 관리 권한
  USER_CREATE: 'user:create',
  USER_READ: 'user:read',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  USER_MANAGE_ROLES: 'user:manage-roles',
  
  // 시스템 관리 권한
  ADMIN_ACCESS: 'admin:access',
  SYSTEM_SETTINGS: 'system:settings',
  LOGS_VIEW: 'logs:view',
} as const;

// === 프로젝트 관련 상수 ===
export const PROJECT_STATUS = {
  PLANNING: 'PLANNING',
  IN_PROGRESS: 'IN_PROGRESS',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export const PROJECT_STATUS_LABELS = {
  [PROJECT_STATUS.PLANNING]: '기획',
  [PROJECT_STATUS.IN_PROGRESS]: '진행중',
  [PROJECT_STATUS.ON_HOLD]: '보류',
  [PROJECT_STATUS.COMPLETED]: '완료',
  [PROJECT_STATUS.CANCELLED]: '취소',
} as const;

export const PROJECT_STATUS_COLORS = {
  [PROJECT_STATUS.PLANNING]: '#FFA500', // 주황색
  [PROJECT_STATUS.IN_PROGRESS]: '#1E90FF', // 파란색
  [PROJECT_STATUS.ON_HOLD]: '#FFD700', // 황색
  [PROJECT_STATUS.COMPLETED]: '#32CD32', // 녹색
  [PROJECT_STATUS.CANCELLED]: '#DC143C', // 빨간색
} as const;

export const PROJECT_PRIORITIES = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;

export const PROJECT_PRIORITY_LABELS = {
  [PROJECT_PRIORITIES.LOW]: '낮음',
  [PROJECT_PRIORITIES.MEDIUM]: '보통',
  [PROJECT_PRIORITIES.HIGH]: '높음',
  [PROJECT_PRIORITIES.URGENT]: '긴급',
} as const;

export const PROJECT_PRIORITY_COLORS = {
  [PROJECT_PRIORITIES.LOW]: '#90EE90', // 연한 녹색
  [PROJECT_PRIORITIES.MEDIUM]: '#FFD700', // 황색
  [PROJECT_PRIORITIES.HIGH]: '#FF6347', // 토마토색
  [PROJECT_PRIORITIES.URGENT]: '#DC143C', // 빨간색
} as const;

// === 작업 관련 상수 ===
export const TASK_STATUS = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  REVIEW: 'REVIEW',
  COMPLETED: 'COMPLETED',
} as const;

export const TASK_STATUS_LABELS = {
  [TASK_STATUS.TODO]: '할 일',
  [TASK_STATUS.IN_PROGRESS]: '진행중',
  [TASK_STATUS.REVIEW]: '검토중',
  [TASK_STATUS.COMPLETED]: '완료',
} as const;

export const TASK_STATUS_COLORS = {
  [TASK_STATUS.TODO]: '#708090', // 회색
  [TASK_STATUS.IN_PROGRESS]: '#1E90FF', // 파란색
  [TASK_STATUS.REVIEW]: '#FFD700', // 황색
  [TASK_STATUS.COMPLETED]: '#32CD32', // 녹색
} as const;

export const TASK_PRIORITIES = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;

export const TASK_PRIORITY_LABELS = {
  [TASK_PRIORITIES.LOW]: '낮음',
  [TASK_PRIORITIES.MEDIUM]: '보통',
  [TASK_PRIORITIES.HIGH]: '높음',
  [TASK_PRIORITIES.URGENT]: '긴급',
} as const;

// === 파일 관련 상수 ===
export const FILE_UPLOAD_LIMITS = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_FILES: 10,
} as const;

export const ALLOWED_FILE_TYPES = {
  IMAGES: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  DOCUMENTS: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'],
  ARCHIVES: ['zip', 'rar', '7z'],
} as const;

// 모든 파일 타입 통합
export const ALL_ALLOWED_FILE_TYPES = [
  ...ALLOWED_FILE_TYPES.IMAGES,
  ...ALLOWED_FILE_TYPES.DOCUMENTS,
  ...ALLOWED_FILE_TYPES.ARCHIVES,
] as const;

export const FILE_TYPE_ICONS = {
  // 이미지
  jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
  // 문서
  pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', 
  ppt: '📽️', pptx: '📽️', txt: '📋',
  // 압축
  zip: '🗜️', rar: '🗜️', '7z': '🗜️',
  // 기본
  default: '📁',
} as const;

// === UI 관련 상수 ===
export const MODAL_SIZES = {
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
  FULLSCREEN: 'fullscreen',
} as const;

export const TOAST_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
} as const;

export const TOAST_POSITIONS = {
  TOP_LEFT: 'top-left',
  TOP_CENTER: 'top-center',
  TOP_RIGHT: 'top-right',
  BOTTOM_LEFT: 'bottom-left',
  BOTTOM_CENTER: 'bottom-center',
  BOTTOM_RIGHT: 'bottom-right',
} as const;

export const LOADING_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
} as const;

// === 페이징 관련 상수 ===
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
} as const;

// === 검색 관련 상수 ===
export const SEARCH = {
  MIN_QUERY_LENGTH: 2,
  DEBOUNCE_DELAY: 300, // ms
  MAX_RESULTS: 50,
} as const;

// === 날짜 형식 ===
export const DATE_FORMATS = {
  FULL: 'YYYY-MM-DD HH:mm:ss',
  DATE: 'YYYY-MM-DD',
  TIME: 'HH:mm:ss',
  DATETIME: 'YYYY-MM-DD HH:mm',
  KOREAN_DATE: 'YYYY년 MM월 DD일',
  KOREAN_DATETIME: 'YYYY년 MM월 DD일 HH시 mm분',
} as const;

// === 색상 팔레트 ===
export const COLORS = {
  PRIMARY: '#3B82F6',
  SECONDARY: '#6B7280',
  SUCCESS: '#10B981',
  WARNING: '#F59E0B',
  ERROR: '#EF4444',
  INFO: '#3B82F6',
  
  // 그라데이션
  GRADIENTS: {
    BLUE: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    GREEN: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    ORANGE: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    PURPLE: 'linear-gradient(135deg, #a855f7 0%, #e879f9 100%)',
  },
  
  // 상태별 색상
  STATUS: {
    ACTIVE: '#10B981',
    INACTIVE: '#6B7280',
    PENDING: '#F59E0B',
    BLOCKED: '#EF4444',
  },
} as const;

// === 애니메이션 지속 시간 ===
export const ANIMATION_DURATION = {
  FAST: 150,
  NORMAL: 300,
  SLOW: 500,
} as const;

// === 브레이크포인트 ===
export const BREAKPOINTS = {
  SM: 640,
  MD: 768,
  LG: 1024,
  XL: 1280,
  '2XL': 1536,
} as const;

// === 로컬 스토리지 키 ===
export const STORAGE_KEYS = {
  USER_PREFERENCES: 'user_preferences',
  THEME: 'theme',
  LANGUAGE: 'language',
  TOKEN: 'auth_token',
  REFRESH_TOKEN: 'refresh_token',
  SIDEBAR_COLLAPSED: 'sidebar_collapsed',
  RECENT_PROJECTS: 'recent_projects',
} as const;

// === 이벤트 이름 ===
export const EVENTS = {
  USER_LOGIN: 'user:login',
  USER_LOGOUT: 'user:logout',
  PROJECT_CREATED: 'project:created',
  PROJECT_UPDATED: 'project:updated',
  PROJECT_DELETED: 'project:deleted',
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  TASK_COMPLETED: 'task:completed',
  FILE_UPLOADED: 'file:uploaded',
  NOTIFICATION_RECEIVED: 'notification:received',
} as const;

// === 에러 메시지 ===
export const ERROR_MESSAGES = {
  NETWORK_ERROR: '네트워크 연결을 확인해주세요.',
  UNAUTHORIZED: '로그인이 필요합니다.',
  FORBIDDEN: '권한이 없습니다.',
  NOT_FOUND: '요청한 리소스를 찾을 수 없습니다.',
  VALIDATION_ERROR: '입력값을 확인해주세요.',
  SERVER_ERROR: '서버 오류가 발생했습니다.',
  UNKNOWN_ERROR: '알 수 없는 오류가 발생했습니다.',
} as const;

// === 성공 메시지 ===
export const SUCCESS_MESSAGES = {
  CREATED: '성공적으로 생성되었습니다.',
  UPDATED: '성공적으로 수정되었습니다.',
  DELETED: '성공적으로 삭제되었습니다.',
  SAVED: '성공적으로 저장되었습니다.',
  UPLOADED: '파일이 성공적으로 업로드되었습니다.',
  SENT: '성공적으로 전송되었습니다.',
} as const;
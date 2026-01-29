// 공통 검증 로직 및 유틸리티 함수

// === 검증 함수들 ===

// 이메일 검증
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// 비밀번호 강도 검증
export const validatePassword = (password: string): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('비밀번호는 최소 8자 이상이어야 합니다.');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('소문자를 포함해야 합니다.');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('대문자를 포함해야 합니다.');
  }
  
  if (!/\d/.test(password)) {
    errors.push('숫자를 포함해야 합니다.');
  }
  
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('특수문자를 포함해야 합니다.');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// 전화번호 포맷팅
export const formatPhoneNumber = (value: string): string => {
  // 숫자만 추출
  const numbers = value.replace(/[^\d]/g, '');
  
  // 자릿수에 따라 포맷팅
  if (numbers.length <= 3) {
    return numbers;
  } else if (numbers.length <= 7) {
    return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  } else if (numbers.length <= 11) {
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`;
  } else {
    // 11자리 이상은 처음 11자리만 사용
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
  }
};

// 전화번호 검증
export const validatePhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^\d{3}-\d{4}-\d{4}$/;
  return phoneRegex.test(phone);
};

// 파일 크기 포맷팅
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 파일 확장자 검증
export const validateFileType = (fileName: string, allowedTypes: string[]): boolean => {
  const extension = fileName.toLowerCase().split('.').pop();
  return extension ? allowedTypes.includes(extension) : false;
};

// 날짜 검증
export const validateDateRange = (startDate: string, endDate: string): {
  isValid: boolean;
  error?: string;
} => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime())) {
    return { isValid: false, error: '시작일이 유효하지 않습니다.' };
  }
  
  if (isNaN(end.getTime())) {
    return { isValid: false, error: '종료일이 유효하지 않습니다.' };
  }
  
  if (start >= end) {
    return { isValid: false, error: '종료일은 시작일보다 이후여야 합니다.' };
  }
  
  return { isValid: true };
};

// === 날짜 유틸리티 ===

// 날짜 포맷팅
export const formatDate = (date: string | Date, format: 'short' | 'long' | 'full' = 'short'): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) return '유효하지 않은 날짜';
  
  switch (format) {
    case 'short':
      return d.toLocaleDateString('ko-KR');
    case 'long':
      return d.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    case 'full':
      return d.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      });
    default:
      return d.toLocaleDateString('ko-KR');
  }
};

// 시간 포맷팅
export const formatTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) return '유효하지 않은 시간';
  
  return d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

// 날짜시간 포맷팅
export const formatDateTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) return '유효하지 않은 날짜시간';
  
  return d.toLocaleString('ko-KR');
};

// 상대 시간 계산 (예: "2시간 전")
export const getRelativeTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);
  
  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffWeeks < 4) return `${diffWeeks}주 전`;
  if (diffMonths < 12) return `${diffMonths}개월 전`;
  return `${diffYears}년 전`;
};

// D-Day 계산
export const getDDay = (targetDate: string | Date): string => {
  const target = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
  const today = new Date();
  
  // 시간을 00:00:00으로 초기화하여 날짜만 비교
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  
  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'D-Day';
  if (diffDays > 0) return `D-${diffDays}`;
  return `D+${Math.abs(diffDays)}`;
};

// === 문자열 유틸리티 ===

// 문자열 자르기 (한글 고려)
export const truncateText = (text: string, length: number, suffix: string = '...'): string => {
  if (text.length <= length) return text;
  return text.substring(0, length) + suffix;
};

// 검색어 하이라이트
export const highlightSearchTerm = (text: string, searchTerm: string): string => {
  if (!searchTerm) return text;
  
  const regex = new RegExp(`(${searchTerm})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
};

// 문자열 이스케이프
export const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

// === 배열 유틸리티 ===

// 배열을 청크 단위로 분할
export const chunkArray = <T>(array: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

// 배열에서 중복 제거
export const uniqueArray = <T>(array: T[], key?: keyof T): T[] => {
  if (!key) {
    return [...new Set(array)];
  }
  
  const seen = new Set();
  return array.filter(item => {
    const value = item[key];
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
};

// 배열 정렬
export const sortArray = <T>(
  array: T[], 
  key: keyof T, 
  direction: 'asc' | 'desc' = 'asc'
): T[] => {
  return [...array].sort((a, b) => {
    const aValue = a[key];
    const bValue = b[key];
    
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      const result = aValue.localeCompare(bValue);
      return direction === 'asc' ? result : -result;
    }
    
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      const result = aValue - bValue;
      return direction === 'asc' ? result : -result;
    }
    
    if (aValue instanceof Date && bValue instanceof Date) {
      const result = aValue.getTime() - bValue.getTime();
      return direction === 'asc' ? result : -result;
    }
    
    return 0;
  });
};

// === 객체 유틸리티 ===

// 깊은 복사
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

// 객체에서 빈 값 제거
export const removeEmptyValues = (obj: Record<string, any>): Record<string, any> => {
  const result: Record<string, any> = {};
  
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      result[key] = value;
    }
  });
  
  return result;
};

// === 색상 유틸리티 ===

// HEX 색상 검증
export const isValidHexColor = (color: string): boolean => {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
};

// 색상 밝기 계산 (0-255)
export const getColorBrightness = (hexColor: string): number => {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  return (r * 299 + g * 587 + b * 114) / 1000;
};

// 밝은 색상인지 확인
export const isLightColor = (hexColor: string): boolean => {
  return getColorBrightness(hexColor) > 127;
};

// === 디바운스 및 쓰로틀 ===

// 디바운스 함수
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// 쓰로틀 함수
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

// === 에러 처리 ===

// API 에러 메시지 추출
export const getErrorMessage = (error: any): string => {
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  if (error?.error) return error.error;
  return '알 수 없는 오류가 발생했습니다.';
};

// === 로컬 스토리지 유틸리티 ===

// 안전한 로컬 스토리지 저장
export const setLocalStorage = (key: string, value: any): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('로컬 스토리지 저장 실패:', error);
    return false;
  }
};

// 안전한 로컬 스토리지 읽기
export const getLocalStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error('로컬 스토리지 읽기 실패:', error);
    return defaultValue;
  }
};

// 로컬 스토리지 삭제
export const removeLocalStorage = (key: string): boolean => {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error('로컬 스토리지 삭제 실패:', error);
    return false;
  }
};
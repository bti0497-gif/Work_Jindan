import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { UserLevel, usePermissions } from '@/lib/permissions';
import { 
  Project, 
  Task, 
  User, 
  Milestone, 
  Schedule, 
  ProjectFile, 
  Post,
  ApiResponse,
  PaginatedResponse,
  FilterOptions,
  SortOptions 
} from '@/types/common';

// 기본 CRUD 훅
export function useCRUD<T>(endpoint: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (params?: Record<string, any>) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(endpoint, window.location.origin);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            url.searchParams.append(key, String(value));
          }
        });
      }
      
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result: ApiResponse<T[]> = await response.json();
      if (result.success && result.data) {
        setData(result.data);
      } else {
        throw new Error(result.error || 'Failed to fetch data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  const createItem = useCallback(async (item: Partial<T>): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result: ApiResponse<T> = await response.json();
      if (result.success && result.data) {
        await fetchData();
        return result.data;
      } else {
        throw new Error(result.error || 'Failed to create item');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [endpoint, fetchData]);

  const updateItem = useCallback(async (id: string, updates: Partial<T>): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${endpoint}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result: ApiResponse<T> = await response.json();
      if (result.success && result.data) {
        await fetchData();
        return result.data;
      } else {
        throw new Error(result.error || 'Failed to update item');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [endpoint, fetchData]);

  const deleteItem = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${endpoint}/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result: ApiResponse = await response.json();
      if (result.success) {
        await fetchData();
        return true;
      } else {
        throw new Error(result.error || 'Failed to delete item');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setLoading(false);
    }
  }, [endpoint, fetchData]);

  return {
    data,
    loading,
    error,
    fetchData,
    createItem,
    updateItem,
    deleteItem,
    setData,
  };
}

// 권한 인식 CRUD 훅
export function usePermissionAwareCRUD<T>(endpoint: string, entityType: string) {
  const { data: session } = useSession();
  const userLevel = session?.user?.userLevel as UserLevel;
  const permissions = usePermissions(userLevel);
  const crud = useCRUD<T>(endpoint);

  const canCreate = permissions[`canCreate${entityType}` as keyof typeof permissions] as boolean;
  const canEdit = permissions[`canEdit${entityType}` as keyof typeof permissions] as boolean;
  const canDelete = permissions[`canDelete${entityType}` as keyof typeof permissions] as boolean;
  const canView = permissions[`canView${entityType}` as keyof typeof permissions] as boolean;

  return {
    ...crud,
    permissions: {
      canCreate,
      canEdit,
      canDelete,
      canView,
    },
    userLevel,
  };
}

// 프로젝트 관리 훅
export function useProjects() {
  return usePermissionAwareCRUD<Project>('/api/projects', 'Project');
}

// 작업 관리 훅
export function useTasks(projectId?: string) {
  const endpoint = projectId ? `/api/tasks?projectId=${projectId}` : '/api/tasks';
  return usePermissionAwareCRUD<Task>(endpoint, 'Task');
}

// 사용자 관리 훅 (관리자 전용)
export function useUsers() {
  return usePermissionAwareCRUD<User>('/api/admin/users', 'User');
}

// 공정 관리 훅
export function useMilestones(projectId?: string) {
  const endpoint = projectId ? `/api/milestones?projectId=${projectId}` : '/api/milestones';
  return usePermissionAwareCRUD<Milestone>(endpoint, 'Process');
}

// 일정 관리 훅
export function useSchedules(userId?: string) {
  const endpoint = userId ? `/api/schedules/user/${userId}` : '/api/schedules/user';
  return usePermissionAwareCRUD<Schedule>(endpoint, 'Schedule');
}

// 파일 관리 훅
export function useFiles(projectId?: string) {
  const endpoint = projectId ? `/api/files?projectId=${projectId}` : '/api/files';
  return usePermissionAwareCRUD<ProjectFile>(endpoint, 'File');
}

// 게시글 관리 훅
export function usePosts() {
  return usePermissionAwareCRUD<Post>('/api/posts', 'Post');
}

// 필터링 및 정렬 훅
export function useFiltering<T>(
  initialData: T[], 
  filterFunction: (item: T, filters: FilterOptions) => boolean
) {
  const [filters, setFilters] = useState<FilterOptions>({});
  const [sortOptions, setSortOptions] = useState<SortOptions>({ field: 'createdAt', direction: 'desc' });

  const filteredData = initialData.filter(item => filterFunction(item, filters));
  
  const sortedData = [...filteredData].sort((a, b) => {
    const aValue = (a as any)[sortOptions.field];
    const bValue = (b as any)[sortOptions.field];
    
    if (aValue < bValue) return sortOptions.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOptions.direction === 'asc' ? 1 : -1;
    return 0;
  });

  return {
    data: sortedData,
    filters,
    setFilters,
    sortOptions,
    setSortOptions,
  };
}

// 모달 상태 관리 훅
export function useModal<T = any>() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit' | 'delete' | 'view'>('create');
  const [selectedItem, setSelectedItem] = useState<T | null>(null);

  const openModal = (mode: 'create' | 'edit' | 'delete' | 'view', item?: T) => {
    setMode(mode);
    setSelectedItem(item || null);
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    setSelectedItem(null);
  };

  return {
    isOpen,
    mode,
    selectedItem,
    openModal,
    closeModal,
  };
}

// 폼 상태 관리 훅
export function useForm<T>(initialValues: T) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const setValue = (field: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
    // 값이 변경되면 해당 필드의 에러 클리어
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const setError = (field: keyof T, message: string) => {
    setErrors(prev => ({ ...prev, [field]: message }));
  };

  const clearErrors = () => {
    setErrors({});
  };

  const reset = () => {
    setValues(initialValues);
    setErrors({});
    setIsSubmitting(false);
    setIsDirty(false);
  };

  const isValid = Object.keys(errors).length === 0;

  return {
    values,
    errors,
    isSubmitting,
    isDirty,
    isValid,
    setValue,
    setError,
    clearErrors,
    reset,
    setIsSubmitting,
  };
}

// 로딩 상태 관리 훅
export function useLoading() {
  const [loading, setLoading] = useState(false);

  const withLoading = async <T,>(asyncFunction: () => Promise<T>): Promise<T> => {
    setLoading(true);
    try {
      return await asyncFunction();
    } finally {
      setLoading(false);
    }
  };

  return { loading, setLoading, withLoading };
}

// 현재 사용자 정보 훅
export function useCurrentUser() {
  const { data: session } = useSession();
  const user = session?.user;
  const userLevel = user?.userLevel as UserLevel;
  const permissions = usePermissions(userLevel);

  return {
    user,
    userLevel,
    permissions,
    isAuthenticated: !!session,
    isAdmin: userLevel <= 1,
    isUser: userLevel === 2,
  };
}
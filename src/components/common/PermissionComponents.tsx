import React from 'react';
import { useSession } from 'next-auth/react';
import { usePermissions, shouldRenderComponent, canShowUIElement } from '@/lib/permissions';
import { UserLevel } from '@/lib/permissions';

// 권한 기반 래퍼 컴포넌트
interface PermissionWrapperProps {
  children: React.ReactNode;
  requiredPermission?: string;
  componentName?: string;
  elementType?: string;
  fallback?: React.ReactNode;
  userLevel?: UserLevel;
}

export function PermissionWrapper({ 
  children, 
  requiredPermission, 
  componentName,
  elementType,
  fallback = null,
  userLevel 
}: PermissionWrapperProps) {
  const { data: session } = useSession();
  const currentUserLevel = userLevel || (session?.user?.userLevel as UserLevel);
  const permissions = usePermissions(currentUserLevel);

  // 특정 권한 체크
  if (requiredPermission && !permissions[requiredPermission as keyof typeof permissions]) {
    return <>{fallback}</>;
  }

  // 컴포넌트 렌더링 권한 체크
  if (componentName && !shouldRenderComponent(componentName, currentUserLevel)) {
    return <>{fallback}</>;
  }

  // UI 요소 권한 체크
  if (elementType && !canShowUIElement(elementType, currentUserLevel)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// 권한 기반 버튼 컴포넌트
interface PermissionButtonProps {
  children: React.ReactNode;
  requiredPermission: string;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  userLevel?: UserLevel;
}

export function PermissionButton({ 
  children, 
  requiredPermission, 
  onClick, 
  className = '',
  disabled = false,
  userLevel 
}: PermissionButtonProps) {
  const { data: session } = useSession();
  const currentUserLevel = userLevel || (session?.user?.userLevel as UserLevel);
  const permissions = usePermissions(currentUserLevel);

  if (!permissions[requiredPermission as keyof typeof permissions]) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  );
}

// 관리자 전용 컴포넌트
interface AdminOnlyProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  minLevel?: UserLevel;
}

export function AdminOnly({ children, fallback = null, minLevel = 1 }: AdminOnlyProps) {
  const { data: session } = useSession();
  const userLevel = session?.user?.userLevel as UserLevel;

  if (!userLevel || userLevel > minLevel) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// 사용자 레벨 표시 컴포넌트
interface UserLevelBadgeProps {
  userLevel: UserLevel;
  showText?: boolean;
  className?: string;
}

export function UserLevelBadge({ userLevel, showText = true, className = '' }: UserLevelBadgeProps) {
  const { getUserLevelText, getUserLevelColor } = require('@/lib/permissions');
  
  return (
    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getUserLevelColor(userLevel)} ${className}`}>
      {showText ? getUserLevelText(userLevel) : userLevel}
    </span>
  );
}

// 권한 정보 표시 컴포넌트 (개발/디버깅용)
export function PermissionDebugger() {
  const { data: session } = useSession();
  const userLevel = session?.user?.userLevel as UserLevel;
  const permissions = usePermissions(userLevel);

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 text-white p-4 rounded-lg text-xs max-w-xs">
      <h4 className="font-bold mb-2">권한 정보 (개발용)</h4>
      <p>사용자 레벨: {userLevel}</p>
      <div className="mt-2 max-h-40 overflow-y-auto">
        {Object.entries(permissions).map(([key, value]) => (
          <div key={key} className={`${value ? 'text-green-300' : 'text-red-300'}`}>
            {key}: {value ? '✓' : '✗'}
          </div>
        ))}
      </div>
    </div>
  );
}

// 상태별 색상 헬퍼
export const statusColors = {
  project: {
    planning: 'bg-yellow-100 text-yellow-800',
    active: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    on_hold: 'bg-red-100 text-red-800',
  },
  task: {
    todo: 'bg-gray-100 text-gray-800',
    in_progress: 'bg-blue-100 text-blue-800',
    done: 'bg-green-100 text-green-800',
    blocked: 'bg-red-100 text-red-800',
  },
  priority: {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    urgent: 'bg-red-100 text-red-800',
  },
  milestone: {
    NOT_STARTED: 'bg-gray-100 text-gray-800',
    IN_PROGRESS: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-green-100 text-green-800',
    ON_HOLD: 'bg-red-100 text-red-800',
  }
};

// 공통 상태 배지 컴포넌트
interface StatusBadgeProps {
  status: string;
  type: keyof typeof statusColors;
  className?: string;
}

export function StatusBadge({ status, type, className = '' }: StatusBadgeProps) {
  const colorClass = statusColors[type]?.[status as keyof typeof statusColors[typeof type]] || 'bg-gray-100 text-gray-800';
  
  return (
    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${colorClass} ${className}`}>
      {status}
    </span>
  );
}
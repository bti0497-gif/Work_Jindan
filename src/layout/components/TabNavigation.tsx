'use client';

import { useSession } from 'next-auth/react';
import { 
  FolderOpen, 
  Calendar, 
  CheckSquare, 
  MessageSquare, 
  Users, 
  BarChart3,
  Folder,
  Target
} from 'lucide-react';

export type TabType = 'projects' | 'process' | 'files' | 'calendar' | 'board' | 'admin' | 'analytics';

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export default function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const { data: session } = useSession();
  
  // 기본 탭들 (공정관리 제외)
  const tabs = [
    { id: 'projects' as TabType, name: '프로젝트 관리', icon: Folder },
    // { id: 'process' as TabType, name: '공정 관리', icon: Target }, // 비활성화
    { id: 'calendar' as TabType, name: '일정 관리', icon: Calendar },
    { id: 'files' as TabType, name: '파일 관리', icon: FolderOpen },
    { id: 'board' as TabType, name: '전체 게시판', icon: MessageSquare },
  ];

  // 관리자 전용 탭들 (최고관리자만)
  const adminTabs = [
    { id: 'admin' as TabType, name: '회원 관리', icon: Users },
    // { id: 'analytics' as TabType, name: '분석', icon: BarChart3 }, // 비활성화
  ];

  // 최고관리자(레벨 0)인 경우만 관리자 탭 추가
  const allTabs = session?.user?.userLevel === 0 
    ? [...tabs, ...adminTabs] 
    : tabs;

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="flex overflow-x-auto scrollbar-hide px-4 lg:px-6">
        {allTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center space-x-1 lg:space-x-2 px-2 lg:px-4 py-3 text-xs lg:text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="h-3 w-3 lg:h-4 lg:w-4" />
              <span className="hidden sm:inline">{tab.name}</span>
            </button>
          );
        })}
      </div>
      
      {/* 커스텀 스크롤바 숨김 스타일 */}
      <style jsx>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
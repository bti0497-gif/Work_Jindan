'use client';

import { useSession } from 'next-auth/react';
import { Settings, Search } from 'lucide-react';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const { data: session } = useSession();

  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center space-x-4 min-w-0 flex-1">
        <h1 className="text-lg lg:text-xl font-semibold text-gray-900 truncate">{title}</h1>
      </div>
      
      <div className="flex items-center space-x-2 lg:space-x-4 flex-shrink-0">
        {/* 검색 */}
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="검색..."
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-32 lg:w-auto"
          />
        </div>
        
        {/* 모바일 검색 버튼 */}
        <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 sm:hidden">
          <Search className="h-5 w-5" />
        </button>
        
        {/* 설정 버튼 */}
        <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <Settings className="h-5 w-5" />
        </button>
        
        {/* 관리자 표시 */}
        {session?.user?.userLevel !== undefined && session.user.userLevel <= 1 && (
          <div className="px-2 lg:px-3 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full whitespace-nowrap">
            {session.user.userLevel === 0 ? 'SUPER' : 'ADMIN'}
          </div>
        )}
      </div>
    </div>
  );
}
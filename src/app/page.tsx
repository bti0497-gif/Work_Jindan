'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import LoginForm from '@/components/LoginForm';
import MainLayout from '@/components/MainLayout';
import { 
  Calendar, 
  CheckSquare, 
  FolderOpen, 
  BarChart3,
  Clock,
  TrendingUp
} from 'lucide-react';

export default function Home() {
  const { data: session, status } = useSession();
  const [isLogin, setIsLogin] = useState(true);

  // 로딩 중
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  // 로그인하지 않은 경우
  if (!session) {
    return <LoginForm onToggleMode={() => setIsLogin(!isLogin)} isLogin={isLogin} />;
  }

  // 로그인한 경우 - 대시보드 컨텐츠
  const DashboardContent = () => (
    <div className="space-y-6">
      {/* 프로젝트 진행률 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <BarChart3 className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">전체 진행률</p>
              <p className="text-2xl font-semibold text-gray-900">75%</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full" style={{ width: '75%' }}></div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckSquare className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">완료된 작업</p>
              <p className="text-2xl font-semibold text-gray-900">24</p>
            </div>
          </div>
          <p className="mt-2 text-sm text-green-600">+12% 이번 주</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Clock className="h-6 w-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">진행 중</p>
              <p className="text-2xl font-semibold text-gray-900">8</p>
            </div>
          </div>
          <p className="mt-2 text-sm text-orange-600">마감 임박 3개</p>
        </div>
      </div>

      {/* 프로젝트 공정표 (간트 차트 스타일) */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">프로젝트 공정표</h3>
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <Calendar className="h-4 w-4" />
            <span>2025년 10월</span>
          </div>
        </div>

        <div className="space-y-4">
          {/* 공정표 헤더 */}
          <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 font-medium">
            <div className="col-span-3">작업명</div>
            <div className="col-span-9 grid grid-cols-7 gap-1">
              <div className="text-center">17일</div>
              <div className="text-center">18일</div>
              <div className="text-center">19일</div>
              <div className="text-center">20일</div>
              <div className="text-center">21일</div>
              <div className="text-center">22일</div>
              <div className="text-center">23일</div>
            </div>
          </div>

          {/* 공정표 항목들 */}
          <div className="grid grid-cols-12 gap-2 items-center py-3 border-b">
            <div className="col-span-3">
              <p className="font-medium text-gray-900 text-sm">UI 컴포넌트 설계</p>
              <p className="text-xs text-gray-500">김철수</p>
            </div>
            <div className="col-span-9 grid grid-cols-7 gap-1">
              <div className="h-6 bg-blue-200 rounded flex items-center justify-center">
                <div className="h-2 bg-blue-600 rounded w-full mx-1"></div>
              </div>
              <div className="h-6 bg-blue-200 rounded flex items-center justify-center">
                <div className="h-2 bg-blue-600 rounded w-full mx-1"></div>
              </div>
              <div className="h-6 bg-gray-100 rounded"></div>
              <div className="h-6 bg-gray-100 rounded"></div>
              <div className="h-6 bg-gray-100 rounded"></div>
              <div className="h-6 bg-gray-100 rounded"></div>
              <div className="h-6 bg-gray-100 rounded"></div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 items-center py-3 border-b">
            <div className="col-span-3">
              <p className="font-medium text-gray-900 text-sm">데이터베이스 설계</p>
              <p className="text-xs text-gray-500">박민수</p>
            </div>
            <div className="col-span-9 grid grid-cols-7 gap-1">
              <div className="h-6 bg-gray-100 rounded"></div>
              <div className="h-6 bg-green-200 rounded flex items-center justify-center">
                <div className="h-2 bg-green-600 rounded w-full mx-1"></div>
              </div>
              <div className="h-6 bg-green-200 rounded flex items-center justify-center">
                <div className="h-2 bg-green-600 rounded w-full mx-1"></div>
              </div>
              <div className="h-6 bg-green-200 rounded flex items-center justify-center">
                <div className="h-2 bg-green-600 rounded w-full mx-1"></div>
              </div>
              <div className="h-6 bg-gray-100 rounded"></div>
              <div className="h-6 bg-gray-100 rounded"></div>
              <div className="h-6 bg-gray-100 rounded"></div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 items-center py-3 border-b">
            <div className="col-span-3">
              <p className="font-medium text-gray-900 text-sm">API 개발</p>
              <p className="text-xs text-gray-500">이영희</p>
            </div>
            <div className="col-span-9 grid grid-cols-7 gap-1">
              <div className="h-6 bg-gray-100 rounded"></div>
              <div className="h-6 bg-gray-100 rounded"></div>
              <div className="h-6 bg-gray-100 rounded"></div>
              <div className="h-6 bg-yellow-200 rounded flex items-center justify-center">
                <div className="h-2 bg-yellow-600 rounded w-full mx-1"></div>
              </div>
              <div className="h-6 bg-yellow-200 rounded flex items-center justify-center">
                <div className="h-2 bg-yellow-600 rounded w-full mx-1"></div>
              </div>
              <div className="h-6 bg-yellow-200 rounded flex items-center justify-center">
                <div className="h-2 bg-yellow-600 rounded w-full mx-1"></div>
              </div>
              <div className="h-6 bg-gray-100 rounded"></div>
            </div>
          </div>
        </div>
      </div>

      {/* 최근 활동 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">최근 활동</h3>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <CheckSquare className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">김철수님이 "UI 컴포넌트 설계" 작업을 완료했습니다</p>
                <p className="text-xs text-gray-500">2시간 전</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <FolderOpen className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">이영희님이 새 파일을 업로드했습니다</p>
                <p className="text-xs text-gray-500">4시간 전</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                <Calendar className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">박민수님이 새 일정을 추가했습니다</p>
                <p className="text-xs text-gray-500">1일 전</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">이번 주 통계</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">완료된 작업</span>
              <span className="text-sm font-semibold text-gray-900">12개</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">진행 중인 작업</span>
              <span className="text-sm font-semibold text-gray-900">8개</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">새로 추가된 작업</span>
              <span className="text-sm font-semibold text-gray-900">5개</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">업로드된 파일</span>
              <span className="text-sm font-semibold text-gray-900">23개</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-gray-600">팀 생산성</span>
              <div className="flex items-center">
                <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                <span className="text-sm font-semibold text-green-600">+15%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <MainLayout>
      <DashboardContent />
    </MainLayout>
  );
}

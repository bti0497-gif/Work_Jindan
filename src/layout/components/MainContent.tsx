'use client';

import { TabType } from './TabNavigation';
import FileManager from '../FileManager';
import ScheduleTaskManager from '../ScheduleTaskManager';
import UserManagement from '../UserManagement';

// 컴포넌트 가져오기
import CompactProjectManager from '../CompactProjectManager';
import ProcessManager from '../ProcessManager';
import GlobalBoard from '../GlobalBoard';
import ProjectListView from '../ProjectListView';
import { Project } from '@/types/database';

interface MainContentProps {
  activeTab: TabType;
  selectedProject: any;
  onProjectSelect?: (project: any) => void;
  projectViewMode?: 'list' | 'detail';
  onProjectViewModeChange?: (mode: 'list' | 'detail') => void;
}

export default function MainContent({ 
  activeTab, 
  selectedProject, 
  onProjectSelect, 
  projectViewMode = 'list',
  onProjectViewModeChange 
}: MainContentProps) {
  const currentTab = (activeTab ?? 'projects') as TabType;
  console.log('MainContent rendering, activeTab:', activeTab);
  const renderContent = () => {
    switch (currentTab) {
      case 'projects':
        return (
          <div className="h-full overflow-y-auto">
            <div className="p-4 lg:p-8">
              <div className="max-w-6xl mx-auto">
                {projectViewMode === 'list' ? (
                  <div>
                    {/* 헤더 with 버튼들 */}
                    <div className="mb-6 flex items-center justify-between">
                      <div>
                        <h1 className="text-2xl font-bold text-gray-900">프로젝트 관리</h1>
                        <p className="text-gray-600 mt-1">프로젝트를 생성하고 관리하세요</p>
                      </div>
                      <div className="flex space-x-3">
                        <button
                          onClick={() => onProjectViewModeChange?.('detail')}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                        >
                          새 프로젝트 생성
                        </button>
                      </div>
                    </div>
                    
                    <ProjectListView 
                      onProjectSelect={(project: Project) => {
                        onProjectSelect?.(project);
                        onProjectViewModeChange?.('detail');
                      }} 
                    />
                  </div>
                ) : (
                  <div>
                    {/* 뒤로가기 버튼 */}
                    <div className="mb-6">
                      <button
                        onClick={() => onProjectViewModeChange?.('list')}
                        className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        프로젝트 목록으로 돌아가기
                      </button>
                    </div>
                    
                    <CompactProjectManager />
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'process':
        return (
          <div className="h-full overflow-y-auto">
            <div className="p-4 lg:p-8">
              <div className="max-w-6xl mx-auto">
                <ProcessManager />
              </div>
            </div>
          </div>
        );
      
      case 'files':
        return (
          <div className="h-full overflow-y-auto">
            <div className="p-4 lg:p-8">
              <div className="max-w-6xl mx-auto">
                <FileManager />
              </div>
            </div>
          </div>
        );
      
      case 'calendar':
        return (
          <div className="h-full overflow-y-auto">
            <div className="p-4 lg:p-8">
              <div className="max-w-6xl mx-auto">
                {selectedProject ? (
                  <ScheduleTaskManager projectId={selectedProject.id} />
                ) : (
                  <div className="text-center py-12">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">프로젝트를 선택하세요</h3>
                    <p className="text-gray-500">일정 관리를 위해서는 프로젝트 관리 탭에서 먼저 프로젝트를 선택해야 합니다.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      

      case 'board':
        return (
          <div className="h-full overflow-y-auto">
            <div className="p-4 lg:p-8">
              <div className="max-w-6xl mx-auto">
                <GlobalBoard />
              </div>
            </div>
          </div>
        );
      
      case 'admin':
        return (
          <div className="h-full overflow-y-auto">
            <div className="p-4 lg:p-8">
              <div className="max-w-6xl mx-auto">
                <UserManagement />
              </div>
            </div>
          </div>
        );
      
      /* 분석 메뉴 비활성화 - 완전히 주석처리됨
      case 'analytics':
        return (
          <div className="h-full overflow-y-auto">
            <div className="p-4 lg:p-8">
              <div className="max-w-4xl mx-auto">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">분석 대시보드</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-lg shadow border">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">활성 사용자</h3>
                    <p className="text-3xl font-bold text-blue-600">24</p>
                    <p className="text-sm text-gray-500">지난 주 대비 +12%</p>
                  </div>
                  
                  <div className="bg-white p-6 rounded-lg shadow border">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">완료된 작업</h3>
                    <p className="text-3xl font-bold text-green-600">156</p>
                    <p className="text-sm text-gray-500">이번 달</p>
                  </div>
                  
                  <div className="bg-white p-6 rounded-lg shadow border">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">프로젝트</h3>
                    <p className="text-3xl font-bold text-purple-600">8</p>
                    <p className="text-sm text-gray-500">진행 중</p>
                  </div>
                </div>
                
                <div className="mt-8 bg-white p-6 rounded-lg shadow border">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">최근 활동</h3>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="text-sm text-gray-700">새로운 프로젝트 "웹사이트 리뉴얼"이 생성되었습니다.</span>
                      <span className="text-xs text-gray-500">2시간 전</span>
                    </div>
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm text-gray-700">김철수님이 "API 개발" 작업을 완료했습니다.</span>
                      <span className="text-xs text-gray-500">4시간 전</span>
                    </div>
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                      <span className="text-sm text-gray-700">이영희님이 "디자인 시안" 파일을 업로드했습니다.</span>
                      <span className="text-xs text-gray-500">6시간 전</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      */
      
      default:
        // 기본값으로 프로젝트 목록 표시 (또는 환영 화면)
        return (
          <div className="h-full overflow-y-auto">
            <div className="p-4 lg:p-8">
              <div className="max-w-6xl mx-auto">
                {projectViewMode === 'list' ? (
                  <div>
                    <div className="mb-6 flex items-center justify-between">
                      <div>
                        <h1 className="text-2xl font-bold text-gray-900">프로젝트 관리</h1>
                        <p className="text-gray-600 mt-1">프로젝트를 생성하고 관리하세요</p>
                      </div>
                      <div className="flex space-x-3">
                        <button
                          onClick={() => onProjectViewModeChange?.('detail')}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                        >
                          새 프로젝트 생성
                        </button>
                      </div>
                    </div>
                    
                    <ProjectListView 
                      onProjectSelect={(project: Project) => {
                        onProjectSelect?.(project);
                        onProjectViewModeChange?.('detail');
                      }} 
                    />
                  </div>
                ) : (
                  <div>
                    <div className="mb-6">
                      <button
                        onClick={() => onProjectViewModeChange?.('list')}
                        className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        프로젝트 목록으로 돌아가기
                      </button>
                    </div>
                    
                    <CompactProjectManager />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="h-full w-full overflow-hidden">
      {renderContent()}
    </div>
  );
}

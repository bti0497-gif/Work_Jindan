'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect, useRef, useCallback } from 'react';

import LeftSidebar from './layout/LeftSidebar';
import Header from './layout/Header';
import TabNavigation, { TabType } from './layout/TabNavigation';
import MainContent from './layout/MainContent';
import RightSidebar from './layout/RightSidebar';

interface Project {
  id: string;
  name: string;
  color: string;
  memberCount: number;
}

interface Message {
  id: string;
  content: string;
  sender: string;
  timestamp: Date;
}

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { data: session } = useSession();
  
  // 사이드바 너비 상태 관리
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(260);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(320);
  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);

  // 상태 관리
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('projects');
  const [projectViewMode, setProjectViewMode] = useState<'list' | 'detail'>('list');
  
  // 사이드바 리사이징 핸들러
  const startResizingLeft = useCallback(() => {
    isResizingLeft.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const startResizingRight = useCallback(() => {
    isResizingRight.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizing = useCallback(() => {
    isResizingLeft.current = false;
    isResizingRight.current = false;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, []);

  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isResizingLeft.current) {
      const newWidth = mouseMoveEvent.clientX;
      if (newWidth >= 200 && newWidth <= 400) {
        setLeftSidebarWidth(newWidth);
      }
    }
    if (isResizingRight.current) {
      const newWidth = window.innerWidth - mouseMoveEvent.clientX;
      if (newWidth >= 250 && newWidth <= 500) {
        setRightSidebarWidth(newWidth);
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  // 프로젝트 데이터
  const [projects, setProjects] = useState<Project[]>([
    { id: '1', name: '웹사이트 리뉴얼', color: '#3B82F6', memberCount: 5 },
    { id: '2', name: '모바일 앱 개발', color: '#10B981', memberCount: 3 },
    { id: '3', name: '마케팅 캠페인', color: '#F59E0B', memberCount: 4 },
  ]);

  // 채팅 메시지 데이터
  const [messages, setMessages] = useState<Message[]>([
    { 
      id: '1', 
      sender: '김철수', 
      content: '새로운 디자인 시안 확인 부탁드립니다.', 
      timestamp: new Date(Date.now() - 10 * 60 * 1000) // 10분 전
    },
    { 
      id: '2', 
      sender: '이영희', 
      content: '내일 회의 시간 변경 가능한가요?', 
      timestamp: new Date(Date.now() - 15 * 60 * 1000) // 15분 전
    },
    { 
      id: '3', 
      sender: '박민수', 
      content: '코드 리뷰 완료했습니다.', 
      timestamp: new Date(Date.now() - 20 * 60 * 1000) // 20분 전
    },
  ]);

  // 프로젝트 자동 선택 비활성화 (권한 오류 방지)
  // useEffect(() => {
  //   if (projects.length > 0 && !selectedProject) {
  //     setSelectedProject(projects[0]);
  //   }
  // }, [projects, selectedProject]);

  // 이벤트 핸들러들
  const handleProjectSelect = (project: Project) => {
    setSelectedProject(project);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };

  // 새 메시지 전송 함수
  const handleSendMessage = (content: string) => {
    if (!session?.user?.name) return;
    
    const newMessage: Message = {
      id: Date.now().toString(),
      content,
      sender: session.user.name,
      timestamp: new Date()
    };
    
    setMessages(prevMessages => [...prevMessages, newMessage]);
  };

  // 페이지 제목 설정
  const getPageTitle = () => {
    if (selectedProject) {
      switch (activeTab) {
        case 'files': return `${selectedProject.name} - 파일 관리`;
        case 'calendar': return `${selectedProject.name} - 일정 & 작업 관리`;
        case 'board': return `${selectedProject.name} - 자유게시판`;
        case 'admin': return '관리자 - 회원 관리';
        case 'analytics': return '관리자 - 분석';
        default: return selectedProject.name;
      }
    }
    return '팀 협업 플랫폼';
  };

  return (
    <div className="h-screen w-full flex bg-gray-100 overflow-hidden">
      {/* 왼쪽 사이드바 */}
      <div 
        className="flex flex-shrink-0 relative"
        style={{ width: leftSidebarWidth }}
      >
        <LeftSidebar />
        {/* 리사이즈 핸들 */}
        <div
          className="absolute top-0 right-0 w-4 h-full cursor-col-resize z-50 flex items-center justify-center group"
          onMouseDown={startResizingLeft}
          style={{ right: '-8px' }}
        >
          <div className="w-[2px] h-full bg-gray-600 group-hover:bg-blue-500 transition-colors shadow-sm" />
        </div>
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 상단 헤더 */}
        <Header title={getPageTitle()} />
        
        {/* 탭 네비게이션 */}
        <TabNavigation 
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
        
        {/* 메인 콘텐츠 */}
        <div className="flex-1 overflow-auto">
          <MainContent 
            activeTab={activeTab}
            selectedProject={selectedProject}
            onProjectSelect={setSelectedProject}
            projectViewMode={projectViewMode}
            onProjectViewModeChange={setProjectViewMode}
          />
        </div>
      </div>

      {/* 오른쪽 사이드바 */}
      <div 
        className="flex flex-shrink-0 relative"
        style={{ width: rightSidebarWidth }}
      >
        {/* 리사이즈 핸들 */}
        <div
          className="absolute top-0 left-0 w-4 h-full cursor-col-resize z-50 flex items-center justify-center group"
          onMouseDown={startResizingRight}
          style={{ left: '-8px' }}
        >
          <div className="w-[2px] h-full bg-gray-600 group-hover:bg-blue-500 transition-colors shadow-sm" />
        </div>
        <RightSidebar 
          messages={messages}
          onSendMessage={handleSendMessage}
        />
      </div>
    </div>
  );
}
/**
 * FINALIZED UI STANDARD - DEOJON TECH STUDIO
 * PROTECTED: Real-time Chat, Midnight Reset & Sync Implementation
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import SidebarLeft from './components/SidebarLeft';
import SidebarRight from './components/SidebarRight';
import MainContent from './components/MainContent';
import Dashboard from './components/Dashboard';
import Header from './components/Header';
import ProcessManagement from './components/ProcessManagement';
import FileManagement from './components/FileManagement';
import TaskManager from './components/TaskManager';
import GeneralBoard from './components/GeneralBoard';
import Login from './components/Auth/Login';
import SignUp from './components/Auth/SignUp';
import ForgotPassword from './components/Auth/ForgotPassword';
import ProfileEdit from './components/ProfileEdit';
import ProjectDetail from './components/ProjectDetail';
import { useTaskViewModel } from './hooks/useTaskViewModel';
import { useProjectViewModel } from './hooks/useProjectViewModel';
import { useAuthViewModel } from './hooks/useAuthViewModel';
import { SyncService } from './services/syncService';
import { UpdateService } from './services/updateService';
import { Project, Message, ProcessLog, FileInfo, Process } from './types';
import { apiClient } from './services/apiClient';

interface OnlineUser {
  userId: string;
  userName: string;
}

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState('dashboard');
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false); // Ref for immediate sync status tracking
  const [selectedProjectForDetail, setSelectedProjectForDetail] = useState<Project | null>(null);

  // 실시간 데이터 상태
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [activeUsers, setActiveUsers] = useState<{ name: string; avatar: string }[]>([]);
  const lastDateRef = useRef(new Date().toDateString());

  const authVM = useAuthViewModel();
  const taskVM = useTaskViewModel([], authVM.currentUser || { id: '', name: '', avatar: '' });
  const projectVM = useProjectViewModel([], []);

  const latestProcessLogs = useMemo<ProcessLog[]>(() => {
    const projectMap = new Map(projectVM.projects.map(p => [p.id, p.title]));
    return projectVM.processes.slice(0, 5).map(p => ({
      id: p.id,
      projectName: projectMap.get(p.projectId) ?? '프로젝트',
      step: p.title,
      status: p.isCompleted ? 'Completed' : 'In Progress',
      updatedAt: p.endDate || p.startDate || '최근'
    }));
  }, [projectVM.projects, projectVM.processes]);
  const latestFiles = useMemo<FileInfo[]>(() => [], []);
  const recentProcesses = useMemo<Process[]>(() => projectVM.processes.slice(0, 5), [projectVM.processes]);

  useEffect(() => {
    const checkUpdates = async () => {
      try {
        await UpdateService.checkForUpdates();
      } catch (error) {
        console.error('Update check failed', error);
      }
    };

    checkUpdates();
  }, []);

  // [REAL-TIME POLL] 채팅 및 자정 초기화 감지
  useEffect(() => {
    if (!authVM.currentUser) return;

    SyncService.sendHeartbeat(authVM.currentUser.id, authVM.currentUser.name);

    const interval = setInterval(() => {
      // 1. 자정 초기화 체크
      const today = new Date().toDateString();
      if (today !== lastDateRef.current) {
        setChatMessages([]); // 채팅 내역 초기화
        lastDateRef.current = today;
        console.log("[System] Midnight detected. Chat cleared.");
      }

      // 2. 하트비트 및 데이터 폴링
      SyncService.sendHeartbeat(authVM.currentUser!.id, authVM.currentUser!.name);
      pollUpdates();
    }, 5000); 

    return () => {
      clearInterval(interval);
      // 로그아웃 시나리오 등에서 마지막 하트비트 발송 (비주얼 처리)
    };
  }, [authVM.currentUser]);

  const pollUpdates = async () => {
    if (isSyncingRef.current) return; // Prevent overlapping sync calls
    
    isSyncingRef.current = true;
    setIsSyncing(true);
    
    try {
      const newChatMsgs = await SyncService.fetchNewUpdates('CHAT');
      if (newChatMsgs.length > 0) {
        const formatted = newChatMsgs.map(m => m.payload as Message);
        setChatMessages(prev => [...prev, ...formatted]);
      }
    } catch (e) {
      console.error("Polling failed", e);
    } finally {
      setTimeout(() => {
        setIsSyncing(false);
        isSyncingRef.current = false;
      }, 500);
    }
  };

  const handleSendMessage = (text: string) => {
    if (!text.trim() || !authVM.currentUser) return;
    
    const newMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: authVM.currentUser.name,
      avatar: authVM.currentUser.avatar,
      text: text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages(prev => [...prev, newMsg]);
    SyncService.broadcastChange('CHAT', 'CREATE', newMsg.id, newMsg, authVM.currentUser.id, authVM.currentUser.name);
  };

  const triggerCloudSync = async () => {
    if (isSyncingRef.current) return;
    
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      await SyncService.importLatestSnapshot();
      window.location.reload();
    } finally {
      setTimeout(() => {
        setIsSyncing(false);
        isSyncingRef.current = false;
      }, 800);
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSelectedProjectForDetail(null);
    switch (tab) {
      case 'Projects': setCurrentView('projects'); break;
      case 'Files': setCurrentView('files'); break;
      case 'Schedule': setCurrentView('tasks'); break;
      case 'Board': setCurrentView('board'); break;
      default: setCurrentView('dashboard'); break;
    }
  };

  const handleViewChange = (view: string) => {
    setCurrentView(view);
    setSelectedProjectForDetail(null);
    if (view === 'projects' || view === 'process') setActiveTab('Projects');
    else if (view === 'files') setActiveTab('Files');
    else if (view === 'tasks') setActiveTab('Schedule');
    else if (view === 'board') setActiveTab('Board');
    else setActiveTab('Dashboard');
  };

  useEffect(() => {
    if (!authVM.currentUser) {
      setActiveUsers([]);
      return;
    }

    const loadOnlineUsers = async () => {
      try {
        const data = await apiClient.get<OnlineUser[]>(`/sync/online?withinSeconds=60`);
        const list = (data ?? []).map(user => ({
          name: user.userName,
          avatar: `https://picsum.photos/seed/${user.userId}/100/100` 
        }));
        const fallbackSelf = authVM.currentUser
          ? [{ name: authVM.currentUser.name, avatar: authVM.currentUser.avatar }]
          : [];
        setActiveUsers(list.length > 0 ? list : fallbackSelf);
      } catch (error) {
        console.warn('Interent connection needed for avatars. Using default.', error);
        // Offline fallback: Use a generic UI for avatars if internet is down
        setActiveUsers(authVM.currentUser ? [{ name: authVM.currentUser.name, avatar: authVM.currentUser.avatar }] : []);
      }
    };

    loadOnlineUsers();
    const onlineInterval = setInterval(loadOnlineUsers, 10000);

    return () => clearInterval(onlineInterval);
  }, [authVM.currentUser]);

  if (!authVM.isInitialized) {
    return (
      <div className="flex flex-col items-center justify-center bg-slate-900 h-full w-full text-white">
        <div className="w-12 h-12 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-4" />
        <h2 className="text-xl font-bold">협업 스튜디오</h2>
        <p className="text-slate-400 mt-2">사용자 인증 정보를 확인하고 있습니다...</p>
      </div>
    );
  }

  if (!authVM.currentUser) {
    if (authVM.authMode === 'signup') {
      return <SignUp onSignUp={authVM.actions.signup} onBack={() => authVM.actions.setMode('login')} />;
    }
    if (authVM.authMode === 'forgot') {
      return <ForgotPassword onSend={authVM.actions.sendTempPassword} onBack={() => authVM.actions.setMode('login')} />;
    }
    return <Login 
      onLogin={(id, password, rem) => authVM.actions.login({ id, password, rememberId: rem })} 
      onGoSignUp={() => authVM.actions.setMode('signup')}
      onGoForgot={() => authVM.actions.setMode('forgot')}
    />;
  }

  const { title, icon } = {
    dashboard: { title: 'Dash Board', icon: 'dashboard' },
    projects: { title: '프로젝트 관리', icon: 'assignment' },
    process: { title: '공정 관리', icon: 'account_tree' },
    files: { title: '파일 관리', icon: 'cloud_queue' },
    tasks: { title: '할일 관리', icon: 'checklist' },
    board: { title: '전체 게시판', icon: 'forum' },
  }[currentView as 'dashboard' | 'projects' | 'process' | 'files' | 'tasks' | 'board'] || { title: '협업 스튜디오', icon: 'biotech' };

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50 font-['Inter'] min-w-0">
      <SidebarLeft 
        currentView={currentView} 
        onViewChange={handleViewChange} 
        onEditProfile={() => setIsProfileEditing(true)}
        onLogout={authVM.actions.logout}
        user={authVM.currentUser}
        activeUsers={activeUsers}
      />

      <div className="flex-1 flex flex-col overflow-hidden bg-white border-x border-slate-200 min-w-0">
        <Header 
          title={title} 
          icon={icon}
          showSearch={currentView !== 'dashboard'} 
          activeTab={activeTab} 
          onTabChange={handleTabChange}
          isSyncingExternal={isSyncing}
          onManualSync={triggerCloudSync}
        />
        
        <div className="flex-1 overflow-hidden relative bg-slate-50/20 min-w-0">
          <div className="h-full overflow-y-auto main-content-area">
            {selectedProjectForDetail ? (
               <div className="p-8 max-w-5xl mx-auto">
                 <button onClick={() => setSelectedProjectForDetail(null)} className="mb-6 flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold text-sm">
                   <span className="material-symbols-outlined">arrow_back</span>목록으로 돌아가기
                 </button>
                 <ProjectDetail project={selectedProjectForDetail} currentUser={authVM.currentUser} onBack={() => setSelectedProjectForDetail(null)} />
               </div>
            ) : currentView === 'dashboard' ? (
              <Dashboard recentProjects={projectVM.projects} processLogs={latestProcessLogs} recentFiles={latestFiles} />
            ) : currentView === 'projects' ? (
              <MainContent projects={projectVM.projects} onSelectProject={(p) => setSelectedProjectForDetail(p)} />
            ) : currentView === 'process' ? (
              <ProcessManagement 
                projects={projectVM.projects} 
                processes={projectVM.processes}
                currentUser={authVM.currentUser}
                onToggleProcess={(id) => projectVM.actions.toggleProcess(id)}
                onAddProcess={(p) => projectVM.actions.addProcess({ ...p, id: `pr-${Date.now()}`, isCompleted: false, authorId: authVM.currentUser!.id })}
                onUpdateProcess={(p) => projectVM.actions.updateProcess(p)}
              />
            ) : currentView === 'files' ? (
              <FileManagement />
            ) : currentView === 'tasks' ? (
              <TaskManager tasks={taskVM.tasks} currentUser={authVM.currentUser} onAddTask={taskVM.actions.addTask} onUpdateTask={taskVM.actions.updateTask} onDeleteTask={taskVM.actions.deleteTask} />
            ) : currentView === 'board' ? (
              <GeneralBoard 
                posts={[]}
                currentUser={authVM.currentUser}
                onAddPost={() => {}}
                onUpdatePost={() => {}}
                onDeletePost={() => {}}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400">
                <p>페이지 준비 중</p>
              </div>
            )}
          </div>

          {isProfileEditing && (
            <ProfileEdit 
              user={authVM.currentUser} 
              onClose={() => setIsProfileEditing(false)} 
              onSave={authVM.actions.updateProfile} 
            />
          )}
        </div>
      </div>

      <SidebarRight 
        messages={chatMessages} 
        teamTasks={taskVM.tasks.filter(t => !t.completed).slice(0, 5)}
        personalTasks={taskVM.tasks.filter(t => t.authorId === authVM.currentUser.id && !t.completed)}
        processes={recentProcesses}
        notifications={[]} 
        onViewTask={() => handleViewChange('tasks')}
        onViewProcess={() => handleViewChange('process')}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
};

export default App;

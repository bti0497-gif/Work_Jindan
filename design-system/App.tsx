
import React, { useState } from 'react';
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
import ProfileEdit from './components/ProfileEdit';
import { INITIAL_PROJECTS, INITIAL_PROCESSES, INITIAL_TASKS, INITIAL_BOARD_POSTS } from './services/mockData';
import { useTaskViewModel } from './hooks/useTaskViewModel';
import { useProjectViewModel } from './hooks/useProjectViewModel';
import { useAuthViewModel } from './hooks/useAuthViewModel';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState('dashboard');
  const [activeTab, setActiveTab] = useState('Projects');
  const [isProfileEditing, setIsProfileEditing] = useState(false);

  // 1. Auth ViewModel 주입 (로그인 여부 체크)
  const authVM = useAuthViewModel();
  
  // 2. Task/Project/Board 데이터 (로그인 후에만 유효하지만 로직상 선언)
  const taskVM = useTaskViewModel(INITIAL_TASKS, authVM.currentUser || { id: '', name: '', avatar: '' });
  const projectVM = useProjectViewModel(INITIAL_PROJECTS, INITIAL_PROCESSES);
  const [boardPosts, setBoardPosts] = useState(INITIAL_BOARD_POSTS);

  // --- Auth Gate ---
  if (!authVM.isInitialized) return <div className="bg-slate-900 h-screen w-screen" />;

  if (!authVM.currentUser) {
    if (authVM.authMode === 'signup') {
      return <SignUp onSignUp={authVM.actions.signup} onBack={() => authVM.actions.setMode('login')} />;
    }
    if (authVM.authMode === 'forgot') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6">
          <div className="bg-white p-10 rounded-3xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">비밀번호 찾기</h2>
            <p className="text-slate-500 text-sm mb-6">등록된 이메일 주소로 임시 비밀번호를 발송합니다.</p>
            <input type="email" placeholder="email@deojon.com" className="w-full px-5 py-3.5 bg-slate-50 border rounded-2xl mb-6 outline-none" />
            <div className="flex gap-4">
              <button onClick={() => authVM.actions.setMode('login')} className="flex-1 py-3 text-slate-400 font-bold">취소</button>
              <button onClick={() => authVM.actions.sendTempPassword('test@email.com')} className="flex-1 bg-blue-600 text-white rounded-xl font-bold">발송하기</button>
            </div>
          </div>
        </div>
      );
    }
    return <Login 
      onLogin={(id, rem) => authVM.actions.login({ id, rememberId: rem })} 
      onGoSignUp={() => authVM.actions.setMode('signup')}
      onGoForgot={() => authVM.actions.setMode('forgot')}
    />;
  }
  // -----------------

  const getViewTitle = () => {
    switch (currentView) {
      case 'dashboard': return 'Dash Board';
      case 'projects': return '프로젝트 관리';
      case 'process': return '공정 관리';
      case 'files': return '파일 관리';
      case 'tasks': return '할일 관리';
      case 'board': return '전체 게시판';
      default: return '협업 스튜디오';
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 fixed inset-0">
      <SidebarLeft 
        currentView={currentView} 
        onViewChange={setCurrentView} 
        onEditProfile={() => setIsProfileEditing(true)}
        onLogout={authVM.actions.logout}
        user={authVM.currentUser}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-[500px] bg-white">
        <Header 
          title={getViewTitle()} 
          showSearch={currentView !== 'dashboard'} 
          activeTab={activeTab} 
          onTabChange={setActiveTab} 
        />
        
        <div className="flex-1 overflow-hidden relative">
          {currentView === 'dashboard' ? (
            <Dashboard recentProjects={projectVM.projects} />
          ) : currentView === 'projects' ? (
            <MainContent projects={projectVM.projects} />
          ) : currentView === 'process' ? (
            <ProcessManagement 
              projects={projectVM.projects} 
              processes={projectVM.processes}
              onToggleProcess={projectVM.actions.toggleProcess}
              onAddProcess={(p) => projectVM.actions.addProcess({ ...p, id: `pr-${Date.now()}`, isCompleted: false })}
              onUpdateProcess={projectVM.actions.updateProcess}
            />
          ) : currentView === 'files' ? (
            <FileManagement />
          ) : currentView === 'tasks' ? (
            <TaskManager 
              tasks={taskVM.tasks} 
              currentUser={authVM.currentUser}
              onAddTask={taskVM.actions.addTask}
              onUpdateTask={taskVM.actions.updateTask}
              onDeleteTask={taskVM.actions.deleteTask}
            />
          ) : currentView === 'board' ? (
            <GeneralBoard 
              posts={boardPosts}
              currentUser={authVM.currentUser}
              onAddPost={(p) => setBoardPosts(prev => [p, ...prev])}
              onUpdatePost={(p) => setBoardPosts(prev => prev.map(old => old.id === p.id ? p : old))}
              onDeletePost={(id) => setBoardPosts(prev => prev.filter(p => p.id !== id))}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-slate-50/30 text-slate-400">
              <div className="text-center">
                <span className="material-symbols-outlined text-6xl mb-4">construction</span>
                <p className="font-bold text-lg">{getViewTitle()} 페이지 준비 중</p>
              </div>
            </div>
          )}

          {/* Profile Edit Overlay */}
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
        messages={[]} 
        teamTasks={taskVM.tasks.filter(t => !t.completed).slice(0, 5)}
        personalTasks={taskVM.tasks.filter(t => t.authorId === authVM.currentUser.id && !t.completed)}
        notifications={[]} 
        onViewTask={() => setCurrentView('tasks')}
      />
    </div>
  );
};

export default App;

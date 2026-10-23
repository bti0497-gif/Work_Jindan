/* 
 * ==========================================================================
 * [PROTECTION ZONE] CORE IMPORTS - DO NOT REMOVE OR MODIFY ACCIDENTALLY
 * --------------------------------------------------------------------------
 */
import React, { useState, useEffect } from 'react';
import './index.css';
import LeftSidebar from './components/LeftSidebar';
import FileManager from './components/FileManager';
import BoardWrite from './components/BoardWrite';
import BoardList from './components/BoardList';
import BoardView from './components/BoardView';
import { initSystemStorage } from './services/dataService';
import { restoreSession } from './services/authService';
import { syncAllData, pushLocalToSupabase } from './services/syncService';
import ProjectList from './components/ProjectList';
import ProjectWrite from './components/ProjectWrite';
import ProjectView from './components/ProjectView';
import ProcessList from './components/ProcessList';
import TaskManager from './components/TaskManager';
import RightSidebar from './components/RightSidebar';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import MemberList from './components/MemberList';
import GlobalModal from './components/common/GlobalModal';
import { Minus, X, Square } from 'lucide-react';
import packageJson from '../package.json';
/* ========================================================================== */

function App() {
  const [activeMenu, setActiveMenu] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [selectedPost, setSelectedPost] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [sysReady, setSysReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastDataUpdate, setLastDataUpdate] = useState(Date.now()); // 데이터 변경 감지용
  /* ------------ */
  const [modal, setModal] = useState({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null
  });

  // [SYNC ENGINE] 주기적 데이터 동기화 플러그인
  useEffect(() => {
    if (!sysReady) return;

    // 1. 초기 동기화 실행
    syncAllData().catch(err => console.error('Initial sync failed:', err));

    // 2. 5분마다 하향 동기화 (클라우드 -> 로컬)
    const pullInterval = setInterval(() => {
      syncAllData();
    }, 5 * 60 * 1000);

    // 3. 1분마다 상향 동기화 (로컬 -> 클라우드)
    const pushInterval = setInterval(() => {
      pushLocalToSupabase();
    }, 60 * 1000);

    return () => {
      clearInterval(pullInterval);
      clearInterval(pushInterval);
    };
  }, [sysReady]);

  const showAlert = (message, title = '알림', type = 'alert') => {
    return new Promise((resolve) => {
      setModal({
        isOpen: true,
        type,
        title,
        message,
        onConfirm: () => {
          setModal(prev => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        onCancel: null
      });
    });
  };

  const showConfirm = (message, title = '확인') => {
    return new Promise((resolve) => {
      setModal({
        isOpen: true,
        type: 'confirm',
        title,
        message,
        onConfirm: () => {
          setModal(prev => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          setModal(prev => ({ ...prev, isOpen: false }));
          resolve(false);
        }
      });
    });
  };

  useEffect(() => {
    const init = async () => {
      try {
        await initSystemStorage(import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID || import.meta.env.GOOGLE_DRIVE_FOLDER_ID)
          .catch(error => console.warn('Drive initialization unavailable:', error));

        // 초기 데이터 동기화
        try {
          await syncAllData();
        } catch (e) {
          console.error('Initial sync failed:', e);
        }

        setSysReady(true);

        // 세션 확인
        const user = await restoreSession();
        if (user) setCurrentUser(user);
      } catch (err) {
        console.error('System initialization failed:', err);
      } finally {
        setSysReady(true);
      }
    };
    init();
  }, []);

  // 자동 업데이트 리스너
  useEffect(() => {
    if (window.electron) {
      window.electron.receive('update-available', (info) => {
        console.log('Update available:', info);
        // 사용자에게 알림을 줄 수도 있지만, "자동 교체"를 위해 로그만 남김
      });

      window.electron.receive('download-progress', (progressObj) => {
        console.log(`Download progress: ${progressObj.percent}%`);
      });

      window.electron.receive('update-downloaded', () => {
        console.log('Update downloaded. Restarting to install...');
        // 다운로드 완료 시 즉시 재시작하여 업데이트 설치
        window.electron.send('restart_app');
      });

      window.electron.receive('update-error', (err) => {
        console.error('Update error:', err);
      });
    }
  }, []);

  // Window Controls
  const handleMinimize = () => window.electron?.send('minimize-window');
  const handleMaximize = () => window.electron?.send('maximize-window');
  const handleClose = () => window.electron?.send('close-window');


  const renderContent = () => {
    if (!sysReady && activeMenu !== '파일관리') {
      return (
        <div className="center-msg">
          <p>시스템 동기화 중입니다. 잠시만 기다려 주세요...</p>
        </div>
      );
    }

    if (!currentUser) {
      return <Login onLoginSuccess={(user) => setCurrentUser(user)} showAlert={showAlert} showConfirm={showConfirm} />;
    }

    const boardWidthStyle = {
      maxWidth: '680px',
      margin: '0 auto',
      width: '100%',
      backgroundColor: '#fff',
      minHeight: '100%'
    };

    switch (activeMenu) {
      case '파일관리':
        return <FileManager showAlert={showAlert} showConfirm={showConfirm} />;
      case '할일관리':
        return <TaskManager showAlert={showAlert} showConfirm={showConfirm} onDataChange={() => setLastDataUpdate(Date.now())} />;
      case '본사공지':
      case '전체게시판':
        if (viewMode === 'write') {
          return (
            <div style={boardWidthStyle}>
              <BoardWrite
                menuName={activeMenu}
                initialData={selectedPost}
                onCancel={() => {
                  if (selectedPost) setViewMode('view');
                  else setViewMode('list');
                }}
                onSaveSuccess={() => {
                  setSelectedPost(null);
                  setViewMode('list');
                  setLastDataUpdate(Date.now());
                }}
                showAlert={showAlert}
                showConfirm={showConfirm}
              />
            </div>
          );
        }
        if (viewMode === 'view') {
          return (
            <div style={boardWidthStyle}>
              <BoardView
                post={selectedPost}
                boardUser={currentUser}
                onBack={() => setViewMode('list')}
                onEdit={(post) => { setSelectedPost(post); setViewMode('write'); }}
                onDeleteSuccess={() => {
                  setViewMode('list');
                  setLastDataUpdate(Date.now());
                }}
                showAlert={showAlert}
                showConfirm={showConfirm}
              />
            </div>
          );
        }
        return (
          <div style={boardWidthStyle}>
            <BoardList
              key={activeMenu}
              menuName={activeMenu}
              boardUser={currentUser}
              onViewPost={(post) => {
                setSelectedPost(post);
                setViewMode('view');
              }}
              onWriteNew={() => {
                setSelectedPost(null);
                setViewMode('write');
              }}
              showAlert={showAlert}
              showConfirm={showConfirm}
            />
          </div>
        );
      case '멤버관리':
      case '회원관리':
        return (
          <div style={boardWidthStyle}>
            <MemberList showAlert={showAlert} showConfirm={showConfirm} onDataChange={() => setLastDataUpdate(Date.now())} />
          </div>
        );
      case '프로젝트관리':
        if (viewMode === 'write') {
          return (
            <div style={boardWidthStyle}>
              <ProjectWrite
                initialData={selectedProject}
                onCancel={() => {
                  if (selectedProject) setViewMode('view');
                  else setViewMode('list');
                }}
                onSaveSuccess={() => {
                  setSelectedProject(null);
                  setViewMode('list');
                  setLastDataUpdate(Date.now());
                }}
                showAlert={showAlert}
                showConfirm={showConfirm}
              />
            </div>
          );
        }
        if (viewMode === 'view') {
          return (
            <div style={boardWidthStyle}>
              <ProjectView
                project={selectedProject}
                onBack={() => setViewMode('list')}
                onEdit={() => setViewMode('write')}
                onDeleteSuccess={() => {
                  setViewMode('list');
                  setLastDataUpdate(Date.now());
                }}
                showAlert={showAlert}
                showConfirm={showConfirm}
              />
            </div>
          );
        }
        return (
          <div style={boardWidthStyle}>
            <ProjectList
              onViewProject={(proj) => {
                setSelectedProject(proj);
                setViewMode('view');
              }}
              onWriteNew={() => {
                setSelectedProject(null);
                setViewMode('write');
              }}
              showAlert={showAlert}
              showConfirm={showConfirm}
            />
          </div>
        );
      case '공정관리':
        return (
          <div style={boardWidthStyle}>
            <ProcessList showAlert={showAlert} showConfirm={showConfirm} />
          </div>
        );
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-container">
      {/* Header / Title Bar */}
      <header className="header">
        <div
          className="header-title"
          onClick={() => setActiveMenu('')}
          style={{ cursor: 'pointer' }}
          title="대시보드로 이동"
        >
          <img src="./icon.svg" alt="App Icon" className="app-icon" />
          더죤환경기술(주) 기술진단팀 협업스튜디오
        </div>
        <div className="header-controls">
          <div className="control-btn" title="최소화" onClick={handleMinimize}>
            <Minus size={14} />
          </div>
          <div className="control-btn" title="최대화" onClick={handleMaximize}>
            <Square size={12} />
          </div>
          <div className="control-btn close" title="닫기" onClick={handleClose}>
            <X size={14} />
          </div>
        </div>
      </header>

      {/* Main Layout Body */}
      <main className="main-wrapper">
        {/* Left Sidebar (250px) */}
        <LeftSidebar
          onMenuSelect={(menu) => {
            if (!currentUser) return; // 미로그인 시 차단

            setActiveMenu(menu);
            setViewMode('list');

            // 메뉴 이동 시 자동 동기화 (백그라운드)
            if (!isSyncing) {
              setIsSyncing(true);
              syncAllData().finally(() => setIsSyncing(false));
            }
          }}
          activeMenu={activeMenu}
          currentUser={currentUser}
          disabled={!currentUser}
          showAlert={showAlert}
          showConfirm={showConfirm}
        />

        {/* Center Workspace (Responsive & Independent Scroll) */}
        <section className="workspace">
          {renderContent()}
        </section>


        {/* Right Sidebar - Dashboard */}
        {currentUser && (
          <RightSidebar
            onMenuSelect={(menu) => {
              setActiveMenu(menu);
              setViewMode('list');

              // 동기화는 백그라운드에서 진행
              if (!isSyncing) {
                setIsSyncing(true);
                syncAllData().finally(() => setIsSyncing(false));
              }
            }}
            activeMenu={activeMenu}
            isSyncing={isSyncing}
            lastDataUpdate={lastDataUpdate}
            setSelectedProject={setSelectedProject}
            setSelectedDate={() => { }}
          />
        )}
      </main>

      {/* Footer / Status Bar */}
      <footer className="status-bar">
        <div className="status-item">
          <span style={{
            width: '8px',
            height: '8px',
            background: sysReady ? '#10b981' : '#f59e0b',
            borderRadius: '50%',
            display: 'inline-block',
            marginRight: '6px',
            animation: sysReady ? 'none' : 'pulse 1.5s infinite'
          }}></span>
          {isSyncing ? '동기화 확인 중...' : (sysReady ? '준비됨' : '시작 중...')}
        </div>
        <div className="status-item">
          v{packageJson.version}
        </div>
      </footer>

      {/* Global Modal Overlay */}
      <GlobalModal
        {...modal}
        onConfirm={modal.onConfirm}
        onCancel={modal.onCancel}
      />
    </div>
  );
}

export default App;

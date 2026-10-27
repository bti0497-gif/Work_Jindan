/* 
 * ==========================================================================
 * [PROTECTION ZONE] CORE IMPORTS - DO NOT REMOVE OR MODIFY ACCIDENTALLY
 * --------------------------------------------------------------------------
 */
import React, { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import './index.css';
import LeftSidebar from './components/LeftSidebar';
import { REPORT_SECTIONS } from './services/report/reportSections.js';
import FileManager from './components/FileManager';
import BoardWrite from './components/BoardWrite';
import BoardList from './components/BoardList';
import BoardView from './components/BoardView';
import { initSystemStorage } from './services/dataService';
import { restoreSession } from './services/authService';
import { syncAllData, pushLocalToSupabase } from './services/syncService';
import { DRIVE_ROOT_ID, warmDriveCache, subscribeDriveCache, getDriveCacheStatus, formatDriveCacheStatus } from './services/driveCacheService';
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
const ReportWorkspace = React.lazy(() => import('./components/ReportWorkspace.jsx'));
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
  const driveCache = useSyncExternalStore(subscribeDriveCache, getDriveCacheStatus);
  const dataSyncRunningRef = useRef(false);
  const promptValueRef = useRef('');
  const synchronizeData = useCallback(async () => {
    if (dataSyncRunningRef.current) return;
    dataSyncRunningRef.current = true;
    setIsSyncing(true);
    try {
      await syncAllData();
      setLastDataUpdate(Date.now());
    } catch (error) {
      console.error('Background data sync failed:', error);
    } finally {
      dataSyncRunningRef.current = false;
      setIsSyncing(false);
    }
  }, []);
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

    // 2. 5분마다 하향 동기화 (클라우드 -> 로컬)
    const pullInterval = setInterval(() => {
      synchronizeData();
    }, 5 * 60 * 1000);

    // 3. 1분마다 상향 동기화 (로컬 -> 클라우드)
    const pushInterval = setInterval(() => {
      pushLocalToSupabase().catch(error => console.error('Background upload failed:', error));
    }, 60 * 1000);

    return () => {
      clearInterval(pullInterval);
      clearInterval(pushInterval);
    };
  }, [sysReady, synchronizeData]);

  useEffect(() => {
    warmDriveCache({ force: true });
    const refreshCache = () => { warmDriveCache({ force: true }); };
    const timer = setInterval(refreshCache, 10 * 60 * 1000);
    window.addEventListener('online', refreshCache);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', refreshCache);
    };
  }, []);

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

  const showPrompt = (message, defaultValue = '', title = '입력') => new Promise(resolve => {
    promptValueRef.current = defaultValue;
    setModal({
      isOpen: true, type: 'prompt', title, message, inputValue: defaultValue,
      onConfirm: () => {
        setModal(previous => ({ ...previous, isOpen: false }));
        resolve(promptValueRef.current);
      },
      onCancel: () => {
        setModal(previous => ({ ...previous, isOpen: false }));
        resolve(null);
      }
    });
  });

  useEffect(() => {
    const init = async () => {
      try {
        // 로그인 화면과 저장된 목록은 Drive 탐색을 기다리지 않고 표시합니다.
        setSysReady(true);
        const user = await restoreSession().catch(error => {
          console.warn('Session restore unavailable:', error);
          return null;
        });
        if (user) setCurrentUser(user);
        await initSystemStorage(DRIVE_ROOT_ID)
          .catch(error => console.warn('Drive initialization unavailable:', error));
        await synchronizeData();
      } catch (err) {
        console.error('System initialization failed:', err);
      } finally {
        setSysReady(true);
      }
    };
    init();
  }, [synchronizeData]);

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
      case '진단보고서':
      case '보고서 작성/공정':
      case '보고서 작성/기계':
      case '보고서 작성/전기':
        return <React.Suspense fallback={<div className="center-msg">보고서 엔진 로딩 중…</div>}><ReportWorkspace currentUser={currentUser} discipline={REPORT_SECTIONS.find(section => section.menu === activeMenu)?.id || 'electrical'} /></React.Suspense>;
      case '파일관리':
        return <FileManager showAlert={showAlert} showConfirm={showConfirm} showPrompt={showPrompt} />;
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
            if (menu !== '파일관리') synchronizeData();
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
              if (menu !== '파일관리') synchronizeData();
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
        <div className="status-item" role="status" title={driveCache.error || (driveCache.lastSynced ? `마지막 갱신: ${new Date(driveCache.lastSynced).toLocaleString()}` : '폴더·파일 목록을 미리 저장하고 백그라운드에서 갱신합니다.')}>
          {formatDriveCacheStatus(driveCache)}
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
        onInputChange={value => {
          promptValueRef.current = value;
          setModal(previous => ({ ...previous, inputValue: value }));
        }}
      />
    </div>
  );
}

export default App;

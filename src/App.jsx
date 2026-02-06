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
import { initSystemStorage } from './services/dataService';
/* ========================================================================== */

function App() {
  /* [CORE STATE] */
  const [activeMenu, setActiveMenu] = useState('');
  const [sysReady, setSysReady] = useState(false);
  /* ------------ */

  useEffect(() => {
    const init = async () => {
      try {
        await initSystemStorage(import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID);
        setSysReady(true);
      } catch (err) {
        console.error('System initialization failed:', err);
      }
    };
    init();
  }, []);

  const renderContent = () => {
    if (!sysReady && activeMenu !== '파일관리') {
      return (
        <div className="center-msg">
          <p>시스템 동기화 중입니다. 잠시만 기다려 주세요...</p>
        </div>
      );
    }

    switch (activeMenu) {
      case '파일관리':
        return <FileManager />;
      case '프로젝트관리':
      case '공정관리':
      case '할일관리':
      case '전체게시판':
      case '회원관리':
        return <BoardWrite
          menuName={activeMenu}
          onCancel={() => setActiveMenu('')}
          onSaveSuccess={() => {
            // 저장 성공 후 리스트로 이동하거나 알림 처리
            setActiveMenu('');
          }}
        />;
      default:
        return (
          <div className="welcome-screen">
            <h1>협업 스튜디오에 오신 것을 환영합니다</h1>
            <p>왼쪽 메뉴에서 작업할 항목을 선택해 주세요.</p>
          </div>
        );
    }
  };

  return (
    <div className="app-container">
      {/* Header / Title Bar */}
      <header className="header">
        <div className="header-title">
          더죤환경기술(주) 기술진단팀 협업스튜디오
        </div>
        <div className="header-controls">
          <div className="control-btn" title="Minimize">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="2" y="5.5" width="8" height="1" fill="currentColor" />
            </svg>
          </div>
          <div className="control-btn close" title="Close">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </div>
        </div>
      </header>

      {/* Main Layout Body */}
      <main className="main-wrapper">
        {/* Left Sidebar (250px) */}
        <LeftSidebar onMenuSelect={setActiveMenu} activeMenu={activeMenu} />

        {/* Center Workspace (Responsive & Independent Scroll) */}
        <section className="workspace">
          {renderContent()}
        </section>

        {/* Right Sidebar (300px) */}
        <aside className="sidebar-right">
          <div className="section-header">Details & Insights</div>
          <div style={{ padding: '0 16px' }}>
            <p style={{ color: '#64748b', fontSize: '13px' }}>Contextual information and stats...</p>
          </div>
        </aside>
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
          {sysReady ? 'Cloud Synced' : 'Syncing...'}
        </div>
        <div className="status-item">
          v1.0.0-prototype | 2026-02-06
        </div>
      </footer>
    </div>
  );
}

export default App;

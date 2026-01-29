
/**
 * FINALIZED UI COMPONENT - DEOJON TECH STUDIO
 * WINDOWS 11 EXPLORER STYLE FILE MANAGEMENT (WITH RESIZABLE PREVIEW PANE)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface FileItem {
  id: string;
  name: string;
  type: 'folder' | 'xlsx' | 'pdf' | 'docx' | 'png';
  status: 'synced' | 'syncing' | 'local';
  updatedAt: string;
  size: string;
}

const DRIVE_LINK = "https://drive.google.com/drive/folders/1U1vGTvNjikkZXxhw_P08EKx0wdU3QZZb?usp=sharing";

const FileManagement: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [previewWidth, setPreviewWidth] = useState(420); // 초기 너비
  const [isResizing, setIsResizing] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, fileId: string } | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const resizerRef = useRef<HTMLDivElement>(null);

  // 스크린샷 기반 초기 데이터
  const [files] = useState<FileItem[]>([
    { id: 'd1', name: '202505', type: 'folder', status: 'synced', updatedAt: '2025-05-10', size: '' },
    { id: 'd2', name: '202506', type: 'folder', status: 'synced', updatedAt: '2025-06-12', size: '' },
    { id: 'd3', name: '202507', type: 'folder', status: 'synced', updatedAt: '2025-07-15', size: '' },
    { id: 'd4', name: '202508', type: 'folder', status: 'synced', updatedAt: '2025-08-20', size: '' },
    { id: 'f1', name: '대신환경 명세서', type: 'xlsx', status: 'syncing', updatedAt: '2026-01-15', size: '42 KB' },
    { id: 'f2', name: '에이치디이앤씨 거래명세표', type: 'xlsx', status: 'syncing', updatedAt: '2026-01-20', size: '38 KB' },
    { id: 'f3', name: '영일과학상사 거래명세서', type: 'xlsx', status: 'syncing', updatedAt: '2026-01-22', size: '45 KB' },
    { id: 'f4', name: '청담 거래명세서', type: 'xlsx', status: 'synced', updatedAt: '2025-12-15', size: '31 KB' },
  ]);

  const [currentPath] = useState(['OneDrive 시작', '태일 - 개인', '바탕 화면', '점검준비', '명세서']);

  // --- Resizing Logic ---
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = containerRect.right - e.clientX;
      
      // 너비 제한: 최소 250px, 최대 600px
      if (newWidth > 250 && newWidth < 600) {
        setPreviewWidth(newWidth);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none'; // 드래그 중 텍스트 선택 방지
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);
  // ----------------------

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const openDrive = () => { 
    window.open(DRIVE_LINK, '_blank'); 
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setSelectedId(id);
    setContextMenu({ x: e.clientX, y: e.clientY, fileId: id });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'folder': return { icon: 'folder', color: 'text-amber-400' };
      case 'xlsx': return { icon: 'table_chart', color: 'text-green-600' };
      default: return { icon: 'description', color: 'text-slate-400' };
    }
  };

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-white overflow-hidden text-[#333] relative">
      
      {/* 1. Command Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-slate-200 bg-[#f3f3f3] shrink-0">
        <div className="flex items-center gap-0.5">
          <button className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-200 rounded-md transition-colors group">
            <span className="material-symbols-outlined text-blue-600 text-[20px] group-active:scale-90 transition-transform">add_box</span>
            <span className="text-[12px] font-medium">새로 만들기</span>
            <span className="material-symbols-outlined text-[14px] text-slate-400">expand_more</span>
          </button>
          <div className="w-px h-5 bg-slate-300 mx-1.5"></div>
          <div className="flex items-center gap-0.5">
            {['content_cut', 'content_copy', 'content_paste', 'drive_file_rename_outline', 'share', 'delete'].map((icon, idx) => (
              <button key={icon} title={icon} className={`p-2 rounded-md transition-all ${idx === 2 ? 'text-slate-300 cursor-not-allowed' : 'hover:bg-slate-200 text-slate-600 active:scale-90'}`}>
                <span className="material-symbols-outlined text-[18px]">{icon}</span>
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-slate-300 mx-1.5"></div>
          <button className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-200 rounded-md text-[12px] font-medium text-slate-600"><span className="material-symbols-outlined text-[18px]">sort</span>정렬</button>
          <button className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-200 rounded-md text-[12px] font-medium text-slate-600"><span className="material-symbols-outlined text-[18px]">view_list</span>보기</button>
        </div>
        <button onClick={() => setShowPreview(!showPreview)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${showPreview ? 'bg-[#e5f3ff] text-blue-700 shadow-sm ring-1 ring-blue-100' : 'hover:bg-slate-200 text-slate-600'}`}>
          <span className="material-symbols-outlined text-[18px]">info</span>미리 보기
        </button>
      </div>

      {/* 2. Navigation Bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 bg-white shrink-0">
        <div className="flex items-center gap-0.5 text-slate-400 mr-2">
          <button className="p-1.5 hover:bg-slate-100 rounded active:bg-slate-200"><span className="material-symbols-outlined text-[18px]">arrow_back</span></button>
          <button className="p-1.5 hover:bg-slate-100 rounded active:bg-slate-200"><span className="material-symbols-outlined text-[18px]">arrow_forward</span></button>
          <button className="p-1.5 hover:bg-slate-100 rounded active:bg-slate-200"><span className="material-symbols-outlined text-[18px]">expand_less</span></button>
        </div>
        <div className="flex-1 flex items-center bg-white border border-slate-200 rounded px-2.5 py-1 gap-2 focus-within:border-blue-400 transition-colors">
          <span className="material-symbols-outlined text-[18px] text-blue-500">cloud</span>
          <div className="flex items-center text-[12px] text-slate-600 overflow-hidden font-medium">
            {currentPath.map((path, idx) => (
              <React.Fragment key={idx}>
                <span className="hover:bg-slate-100 px-1 py-0.5 rounded cursor-pointer">{path}</span>
                {idx < currentPath.length - 1 && <span className="material-symbols-outlined text-[14px] mx-0.5 text-slate-400">chevron_right</span>}
              </React.Fragment>
            ))}
          </div>
          <span className="material-symbols-outlined text-[16px] text-slate-400 ml-auto cursor-pointer hover:text-blue-500">expand_more</span>
        </div>
        <div className="relative w-60">
          <input type="text" placeholder="검색" className="w-full bg-white border border-slate-200 rounded px-3 py-1 text-[12px] outline-none focus:ring-1 focus:ring-blue-400 pr-8 shadow-inner" />
          <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">search</span>
        </div>
      </div>

      {/* 3. Main Body */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Tree Pane */}
        <aside className="w-52 border-r border-slate-200 overflow-y-auto sidebar-dark-scrollbar py-2 bg-[#f9f9f9]">
          <ul className="space-y-0.5 px-2">
            {['바탕 화면', '다운로드', '문서', '사진', '월정산', '명세서'].map((label, idx) => (
              <li key={idx}>
                <button className={`w-full flex items-center gap-3 px-3 py-1.5 rounded text-left transition-colors ${label === '명세서' ? 'bg-[#e5f3ff] text-blue-700 font-bold' : 'hover:bg-slate-200 text-slate-600'}`}>
                  <span className="material-symbols-outlined text-[18px] text-blue-500">{label === '명세서' ? 'description' : 'folder'}</span>
                  <span className="text-[12px] flex-1">{label}</span>
                  {label === '명세서' && <span className="material-symbols-outlined text-[14px] text-slate-400">push_pin</span>}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* File List Pane */}
        <main className="flex-1 overflow-auto flex flex-col bg-white">
          <table className="w-full text-left border-collapse min-w-[600px] table-fixed">
            <thead className="sticky top-0 bg-white border-b border-slate-100 shadow-sm z-10">
              <tr>
                <th className="py-2 px-6 text-[11px] font-bold text-slate-500 border-r border-slate-100 w-1/2 cursor-default hover:bg-slate-50">이름</th>
                <th className="py-2 px-4 text-[11px] font-bold text-slate-500 border-r border-slate-100 w-24 text-center cursor-default hover:bg-slate-50">상태</th>
                <th className="py-2 px-4 text-[11px] font-bold text-slate-500 cursor-default hover:bg-slate-50">수정한 날짜</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {files.map((file) => {
                const { icon, color } = getIcon(file.type);
                const isSelected = selectedId === file.id;
                return (
                  <tr 
                    key={file.id} 
                    onClick={() => setSelectedId(file.id)}
                    onContextMenu={(e) => handleContextMenu(e, file.id)}
                    onDoubleClick={openDrive}
                    className={`group transition-all cursor-pointer select-none border-l-[3px] h-9 ${
                      isSelected ? 'bg-[#e5f3ff] border-blue-600 shadow-sm' : 'hover:bg-slate-50 border-transparent'
                    }`}
                  >
                    <td className="px-6 truncate">
                      <div className="flex items-center gap-3">
                        <span className={`material-symbols-outlined ${color} text-[22px]`}>{icon}</span>
                        <span className={`text-[12px] font-medium truncate ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{file.name}</span>
                      </div>
                    </td>
                    <td className="text-center">
                      <span className="material-symbols-outlined text-[16px] text-blue-400">{file.status === 'synced' ? 'cloud_done' : 'sync'}</span>
                    </td>
                    <td className="px-4 text-[11px] text-slate-400 font-medium">{file.updatedAt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </main>

        {/* Resizer Handle */}
        {showPreview && (
          <div 
            ref={resizerRef}
            onMouseDown={startResizing}
            className={`w-[4px] bg-slate-100 hover:bg-blue-400 cursor-col-resize transition-colors z-20 shrink-0 ${isResizing ? 'bg-blue-600 w-[4px]' : ''}`}
          />
        )}

        {/* Preview Pane */}
        {showPreview && (
          <aside 
            style={{ width: `${previewWidth}px` }}
            className="border-l border-slate-200 bg-white flex flex-col shrink-0 overflow-hidden relative"
          >
            {selectedId ? (
              <div className="flex-1 flex flex-col p-8 items-center text-center overflow-y-auto sidebar-dark-scrollbar">
                <span className={`material-symbols-outlined text-[96px] mb-8 ${getIcon(files.find(f => f.id === selectedId)?.type || '').color} opacity-90`}>
                  {getIcon(files.find(f => f.id === selectedId)?.type || '').icon}
                </span>
                <h4 className="text-lg font-bold text-slate-900 mb-1 break-all">{files.find(f => f.id === selectedId)?.name}</h4>
                <p className="text-[11px] text-slate-400 font-bold tracking-wider mb-8 uppercase">Cloud storage object</p>
                
                <div className="w-full space-y-3">
                   <button onClick={openDrive} className="w-full bg-slate-900 text-white py-3.5 rounded-xl text-[12px] font-bold shadow-lg hover:bg-blue-600 transition-all active:scale-95">파일 열기</button>
                   <button className="w-full border border-slate-200 text-slate-600 py-3.5 rounded-xl text-[12px] font-bold hover:bg-slate-50 transition-all">다운로드</button>
                </div>

                <div className="mt-8 w-full p-5 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">상세 정보</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[11px] font-medium"><span className="text-slate-500">크기</span><span className="text-slate-800">{files.find(f => f.id === selectedId)?.size || '--'}</span></div>
                    <div className="flex justify-between text-[11px] font-medium"><span className="text-slate-500">수정일</span><span className="text-slate-800">{files.find(f => f.id === selectedId)?.updatedAt}</span></div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-300 p-8 space-y-4 opacity-50">
                <span className="material-symbols-outlined text-8xl">visibility</span>
                <p className="text-[13px] font-bold text-center">미리 볼 파일을 선택하십시오.</p>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Context Menu (Floating) */}
      {contextMenu && (
        <div 
          className="fixed bg-white border border-slate-200 shadow-2xl rounded-xl py-1.5 z-[100] min-w-[180px] animate-in fade-in zoom-in-95 duration-100 shadow-blue-900/10"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {['열기', '수정', '공유', '다운로드', '이름 바꾸기', '삭제', '속성'].map((item, idx) => (
            <React.Fragment key={item}>
              {idx === 4 || idx === 6 ? <div className="h-px bg-slate-100 mx-2 my-1"></div> : null}
              <button 
                className={`w-full text-left px-4 py-2 text-[12px] font-medium transition-colors flex items-center gap-3 ${item === '삭제' ? 'text-red-500 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-100'}`}
                onClick={() => {
                   alert(`${item}: ${files.find(f => f.id === contextMenu.fileId)?.name}`);
                   setContextMenu(null);
                }}
              >
                <span className="material-symbols-outlined text-[18px] opacity-70">
                  {item === '열기' ? 'open_in_new' : item === '다운로드' ? 'download' : item === '삭제' ? 'delete' : 'more_horiz'}
                </span>
                {item}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Footer */}
      <footer className="bg-[#f0f0f0] border-t border-slate-200 px-4 py-1 flex items-center justify-between shrink-0 h-8">
        <div className="flex items-center gap-4">
          <span className="text-[11px] text-slate-500 font-semibold">{files.length}개 항목</span>
          {selectedId && <span className="text-[11px] text-blue-600 font-bold">1개 항목 선택됨</span>}
        </div>
        <div className="flex items-center gap-4 text-blue-600">
           <span className="material-symbols-outlined text-[16px]">cloud_done</span>
           <span className="text-[10px] font-bold uppercase">Drive Connected</span>
        </div>
      </footer>
    </div>
  );
};

export default FileManagement;

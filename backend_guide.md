
# 🚀 THEZONE TECH STUDIO - BACKEND IMPLEMENTATION GUIDE (v1.0)

이 문서는 **더죤환경기술(주) 협업스튜디오**의 프론트엔드 기능을 실제 데이터베이스 및 서버 로직과 연결하기 위한 백엔드 설계 표준입니다.

## 1. 권장 기술 스택 (Recommended Stack)

비주얼 스튜디오 환경과의 호환성 및 유지보수 편의성을 고려하여 아래 두 가지 경로 중 하나를 선택하십시오.

### Option A: ASP.NET Core Web API (.NET 8/9) - 추천
- **장점**: 비주얼 스튜디오와 완벽 통합, 강력한 타입 시스템, WinForms WebView2와의 최상의 호환성.
- **ORM**: Entity Framework Core (EF Core)

### Option B: Node.js + Express
- **장점**: 프론트엔드(React)와 동일한 언어(TypeScript) 사용 가능, 가볍고 빠른 초기 개발.
- **ORM**: Prisma 또는 Sequelize

## 2. API 엔드포인트 설계 (REST API)

`apiContract.ts` 규격에 맞춰 아래 엔드포인트들을 구현해야 합니다.

### 🔐 인증 및 사용자 (Auth & User)
- `POST /api/auth/login`: 로그인 처리 (JWT 토큰 발급)
- `POST /api/auth/signup`: 신규 팀원 등록 (`SignupParams` 준수)
- `GET /api/user/profile`: 내 정보 조회
- `PATCH /api/user/profile`: 정보 수정 (`UpdateProfileParams` 준수)

### 📊 프로젝트 및 공정 (Project & Process)
- `GET /api/projects`: 프로젝트 목록 (`ProjectRequestParams` 기반 필터링)
- `POST /api/projects`: 신규 프로젝트 생성
- `GET /api/projects/:id`: 상세 정보 및 관련 공정(Process) 조회
- `POST /api/projects/:id/processes`: 특정 프로젝트에 공정 추가
- `PATCH /api/processes/:id/toggle`: 공정 완료 상태 전환

### 📝 할일 및 게시판 (Task & Board)
- `GET /api/tasks`: 할일 목록 (공개 여부 및 작성자 권한 필터링 필수)
- `POST /api/tasks`: 할일 등록
- `GET /api/board`: 게시판 목록 (`BoardRequestParams` 기반 페이징 처리)
- `GET /api/board/:id`: 게시글 상세 및 조회수(views) 1 증가 처리

## 3. 실시간 동기화 구현 전략

프론트엔드의 `SyncService.ts`는 현재 파일 기반 폴링(Polling) 방식을 시뮬레이션하고 있습니다. 이를 실제 서버에서 구현하는 방법은 다음과 같습니다.

### 방식 1: DB 기반 이벤트 폴링 (구현 용이)
- 클라이언트가 `GET /api/sync/updates?since=[timestamp]` 요청을 보냅니다.
- 서버는 `Sync_Logs` 테이블에서 해당 시점 이후에 발생한 변경 건(JSON Payload)을 반환합니다.

### 방식 2: WebSocket / SignalR (실시간성 강조)
- ASP.NET Core 사용 시 **SignalR** 라이브러리를 사용하면 코드 몇 줄로 실시간 채팅 및 브로드캐스팅을 완벽하게 구현할 수 있습니다.

## 4. 보안 가이드라인 (Security)

1. **CORS 설정**: WebView2에서 접속 시 발생하는 크로스 도메인 이슈를 방지하기 위해 서버 설정에서 WebView2 호스트(`thezone.studio` 등)를 허용해야 합니다.
2. **작성자 검증**: `Update`, `Delete` 요청 처리 시 서버 사이드에서 `request.user.id === target.author_id` 인지 반드시 체크하십시오. (프론트엔드 UI만으로는 보안이 불충분합니다.)
3. **비밀번호 저장**: 반드시 `BCrypt` 또는 `Argon2`와 같은 해시 함수를 사용하여 암호화 저장하십시오.

## 5. 데이터베이스 매핑 (Mapping)

`dbSchema.ts`에 정의된 SQL문을 바탕으로 테이블을 생성하십시오.
- **ID 규격**: 사용자 ID는 문자열(varchr), 프로젝트/게시글 등 자동 생성 ID는 `Long` 또는 `UUID` 사용을 권장합니다.
- **이미지 저장**: 프로필 사진이나 첨부 파일은 DB에 직접 넣기보다 서버 내 폴더나 S3에 저장하고, DB에는 그 **경로(Path)**만 저장하십시오.

## 6. 프론트엔드 연동 방법

프론트엔드 코드의 `SyncService.ts` 내부 `STORAGE_URL`을 실제 구축한 서버 주소(예: `http://localhost:5000/api`)로 교체하면 즉시 연동이 시작됩니다.

---
**이 가이드는 시스템의 확장성과 보안을 보장하며, 향후 더죤환경기술(주)의 전사적 시스템 확장을 고려하여 작성되었습니다.**


## 7. components\Filemanagemant.tsk 의 수정..
  
import React, { useState, useMemo, useCallback } from 'react';

interface FileItem {
  id: string;
  name: string;
  type: 'folder' | 'xlsx' | 'pdf' | 'docx' | 'png' | 'zip' | 'json';
  size: string;
  sizeBytes: number;
  updatedAt: string;
  uploader: string;
  status: 'synced' | 'syncing';
}

const FileManagement: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'details' | 'icons'>('details');
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // 스토리지 상태 관리
  const mockFiles: FileItem[] = [
    { id: 'f1', name: '2024년 상반기 수질검사 보고서', type: 'pdf', size: '12.4 MB', sizeBytes: 13002342, updatedAt: '2024-05-15 14:20', uploader: '이영희 과장', status: 'synced' },
    { id: 'f2', name: '영흥도 현장 샘플 데이터 시트', type: 'xlsx', size: '2.1 MB', sizeBytes: 2202342, updatedAt: '2024-06-10 11:45', uploader: '박철수 대리', status: 'syncing' },
    { id: 'f3', name: '정화 시설 평면도_최종', type: 'png', size: '45.8 MB', sizeBytes: 48023422, updatedAt: '2024-07-22 16:10', uploader: '최지민 주임', status: 'synced' },
    { id: 'f4', name: '진단 장비 매뉴얼(K-Tech)', type: 'docx', size: '8.2 MB', sizeBytes: 8602342, updatedAt: '2024-01-05 09:30', uploader: '정성훈 차장', status: 'synced' },
    { id: 'f5', name: '현장 사진 아카이브', type: 'zip', size: '1.2 GB', sizeBytes: 1288490188, updatedAt: '2024-08-14 17:55', uploader: '강혜원 선임', status: 'synced' },
  ];

  const [files, setFiles] = useState<FileItem[]>(mockFiles);

  const totalStorageGB = 500;
  const usedStorageGB = 142.5;
  const storagePercentage = (usedStorageGB / totalStorageGB) * 100;

  const filteredFiles = useMemo(() => {
    return files.filter(f => 
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) && 
      f.name.toLowerCase() !== 'json' && 
      !f.name.toLowerCase().endsWith('.json')
    );
  }, [searchQuery, files]);

  const selectedFile = useMemo(() => {
    return files.find(f => f.id === selectedId) || null;
  }, [selectedId, files]);

  // Drag & Drop Handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    // Explicitly cast the Array.from result to File[] to avoid "property does not exist on type unknown" errors
    const droppedFiles = Array.from(e.dataTransfer.files) as File[];
    if (droppedFiles.length === 0) return;

    droppedFiles.forEach(file => {
      const newFile: FileItem = {
        id: `f-new-${Date.now()}-${Math.random()}`,
        name: file.name,
        type: file.name.split('.').pop() as any || 'pdf',
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        sizeBytes: file.size,
        updatedAt: new Date().toLocaleString(),
        uploader: '나 (본인)',
        status: 'syncing'
      };
      setFiles(prev => [newFile, ...prev]);

      // 시뮬레이션: 3초 후 동기화 완료
      setTimeout(() => {
        setFiles(current => current.map(f => f.id === newFile.id ? { ...f, status: 'synced' } : f));
      }, 3000);
    });
  }, []);

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'folder': return { icon: 'folder', color: 'text-amber-400' };
      case 'xlsx': return { icon: 'table_chart', color: 'text-green-600' };
      case 'pdf': return { icon: 'picture_as_pdf', color: 'text-red-500' };
      case 'png': return { icon: 'image', color: 'text-blue-500' };
      case 'zip': return { icon: 'inventory_2', color: 'text-orange-500' };
      default: return { icon: 'description', color: 'text-slate-400' };
    }
  };

  return (
    <div 
      className={`flex flex-col h-full bg-white overflow-hidden select-none transition-colors duration-300 ${isDragging ? 'bg-blue-50/50 ring-4 ring-blue-400 ring-inset' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      
      {/* Drag Overlay 안내 */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-blue-600 text-white px-8 py-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4 animate-bounce">
            <span className="material-symbols-outlined text-6xl">cloud_upload</span>
            <p className="text-xl font-black">스토리지에 파일 드롭하여 업로드</p>
          </div>
        </div>
      )}

      {/* 1. Command Bar */}
      <div className="h-14 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-1">
          <button className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-200 rounded-lg transition-colors group">
            <span className="material-symbols-outlined text-blue-600">add_box</span>
            <span className="text-[14px] font-bold">새로 만들기</span>
          </button>
          <div className="w-px h-6 bg-slate-300 mx-3"></div>
          <button className="w-9 h-9 flex items-center justify-center hover:bg-slate-200 rounded-lg text-red-500 transition-all active:scale-90">
            <span className="material-symbols-outlined text-[20px]">delete</span>
          </button>
        </div>
        <button onClick={() => setShowInfoPanel(!showInfoPanel)} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[13px] font-bold transition-all ${showInfoPanel ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-slate-200 text-slate-600'}`}>
          <span className="material-symbols-outlined text-[20px]">info</span>미리 보기
        </button>
      </div>

      {/* 2. Navigation & Search Bar */}
      <div className="h-12 border-b border-slate-100 bg-white flex items-center px-4 gap-4 shrink-0">
        <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-lg px-4 py-1.5 gap-3">
          <span className="material-symbols-outlined text-blue-600 text-[20px]">cloud</span>
          <div className="text-[12px] text-slate-600 font-bold overflow-hidden">
            <span className="text-blue-600">내 스토리지</span> > 기술진단 보고서
          </div>
        </div>
        <div className="w-72 relative">
          <input type="text" placeholder="스토리지 내 검색" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-1.5 text-[12px] font-medium outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-400 focus:bg-white transition-all"/>
          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
        </div>
      </div>

      {/* 3. Main Body */}
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-64 border-r border-slate-200 bg-slate-50/30 overflow-y-auto sidebar-dark-scrollbar py-4">
          <ul className="space-y-0.5 px-3">
            <li>
              <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left bg-white shadow-sm ring-1 ring-slate-200 text-blue-600 font-bold">
                <span className="material-symbols-outlined text-[20px]">cloud_queue</span>
                <span className="text-[13px]">내 스토리지</span>
              </button>
            </li>
            {['중요 문서함', '최근 항목', '공유된 항목', '휴지통'].map((label, idx) => (
              <li key={idx}><button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-slate-600 hover:bg-slate-200/50"><span className="material-symbols-outlined text-slate-400 text-[20px]">{idx === 0 ? 'label_important' : idx === 1 ? 'schedule' : idx === 2 ? 'group' : 'delete'}</span><span className="text-[13px]">{label}</span></button></li>
            ))}
          </ul>
        </aside>

        <main className="flex-1 overflow-auto bg-white flex flex-col">
          {viewMode === 'details' ? (
            <table className="w-full text-left border-collapse table-fixed">
              <thead className="sticky top-0 bg-white border-b border-slate-200 z-10 shadow-sm">
                <tr className="bg-slate-50/30">
                  <th className="py-3 px-8 text-[11px] font-black text-slate-500 w-[50%]">파일명</th>
                  <th className="py-3 px-4 text-[11px] font-black text-slate-500 w-24 text-center">상태</th>
                  <th className="py-3 px-6 text-[11px] font-black text-slate-500 w-32 text-center">용량</th>
                  <th className="py-3 px-8 text-[11px] font-black text-slate-500">수정한 날짜</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredFiles.map((file) => {
                  const { icon, color } = getFileIcon(file.type);
                  const isSelected = selectedId === file.id;
                  return (
                    <tr key={file.id} onClick={() => setSelectedId(file.id)} className={`group hover:bg-blue-50/30 transition-all cursor-pointer h-12 border-l-4 ${isSelected ? 'bg-blue-50/60 border-blue-600' : 'border-transparent'}`}>
                      <td className="px-8 truncate"><div className="flex items-center gap-4"><span className={`material-symbols-outlined ${color} text-[24px]`}>{icon}</span><span className={`text-[13px] font-bold ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{file.name}</span></div></td>
                      <td className="text-center"><span className={`material-symbols-outlined text-[18px] ${file.status === 'synced' ? 'text-blue-500' : 'text-amber-500 animate-spin'}`}>{file.status === 'synced' ? 'cloud_done' : 'sync'}</span></td>
                      <td className="text-center px-6"><span className="text-[12px] font-bold text-slate-500">{file.size}</span></td>
                      <td className="px-8 text-[12px] text-slate-400 font-bold">{file.updatedAt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </main>

        {showInfoPanel && (
          <aside className="w-[380px] border-l border-slate-200 bg-slate-50/30 flex flex-col shrink-0 animate-in slide-in-from-right-4">
            {selectedFile ? (
              <div className="flex-1 flex flex-col overflow-y-auto">
                <div className="p-10 flex flex-col items-center text-center">
                   <div className="size-36 bg-white rounded-[40px] flex items-center justify-center mb-8 shadow-xl border border-slate-100">
                      <span className={`material-symbols-outlined text-[88px] ${getFileIcon(selectedFile.type).color}`}>{getFileIcon(selectedFile.type).icon}</span>
                   </div>
                   <h3 className="text-xl font-black text-slate-900 mb-2 px-4 leading-tight">{selectedFile.name}</h3>
                </div>
                <div className="px-8 pb-10 space-y-3">
                   <button className="w-full bg-slate-900 text-white py-4 rounded-2xl text-[14px] font-bold">원격 드라이브에서 열기</button>
                   <button className="w-full border-2 border-slate-200 text-slate-700 py-4 rounded-2xl text-[14px] font-bold hover:bg-white">로컬 PC로 다운로드</button>
                </div>
              </div>
            ) : null}
          </aside>
        )}
      </div>

      <footer className="h-14 border-t border-slate-200 bg-slate-900 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-8">
          <div className="flex flex-col">
            <span className="text-[11px] font-black text-blue-400">{usedStorageGB} GB / {totalStorageGB} GB</span>
            <div className="w-64 h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden"><div className="h-full bg-blue-600 shadow-[0_0_10px_#2563eb]" style={{ width: `${storagePercentage}%` }}/></div>
          </div>
        </div>
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-2 bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700/50">
              <span className="size-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_5px_#22c55e]"></span>
              <span className="text-[10px] font-black text-slate-200 uppercase tracking-tighter">Live Sync Connected</span>
           </div>
        </div>
      </footer>
    </div>
  );
};

export default FileManagement;

dotnet run --project .\backend\DeojonTechStudio.Api

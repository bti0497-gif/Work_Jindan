import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { apiClient } from '../services/apiClient';
import { FileResponse } from '../services/apiContract';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const [files, setFiles] = useState<FileItem[]>([]);

  useEffect(() => {
    const loadFiles = async () => {
      try {
        const result = await apiClient.get<FileResponse[]>('/files');
        setFiles(result.map(file => ({
          id: file.id,
          name: file.name,
          type: (file.fileType || 'pdf') as FileItem['type'],
          size: file.sizeLabel,
          sizeBytes: file.sizeBytes,
          updatedAt: file.updatedAt,
          uploader: file.uploader,
          status: file.status
        })));
      } catch (error) {
        console.error('Failed to load files', error);
      }
    };

    loadFiles();
  }, []);

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
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    droppedFiles.forEach(async file => {
      const tempId = `f-new-${Date.now()}-${Math.random()}`;
      const newFile: FileItem = {
        id: tempId,
        name: file.name,
        type: (file.name.split('.').pop() as FileItem['type']) || 'pdf',
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        sizeBytes: file.size,
        updatedAt: new Date().toLocaleString(),
        uploader: '나 (본인)',
        status: 'syncing'
      };
      setFiles(prev => [newFile, ...prev]);

      try {
        const uploaded = await apiClient.upload<FileResponse>('/files/upload', file);
        setFiles(current => current.map(f => f.id === tempId ? {
          id: uploaded.id,
          name: uploaded.name,
          type: (uploaded.fileType || 'pdf') as FileItem['type'],
          size: uploaded.sizeLabel,
          sizeBytes: uploaded.sizeBytes,
          updatedAt: uploaded.updatedAt,
          uploader: uploaded.uploader,
          status: uploaded.status
        } : f));
      } catch (error) {
        console.error('Upload failed', error);
        setFiles(current => current.filter(f => f.id !== tempId));
      }
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
        <div className="text-[11px] font-bold text-slate-500">파일 관리</div>
      </div>

      {/* 2. Storage Summary */}
      <div className="border-b border-slate-200 bg-white px-4 py-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-bold text-slate-700">
            사용 {usedStorageGB} GB / 총 {totalStorageGB} GB
          </div>
          <div className="text-[11px] font-bold text-slate-500">
            사용률 {storagePercentage.toFixed(1)}%
          </div>
        </div>
        <div className="mt-2 w-full h-2 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600" style={{ width: `${storagePercentage}%` }} />
        </div>
      </div>

      {/* 3. Navigation & Search Bar */}
      <div className="h-12 border-b border-slate-100 bg-white flex items-center px-4 gap-4 shrink-0">
        <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-lg px-4 py-1.5 gap-3">
          <span className="material-symbols-outlined text-blue-600 text-[20px]">cloud</span>
          <div className="text-[12px] text-slate-600 font-bold overflow-hidden">
            <span className="text-blue-600">내 스토리지</span> {'>'} 기술진단 보고서
          </div>
        </div>
        <div className="w-72 relative">
          <input type="text" placeholder="스토리지 내 검색" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-1.5 text-[12px] font-medium outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-400 focus:bg-white transition-all"/>
          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
        </div>
      </div>

      {/* 4. Main Body */}
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

        <main className="flex-1 overflow-hidden bg-white flex flex-col">
          {viewMode === 'details' ? (
            <div className="flex-1 overflow-y-auto sidebar-dark-scrollbar">
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
            </div>
          ) : null}
          <div className="border-t border-slate-200 bg-slate-50/40 px-6 py-4 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[12px] font-black text-slate-700 uppercase tracking-wider">선택한 파일 정보</h3>
              <div className="text-[10px] font-bold text-slate-500">총 {totalStorageGB} GB</div>
            </div>
            {selectedFile ? (
              <div className="flex items-center gap-5">
                <div className="size-14 bg-white rounded-2xl flex items-center justify-center border border-slate-200">
                  <span className={`material-symbols-outlined text-[32px] ${getFileIcon(selectedFile.type).color}`}>{getFileIcon(selectedFile.type).icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-slate-800 truncate">{selectedFile.name}</p>
                  <div className="flex items-center gap-4 mt-1 text-[11px] text-slate-500 font-medium">
                    <span>용량 {selectedFile.size}</span>
                    <span>수정 {selectedFile.updatedAt}</span>
                    <span>작성자 {selectedFile.uploader}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${selectedFile.status === 'synced' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                    {selectedFile.status === 'synced' ? '동기화됨' : '동기화 중'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-slate-400 font-medium">파일을 선택하면 상세 정보가 표시됩니다.</p>
            )}
          </div>
        </main>
      </div>

      <footer className="h-14 border-t border-slate-200 bg-slate-900 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-8">
          <div className="text-[11px] font-black text-blue-400">스토리지 사용률 {storagePercentage.toFixed(1)}%</div>
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

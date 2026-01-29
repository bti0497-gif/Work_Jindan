'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Upload, 
  File, 
  FolderPlus, 
  Download, 
  Trash2, 
  Eye, 
  RefreshCw, 
  Folder,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Home,
  MoreVertical,
  Copy,
  Scissors,
  ClipboardPaste,
  Edit,
  Grid3X3,
  List,
  LayoutGrid,
  Plus
} from 'lucide-react';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime: string;
  isFolder: boolean;
  parentId?: string;
}

interface FileManagerProps {
  // 전역 파일 관리
}

interface ContextMenu {
  x: number;
  y: number;
  file: DriveFile | null;
  visible: boolean;
}

export default function FileManager({}: FileManagerProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [currentPath, setCurrentPath] = useState<{id: string, name: string}[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenu>({
    x: 0,
    y: 0,
    file: null,
    visible: false
  });
  const [draggedFile, setDraggedFile] = useState<DriveFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<'large-icons' | 'small-icons' | 'list' | 'details'>('large-icons');
  const [clipboard, setClipboard] = useState<{files: DriveFile[], operation: 'copy' | 'cut'} | null>(null);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isCreatingNewFolder, setIsCreatingNewFolder] = useState(false);
  // 용량 관리: 500GB 한도
  const MAX_BYTES = 500 * 1024 * 1024 * 1024; // 500 GB
  const totalUsed = files.reduce((acc, f) => acc + (f.size ?? 0), 0);
  const progressPct = Math.min(100, (totalUsed / MAX_BYTES) * 100);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // 파일 목록 조회 (현재 폴더 기준)
  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/files${currentFolderId ? `?parentId=${currentFolderId}` : ''}`);
      if (response.ok) {
        const data = await response.json();
        setFiles(data.files || []);
      } else {
        console.error('파일 목록 조회 실패');
      }
    } catch (error) {
      console.error('파일 목록 조회 오류:', error);
    } finally {
      setLoading(false);
    }
  }, [currentFolderId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // 폴더 진입
  const navigateToFolder = (folder: DriveFile) => {
    if (folder.isFolder) {
      setCurrentFolderId(folder.id);
      setCurrentPath([...currentPath, { id: folder.id, name: folder.name }]);
    }
  };

  // 상위 폴더로 이동
  const navigateUp = () => {
    if (currentPath.length > 0) {
      const newPath = [...currentPath];
      newPath.pop();
      setCurrentPath(newPath);
      
      // 새로운 부모 폴더 ID 설정
      const newParentId = newPath.length > 0 ? newPath[newPath.length - 1].id : null;
      setCurrentFolderId(newParentId);
    }
  };

  // 홈으로 이동
  const navigateHome = () => {
    setCurrentPath([]);
    setCurrentFolderId(null);
  };

  // 특정 경로로 이동
  const navigateToPath = (targetIndex: number) => {
    const newPath = currentPath.slice(0, targetIndex + 1);
    setCurrentPath(newPath);
    const newParentId = newPath.length > 0 ? newPath[newPath.length - 1].id : null;
    setCurrentFolderId(newParentId);
  };

  // 파일 업로드 (드래그앤드롭 지원)
  const handleFileUpload = async (files: FileList) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    const uploadPromises = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);
      if (currentFolderId) {
        formData.append('parentId', currentFolderId);
      }

      uploadPromises.push(
        fetch('/api/files/upload', {
          method: 'POST',
          body: formData,
        })
      );
    }

    try {
      const responses = await Promise.all(uploadPromises);
      let successCount = 0;
      let errorCount = 0;

      for (const response of responses) {
        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
          const errorData = await response.json();
          console.error('파일 업로드 실패:', errorData);
        }
      }

      if (successCount > 0) {
        await fetchFiles();
      }

      if (errorCount > 0) {
        alert(`${errorCount}개 파일 업로드에 실패했습니다.`);
      }
    } catch (error) {
      console.error('파일 업로드 오류:', error);
      alert('파일 업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  // 파일 선택 핸들러
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileUpload(e.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 윈도우 스타일 새 폴더 생성
  const createNewFolderInline = async () => {
    const newFolderName = '새 폴더';
    
    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          name: newFolderName,
          parentId: currentFolderId
        }),
      });

      if (response.ok) {
        const result = await response.json();
        await fetchFiles();
        
        // 새로 생성된 폴더를 편집 모드로 설정
        setEditingFile(result.folder.id);
        setEditingName(newFolderName);
        setIsCreatingNewFolder(false);
      } else {
        const errorData = await response.json();
        alert(errorData.error || '폴더 생성에 실패했습니다.');
      }
    } catch (error) {
      console.error('폴더 생성 오류:', error);
      alert('폴더 생성 중 오류가 발생했습니다.');
    }
  };

  // 파일/폴더 이름 변경
  const handleRename = async (fileId: string, newName: string) => {
    if (!newName.trim()) return;
    
    try {
      const response = await fetch('/api/files', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          fileId: fileId,
          name: newName.trim()
        }),
      });

      if (response.ok) {
        setEditingFile(null);
        setEditingName('');
        await fetchFiles();
      } else {
        const errorData = await response.json();
        alert(errorData.error || '이름 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('이름 변경 오류:', error);
      alert('이름 변경 중 오류가 발생했습니다.');
    }
  };

  // 편집 취소
  const cancelEdit = () => {
    setEditingFile(null);
    setEditingName('');
  };

  // 인라인 편집 처리 (Enter/Esc 키)
  const handleKeyDown = (e: React.KeyboardEvent, fileId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRename(fileId, editingName);
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  // 뷰 모드별 파일 렌더링
  const renderFiles = () => {
    switch (viewMode) {
      case 'large-icons':
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {files.map((file) => renderFileItem(file, 'large'))}
          </div>
        );
      case 'small-icons':
        return (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {files.map((file) => renderFileItem(file, 'small'))}
          </div>
        );
      case 'list':
        return (
          <div className="space-y-1">
            {files.map((file) => renderFileItem(file, 'list'))}
          </div>
        );
      case 'details':
        return (
          <div className="bg-white border rounded">
            <div className="grid grid-cols-12 gap-2 p-3 border-b bg-gray-50 text-sm font-medium text-gray-700">
              <div className="col-span-6">이름</div>
              <div className="col-span-2">크기</div>
              <div className="col-span-2">종류</div>
              <div className="col-span-2">수정한 날짜</div>
            </div>
            <div className="divide-y">
              {files.map((file) => renderFileItem(file, 'details'))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // 개별 파일 아이템 렌더링
  const renderFileItem = (file: DriveFile, style: 'large' | 'small' | 'list' | 'details') => {
    const isEditing = editingFile === file.id;

    if (style === 'large') {
      return (
        <div
          key={file.id}
          className={`relative bg-white border-2 rounded-lg p-4 transition-all cursor-pointer text-center min-h-[120px]
            ${selectedFiles.has(file.id) 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-transparent hover:border-gray-300 hover:shadow-md'
            }`}
          onClick={(e) => handleFileClick(e, file)}
          onContextMenu={(e) => handleContextMenu(e, file)}
          onDoubleClick={() => handleFileDoubleClick(file)}
        >
          <div className="flex justify-center mb-3">
            {getFileIcon(file.mimeType, file.isFolder, 'w-12 h-12')}
          </div>
          {isEditing ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, file.id)}
              onBlur={() => handleRename(file.id, editingName)}
              className="w-full text-sm text-center border border-blue-500 rounded px-1 py-0.5"
              autoFocus
            />
          ) : (
            <h3 className="font-medium text-gray-900 text-sm break-words leading-tight px-1" title={file.name}>
              {file.name}
            </h3>
          )}
          <div className="text-xs text-gray-500 mt-1">
            {file.size && !file.isFolder && (
              <p>{formatFileSize(file.size)}</p>
            )}
          </div>
        </div>
      );
    }

    if (style === 'small') {
      return (
        <div
          key={file.id}
          className={`relative p-2 transition-all cursor-pointer text-center rounded min-h-[80px]
            ${selectedFiles.has(file.id) 
              ? 'bg-blue-100 border border-blue-300' 
              : 'hover:bg-gray-100'
            }`}
          onClick={(e) => handleFileClick(e, file)}
          onContextMenu={(e) => handleContextMenu(e, file)}
          onDoubleClick={() => handleFileDoubleClick(file)}
        >
          <div className="flex justify-center mb-1">
            {getFileIcon(file.mimeType, file.isFolder, 'w-8 h-8')}
          </div>
          {isEditing ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, file.id)}
              onBlur={() => handleRename(file.id, editingName)}
              className="w-full text-xs text-center border border-blue-500 rounded px-1"
              autoFocus
            />
          ) : (
            <p className="text-xs break-words leading-tight px-1" title={file.name}>
              {file.name}
            </p>
          )}
        </div>
      );
    }

    if (style === 'list') {
      return (
        <div
          key={file.id}
          className={`flex items-center p-2 transition-all cursor-pointer rounded
            ${selectedFiles.has(file.id) 
              ? 'bg-blue-100 border border-blue-300' 
              : 'hover:bg-gray-100'
            }`}
          onClick={(e) => handleFileClick(e, file)}
          onContextMenu={(e) => handleContextMenu(e, file)}
          onDoubleClick={() => handleFileDoubleClick(file)}
        >
          <div className="flex-shrink-0 mr-3">
            {getFileIcon(file.mimeType, file.isFolder, 'w-6 h-6')}
          </div>
          {isEditing ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, file.id)}
              onBlur={() => handleRename(file.id, editingName)}
              className="flex-1 text-sm border border-blue-500 rounded px-2 py-1"
              autoFocus
            />
          ) : (
            <span className="text-sm truncate" title={file.name}>
              {file.name}
            </span>
          )}
        </div>
      );
    }

    if (style === 'details') {
      return (
        <div
          key={file.id}
          className={`grid grid-cols-12 gap-2 p-3 transition-all cursor-pointer text-sm
            ${selectedFiles.has(file.id) 
              ? 'bg-blue-50 border-l-4 border-blue-500' 
              : 'hover:bg-gray-50'
            }`}
          onClick={(e) => handleFileClick(e, file)}
          onContextMenu={(e) => handleContextMenu(e, file)}
          onDoubleClick={() => handleFileDoubleClick(file)}
        >
          <div className="col-span-6 flex items-center">
            <div className="flex-shrink-0 mr-3">
              {getFileIcon(file.mimeType, file.isFolder, 'w-5 h-5')}
            </div>
            {isEditing ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, file.id)}
                onBlur={() => handleRename(file.id, editingName)}
                className="flex-1 text-sm border border-blue-500 rounded px-2 py-1"
                autoFocus
              />
            ) : (
              <span className="truncate" title={file.name}>
                {file.name}
              </span>
            )}
          </div>
          <div className="col-span-2 text-gray-600">
            {file.size && !file.isFolder ? formatFileSize(file.size) : '-'}
          </div>
          <div className="col-span-2 text-gray-600">
            {file.isFolder ? '폴더' : getFileType(file.mimeType)}
          </div>
          <div className="col-span-2 text-gray-600">
            {new Date(file.modifiedTime).toLocaleDateString('ko-KR')}
          </div>
        </div>
      );
    }

    return null;
  };

  // 파일 클릭 핸들러
  const handleFileClick = (e: React.MouseEvent, file: DriveFile) => {
    e.stopPropagation();
    if (file.isFolder) {
      navigateToFolder(file);
    } else {
      handleFileSelect(file.id, e.ctrlKey || e.metaKey);
    }
  };

  // 파일 더블클릭 핸들러
  const handleFileDoubleClick = (file: DriveFile) => {
    if (file.isFolder) {
      navigateToFolder(file);
    } else {
      handleDownloadFile(file.id, file.name);
    }
  };

  // 파일 타입 반환
  const getFileType = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '이미지';
    if (mimeType.startsWith('video/')) return '비디오';
    if (mimeType.startsWith('audio/')) return '오디오';
    if (mimeType.includes('pdf')) return 'PDF';
    if (mimeType.includes('word')) return 'Word 문서';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'Excel 파일';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'PowerPoint';
    if (mimeType.includes('text')) return '텍스트 파일';
    return '파일';
  };

  // 파일 삭제
  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('정말로 이 파일을 삭제하시겠습니까?')) return;

    try {
      const response = await fetch('/api/files', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId }),
      });

      if (response.ok) {
        await fetchFiles();
      } else {
        const errorData = await response.json();
        alert(errorData.error || '파일 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('파일 삭제 오류:', error);
      alert('파일 삭제 중 오류가 발생했습니다.');
    }
  };

  // 파일 다운로드
  const handleDownloadFile = async (fileId: string, fileName: string) => {
    try {
      const response = await fetch(`/api/files/${fileId}/download?name=${encodeURIComponent(fileName)}`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('파일 다운로드에 실패했습니다.');
      }
    } catch (error) {
      console.error('파일 다운로드 오류:', error);
      alert('파일 다운로드 중 오류가 발생했습니다.');
    }
  };

  // 드래그앤드롭 핸들러
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    // 드롭존을 완전히 벗어났을 때만 false로 설정
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      handleFileUpload(droppedFiles);
    }
  };

  // 파일 선택
  const handleFileSelect = (fileId: string, isMultiSelect: boolean = false) => {
    if (isMultiSelect) {
      const newSelected = new Set(selectedFiles);
      if (newSelected.has(fileId)) {
        newSelected.delete(fileId);
      } else {
        newSelected.add(fileId);
      }
      setSelectedFiles(newSelected);
    } else {
      setSelectedFiles(new Set([fileId]));
    }
  };

  // 우클릭 메뉴
  const handleContextMenu = (e: React.MouseEvent, file: DriveFile) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      file,
      visible: true
    });
  };

  // 빈 공간 클릭 시 메뉴 닫기
  const handleClickOutside = () => {
    setContextMenu(prev => ({ ...prev, visible: false }));
    setSelectedFiles(new Set());
  };

  // 파일 아이콘 결정
  const getFileIcon = (mimeType: string, isFolder: boolean, size = 'h-8 w-8') => {
    if (isFolder) {
      return <Folder className={`${size} text-blue-500`} />;
    }
    
    if (mimeType.startsWith('image/')) {
      return <File className={`${size} text-green-500`} />;
    } else if (mimeType.includes('document') || mimeType.includes('text')) {
      return <File className={`${size} text-blue-500`} />;
    } else if (mimeType.includes('spreadsheet')) {
      return <File className={`${size} text-green-500`} />;
    } else if (mimeType.includes('pdf')) {
      return <File className={`${size} text-red-500`} />;
    } else if (mimeType.includes('video')) {
      return <File className={`${size} text-purple-500`} />;
    } else if (mimeType.includes('audio')) {
      return <File className={`${size} text-yellow-500`} />;
    }
    
    return <File className={`${size} text-gray-500`} />;
  };

  // 파일 크기 포맷
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const size = bytes;
    if size === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(size) / Math.log(k));
    return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="h-screen flex flex-col bg-white" onClick={handleClickOutside}>
      {/* 경로 표시 (Breadcrumb) */}
      <div className="flex items-center px-4 py-2 bg-gray-100 border-b text-sm flex-shrink-0">
        <button 
          onClick={navigateHome}
          className="hover:text-blue-600 font-medium"
        >
          홈
        </button>
        {currentPath.map((pathItem, index) => (
          <div key={pathItem.id} className="flex items-center">
            <ChevronRight className="h-4 w-4 mx-1 text-gray-400" />
            <button 
              onClick={() => navigateToPath(index)}
              className="hover:text-blue-600"
            >
              {pathItem.name}
            </button>
          </div>
        ))}
      </div>

      {/* 윈도우 스타일 헤더 */}
      <div className="bg-gray-50 border-b border-gray-200 p-3 flex justify-between items-center flex-shrink-0">
        <div className="flex items-center space-x-3">
          {/* 뷰 모드 변경 */}
          <div className="flex items-center space-x-1 border border-gray-300 rounded">
            <button
              onClick={() => setViewMode('large-icons')}
              className={`p-2 ${viewMode === 'large-icons' ? 'bg-blue-100 border-blue-300' : 'hover:bg-gray-100'} border-r border-gray-300`}
              title="큰 아이콘"
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('small-icons')}
              className={`p-2 ${viewMode === 'small-icons' ? 'bg-blue-100 border-blue-300' : 'hover:bg-gray-100'} border-r border-gray-300`}
              title="작은 아이콘"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-blue-100 border-blue-300' : 'hover:bg-gray-100'} border-r border-gray-300`}
              title="목록"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('details')}
              className={`p-2 ${viewMode === 'details' ? 'bg-blue-100 border-blue-300' : 'hover:bg-gray-100'}`}
              title="자세히"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          
          {/* 상위 폴더 버튼 */}
          <button
            onClick={navigateUp}
            disabled={currentPath.length === 0}
            className="p-2 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title="상위 폴더"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>

        {/* 우측 버튼들 */}
        <div className="flex items-center space-x-2">
          {/* 새 폴더 버튼 */}
          <button
            onClick={createNewFolderInline}
            className="flex items-center space-x-2 px-3 py-2 bg-white border border-gray-300 rounded hover:bg-gray-50"
            disabled={isCreatingNewFolder}
          >
            <Plus className="w-4 h-4" />
            <span>새 폴더</span>
          </button>
          
          {/* 새로고침 버튼 */}
          <button
            onClick={fetchFiles}
            disabled={loading}
            className="p-2 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          {/* 파일 업로드 버튼 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded"
          >
            <Upload className="w-4 h-4" />
            <span>{uploading ? '업로드 중...' : '파일 업로드'}</span>
          </button>
          
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileInputChange}
            className="hidden"
            multiple
          />
        </div>
      </div>

      {/* 파일 용량 한도 모니터링 바(500GB) */}
      <div className="px-4 py-2 bg-white border-t border-gray-200">
        <div className="text-sm text-gray-700 mb-1">전체 파일 용량 한도: 500 GB</div>
        <div className="w-full bg-gray-200 rounded h-3 overflow-hidden">
          <div
            className={`h-3 ${progressPct < 100 ? 'bg-blue-600' : 'bg-red-600'}`}
            style={{ width: `${progressPct}%` }}
          ></div>
        </div>
        <div className="text-xs text-gray-500 mt-1">사용 중: {formatFileSize(totalUsed)} / 500 GB</div>
        {totalUsed > MAX_BYTES && (
          <div className="text-xs text-red-600 mt-1">경고: 용량 한도를 초과했습니다. 정리 필요.</div>
        )}
      </div>
      {/* 메인 파일 영역 - 드래그앤드롭 지원 */}
      <div 
        ref={dropZoneRef}
        className={`flex-1 overflow-x-auto overflow-y-auto p-4 transition-colors min-h-0 relative ${
          isDragging ? 'bg-blue-50 border-blue-300' : ''
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{ 
          maxHeight: 'calc(100vh - 140px)', // 헤더와 브레드크럼 높이를 제외
          scrollbarWidth: 'thin',
          scrollbarColor: '#cbd5e1 #f1f5f9'
        }}
      >
        {/* 드래그 오버레이 */}
        {isDragging && files.length > 0 && (
          <div className="absolute inset-0 bg-blue-50/80 border-2 border-dashed border-blue-400 rounded-lg flex items-center justify-center z-10">
            <div className="text-center text-blue-600">
              <Upload className="w-16 h-16 mx-auto mb-4" />
              <p className="text-xl font-medium">파일을 여기에 드롭하세요</p>
              <p className="text-sm mt-2">현재 폴더에 업로드됩니다</p>
            </div>
          </div>
        )}
        {loading ? (
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">파일 목록을 불러오는 중...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[400px] text-gray-500">
            {isDragging ? (
              <div className="text-blue-600 text-center">
                <Upload className="w-20 h-20 mx-auto mb-4" />
                <p className="text-xl font-medium">파일을 여기에 드롭하세요</p>
                <p className="text-sm mt-2">여러 파일을 한 번에 업로드할 수 있습니다</p>
              </div>
            ) : (
              <div className="text-center">
                <Folder className="w-20 h-20 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium">폴더가 비어있습니다</p>
                <p className="text-sm mt-2">파일을 드래그하여 업로드하거나 새 폴더를 만들어보세요</p>
                <div className="mt-4 p-4 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
                  <p className="text-xs text-gray-500">💡 팁: 파일을 이 영역에 드래그하면 바로 업로드됩니다</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          renderFiles()
        )}
      </div>

      {/* 우클릭 컨텍스트 메뉴 */}
      {contextMenu.visible && (
        <div 
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-50"
          style={{ 
            left: contextMenu.x, 
            top: contextMenu.y,
            minWidth: '160px'
          }}
        >
          {contextMenu.file && (
            <>
              {!contextMenu.file.isFolder && (
                <button
                  onClick={() => {
                    handleDownloadFile(contextMenu.file!.id, contextMenu.file!.name);
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2"
                >
                  <Download className="h-4 w-4" />
                  <span>다운로드</span>
                </button>
              )}
              
              <button
                onClick={() => {
                  setEditingFile(contextMenu.file!.id);
                  setEditingName(contextMenu.file!.name);
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2"
              >
                <Edit className="h-4 w-4" />
                <span>이름 바꾸기</span>
              </button>
              
              <button
                onClick={() => {
                  // TODO: 복사 기능 구현
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2"
              >
                <Copy className="h-4 w-4" />
                <span>복사</span>
              </button>
              
              <button
                onClick={() => {
                  // TODO: 잘라내기 기능 구현
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2"
              >
                <Scissors className="h-4 w-4" />
                <span>잘라내기</span>
              </button>
              
              <hr className="my-1" />
              
              <button
                onClick={() => {
                  // TODO: 이름 변경 기능 구현
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2"
              >
                <Edit className="h-4 w-4" />
                <span>이름 변경</span>
              </button>
              
              <button
                onClick={() => {
                  handleDeleteFile(contextMenu.file!.id);
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 flex items-center space-x-2"
              >
                <Trash2 className="h-4 w-4" />
                <span>삭제</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

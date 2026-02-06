import React, { useState, useEffect, useRef } from 'react';
import {
    Folder,
    File,
    Search,
    Upload,
    ChevronRight,
    Info,
    HardDrive,
    Clock,
    User,
    ExternalLink,
    RefreshCw,
    AlertCircle,
    FilePlus,
    LayoutGrid,
    List as ListIcon,
    SortAsc,
    Trash2,
    Download as DownloadIcon,
    Plus,
    MoreVertical,
    CheckCircle2,
    Edit2
} from 'lucide-react';
import {
    getFiles,
    uploadFile,
    createFolder,
    deleteFile,
    downloadFile,
    moveFile,
    renameFile,
    formatFileSize
} from '../services/driveService';

const FileManager = () => {
    // 상태 관리
    const [files, setFiles] = useState([]);
    const [selectedFiles, setSelectedFiles] = useState([]); // 다중 선택 지원
    const [lastSelectedIndex, setLastSelectedIndex] = useState(-1);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    // 네비게이션 상태
    const [currentFolderId, setCurrentFolderId] = useState(import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID);
    const [folderStack, setFolderStack] = useState([{ id: import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID, name: 'Root' }]);

    const fileInputRef = useRef(null);
    const scrollContentRef = useRef(null);
    const dragCounter = useRef(0);

    // 마키(영역 선택) 상태
    const [selectionBox, setSelectionBox] = useState({ active: false, startX: 0, startY: 0, x: 0, y: 0, width: 0, height: 0 });
    const selectionRef = useRef({ isDragging: false });

    // 데이터 로드
    const fetchDriveFiles = async (folderId = currentFolderId) => {
        try {
            setLoading(true);
            setError(null);
            const driveFiles = await getFiles(folderId);
            // 시스템 폴더(.system, Resources) 필터링 (사용자 공유 공간과 분리)
            const filteredFiles = driveFiles.filter(item =>
                !item.name.startsWith('.system') &&
                item.name !== 'Resources'
            );
            setFiles(filteredFiles);
        } catch (err) {
            console.error('Error in FileManager:', err);
            setError(`데이터 로드 실패: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDriveFiles(); }, [currentFolderId]);

    // --- 기능 함수들 ---

    // 폴더 진입 (더블 클릭)
    const handleItemDoubleClick = (item) => {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
            const newStack = [...folderStack, { id: item.id, name: item.name }];
            setFolderStack(newStack);
            setCurrentFolderId(item.id);
            setSelectedFiles([]);
            setLastSelectedIndex(-1);
        }
    };

    // 브레드크럼 이동
    const navigateToFolder = (folderId, index) => {
        const newStack = folderStack.slice(0, index + 1);
        setFolderStack(newStack);
        setCurrentFolderId(folderId);
        setSelectedFiles([]);
        setLastSelectedIndex(-1);
    };

    // 새 폴더 만들기
    const handleCreateFolder = async () => {
        const folderName = prompt('새 폴더 이름을 입력하세요:', '새 폴더');
        if (!folderName) return;
        try {
            setLoading(true);
            await createFolder(folderName, currentFolderId);
            await fetchDriveFiles();
        } catch (err) { alert(`폴더 생성 실패: ${err.message}`); }
        finally { setLoading(false); }
    };

    // 삭제
    const handleDelete = async () => {
        if (selectedFiles.length === 0) return alert('삭제할 파일을 선택하세요.');
        const count = selectedFiles.length;
        if (!confirm(`${count === 1 ? `'${selectedFiles[0].name}'` : `${count}개의 항목`}을 삭제하시겠습니까?`)) return;

        try {
            setLoading(true);
            for (const file of selectedFiles) {
                await deleteFile(file.id);
            }
            setSelectedFiles([]);
            setLastSelectedIndex(-1);
            await fetchDriveFiles();
        } catch (err) { alert(`삭제 실패: ${err.message}`); }
        finally { setLoading(false); }
    };

    // 이름 바꾸기 (단일 선택 시에만 활성화)
    const handleRename = async () => {
        if (selectedFiles.length !== 1) return alert('이름을 변경할 파일 하나를 선택하세요.');
        const file = selectedFiles[0];
        const newName = prompt('새로운 이름을 입력하세요:', file.name);
        if (!newName || newName === file.name) return;
        try {
            setLoading(true);
            await renameFile(file.id, newName);
            await fetchDriveFiles();
            setSelectedFiles([]);
        } catch (err) { alert(`이름 변경 실패: ${err.message}`); }
        finally { setLoading(false); }
    };

    // 다운로드
    const handleDownload = async () => {
        if (selectedFiles.length === 0) return alert('다운로드할 파일을 선택하세요.');
        if (selectedFiles.length > 1) {
            if (!confirm(`${selectedFiles.length}개의 파일을 순차적으로 다운로드합니다. 계속하시겠습니까?`)) return;
        }
        for (const file of selectedFiles) {
            await downloadFile(file.id, file.name);
            // 약간의 지연을 주어 브라우저 차단 방지 시도
            await new Promise(r => setTimeout(r, 500));
        }
    };

    // 정렬 (간단히 이름순)
    const handleSort = () => {
        const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
        setFiles(sorted);
    };

    // 아이템 클릭 처리 (Shift/Ctrl 지원)
    const handleItemClick = (e, index) => {
        e.stopPropagation();
        const clickedFile = files[index];

        if (e.ctrlKey || e.metaKey) {
            setSelectedFiles(prev => {
                const isSelected = prev.some(f => f.id === clickedFile.id);
                if (isSelected) return prev.filter(f => f.id !== clickedFile.id);
                return [...prev, clickedFile];
            });
        } else if (e.shiftKey && lastSelectedIndex !== -1) {
            const start = Math.min(lastSelectedIndex, index);
            const end = Math.max(lastSelectedIndex, index);
            const rangeSelection = files.slice(start, end + 1);
            setSelectedFiles(rangeSelection);
        } else {
            setSelectedFiles([clickedFile]);
        }
        setLastSelectedIndex(index);
    };

    // --- 마키 선택 (Marquee) 핸들러 ---
    const handleMouseDown = (e) => {
        // 이미 파일을 클릭한 경우는 무시 (버블링 방지 위해 e.target 체크 권장되나 여기선 컨테이너 클릭 전용)
        if (e.button !== 0) return; // 좌클릭만
        if (e.target.closest('.file-item')) return;

        const rect = scrollContentRef.current.getBoundingClientRect();
        const startX = e.clientX - rect.left + scrollContentRef.current.scrollLeft;
        const startY = e.clientY - rect.top + scrollContentRef.current.scrollTop;

        selectionRef.current = {
            isDragging: true,
            startX,
            startY,
            clientX: e.clientX,
            clientY: e.clientY
        };

        setSelectionBox({
            active: true,
            startX,
            startY,
            x: startX,
            y: startY,
            width: 0,
            height: 0
        });

        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
            setSelectedFiles([]);
        }
    };

    const handleMouseMove = (e) => {
        if (!selectionRef.current.isDragging) return;

        const rect = scrollContentRef.current.getBoundingClientRect();
        const currentX = e.clientX - rect.left + scrollContentRef.current.scrollLeft;
        const currentY = e.clientY - rect.top + scrollContentRef.current.scrollTop;

        const { startX, startY } = selectionRef.current;
        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(startX - currentX);
        const height = Math.abs(startY - currentY);

        setSelectionBox(prev => ({ ...prev, x: left, y: top, width, height }));

        // 오버랩 체크 (간소화된 로직)
        const items = scrollContentRef.current.querySelectorAll('.file-item');
        const newSelected = [];

        items.forEach((item, idx) => {
            const itemRect = {
                left: item.offsetLeft,
                top: item.offsetTop,
                right: item.offsetLeft + item.offsetWidth,
                bottom: item.offsetTop + item.offsetHeight
            };

            const boxRect = {
                left,
                top,
                right: left + width,
                bottom: top + height
            };

            const isOverlap = !(
                itemRect.right < boxRect.left ||
                itemRect.left > boxRect.right ||
                itemRect.bottom < boxRect.top ||
                itemRect.top > boxRect.bottom
            );

            if (isOverlap) {
                newSelected.push(files[idx]);
            }
        });

        if (newSelected.length > 0 || (e.ctrlKey || e.metaKey || e.shiftKey)) {
            setSelectedFiles(prev => {
                // Ctrl 누른 경우 기존 선택 유지하며 합치기
                if (e.ctrlKey || e.metaKey) {
                    const combined = [...prev];
                    newSelected.forEach(ns => {
                        if (!combined.some(c => c.id === ns.id)) combined.push(ns);
                    });
                    return combined;
                }
                return newSelected;
            });
        } else {
            setSelectedFiles([]);
        }
    };

    const handleMouseUp = () => {
        selectionRef.current.isDragging = false;
        setSelectionBox(prev => ({ ...prev, active: false }));
    };

    useEffect(() => {
        if (selectionBox.active) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [selectionBox.active]);

    // 이름 중복 체크 및 순번 부여 함수
    const getUniqueName = (name) => {
        let uniqueName = name;
        let counter = 1;

        // 확장자 분리 (예: manual.pdf -> manual, .pdf)
        const lastDotIndex = name.lastIndexOf('.');
        let baseName = name;
        let ext = '';

        if (lastDotIndex !== -1 && lastDotIndex > 0) {
            baseName = name.substring(0, lastDotIndex);
            ext = name.substring(lastDotIndex);
        }

        while (files.some(f => f.name === uniqueName)) {
            uniqueName = `${baseName} (${counter})${ext}`;
            counter++;
        }
        return uniqueName;
    };

    // 업로드 처리 (멀티 파일 지원)
    const processUpload = async (fileList) => {
        if (!fileList || fileList.length === 0) return;

        const filesArray = Array.from(fileList);
        setUploading(true);

        try {
            for (const file of filesArray) {
                let uploadName = file.name;

                // 중복 체크
                if (files.some(f => f.name === file.name)) {
                    if (confirm(`'${file.name}' 파일이 이미 존재합니다.\n이름을 변경하여 업로드하시겠습니까?`)) {
                        uploadName = getUniqueName(file.name);
                    } else {
                        console.log(`Upload skipped for: ${file.name}`);
                        continue; // 건너뛰기
                    }
                }

                await uploadFile(file, currentFolderId, uploadName);
            }
            await fetchDriveFiles();
        } catch (err) {
            alert(`업로드 실패: ${err.message}`);
        } finally {
            setUploading(false);
        }
    };

    // --- 드래그 앤 드롭 (외부 업로드) ---
    const handleDragEnter = (e) => {
        e.preventDefault();
        dragCounter.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDraggingOver(true);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        if (!isDraggingOver) setIsDraggingOver(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDraggingOver(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        dragCounter.current = 0;
        setIsDraggingOver(false);
        const droppedFiles = e.dataTransfer.files;
        if (droppedFiles.length > 0) {
            processUpload(droppedFiles);
        }
    };

    // --- 내부 드래그 앤 드롭 ---
    const handleInternalDragStart = (e, file) => {
        e.dataTransfer.setData('fileId', file.id);
        e.dataTransfer.setData('fileName', file.name);

        // 외부로 드래그하여 다운로드 (Chrome/Edge 지원 프로토콜)
        if (file.mimeType !== 'application/vnd.google-apps.folder' && file.webContentLink) {
            const downloadData = `${file.mimeType}:${file.name}:${file.webContentLink}`;
            e.dataTransfer.setData('DownloadURL', downloadData);
        }
    };

    const handleInternalDrop = async (e, targetFile) => {
        e.preventDefault();
        const draggedFileId = e.dataTransfer.getData('fileId');
        if (!draggedFileId || draggedFileId === targetFile.id) return;

        if (targetFile.mimeType === 'application/vnd.google-apps.folder') {
            if (confirm(`'${draggedFileId}' 파일을 '${targetFile.name}' 폴더로 이동하시겠습니까?`)) {
                try {
                    setLoading(true);
                    await moveFile(draggedFileId, currentFolderId, targetFile.id);
                    await fetchDriveFiles();
                } catch (err) { alert(`이동 실패: ${err.message}`); }
                finally { setLoading(false); }
            }
        } else {
            const newFiles = [...files];
            const draggedIndex = newFiles.findIndex(f => f.id === draggedFileId);
            const targetIndex = newFiles.findIndex(f => f.id === targetFile.id);
            const [removed] = newFiles.splice(draggedIndex, 1);
            newFiles.splice(targetIndex, 0, removed);
            setFiles(newFiles);
        }
    };

    return (
        <div className="file-manager-wrapper">
            <div
                className={`file-manager-container ${isDraggingOver ? 'drag-active' : ''}`}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {/* 상단 헤더 및 툴바 */}
                <div className="explorer-header">
                    <div className="title-area">
                        <div className="path-display">
                            <HardDrive size={16} />
                            {folderStack.map((folder, idx) => (
                                <React.Fragment key={folder.id}>
                                    <span
                                        className={`path-item ${idx === folderStack.length - 1 ? 'bold' : 'link'}`}
                                        onClick={() => idx < folderStack.length - 1 && navigateToFolder(folder.id, idx)}
                                    >
                                        {folder.name === 'Root' ? 'Drive' : folder.name}
                                    </span>
                                    {idx < folderStack.length - 1 && <ChevronRight size={14} />}
                                </React.Fragment>
                            ))}
                        </div>
                        <div className="header-actions">
                            <div className="search-bar">
                                <Search size={14} />
                                <input type="text" placeholder="파일 검색..." />
                            </div>
                            <button className="icon-btn refresh" onClick={() => fetchDriveFiles()}>
                                <RefreshCw size={16} className={loading ? 'spin' : ''} />
                            </button>
                        </div>
                    </div>

                    <div className="main-toolbar">
                        <div className="button-group">
                            <button className="tool-btn" onClick={handleCreateFolder}>
                                <Plus size={16} color="#10b981" />
                                <span>새폴더</span>
                            </button>
                            <div className="divider"></div>
                            <button className="tool-btn" onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}>
                                {viewMode === 'list' ? <LayoutGrid size={16} /> : <ListIcon size={16} />}
                                <span>보기</span>
                            </button>
                            <button className="tool-btn" onClick={handleSort}>
                                <SortAsc size={16} />
                                <span>정렬</span>
                            </button>
                            <div className="divider"></div>
                            <button className="tool-btn" onClick={handleRename} disabled={selectedFiles.length !== 1}>
                                <Edit2 size={16} />
                                <span>이름바꾸기</span>
                            </button>
                            <button className="tool-btn danger" onClick={handleDelete} disabled={selectedFiles.length === 0}>
                                <Trash2 size={16} />
                                <span>삭제</span>
                            </button>
                            <button className="tool-btn primary" onClick={handleDownload} disabled={selectedFiles.length === 0}>
                                <DownloadIcon size={16} />
                                <span>다운로드</span>
                            </button>
                        </div>

                        <div className="upload-zone">
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                multiple // 다중 선택 지원
                                onChange={(e) => processUpload(e.target.files)}
                            />
                            <button className="main-upload-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                                {uploading ? <RefreshCw size={14} className="spin" /> : <Upload size={14} />}
                                <span>{uploading ? '업로드 중..' : '파일 올리기'}</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* 파일 리스트 영역 (500px) */}
                <div className={`explorer-body ${viewMode}-view`}>
                    {loading && !uploading ? (
                        <div className="center-msg">
                            <RefreshCw size={40} className="spin color-primary" />
                            <p>동기화 중...</p>
                        </div>
                    ) : error ? (
                        <div className="center-msg error">
                            <AlertCircle size={40} />
                            <p>{error}</p>
                            <button className="retry-btn" onClick={() => fetchDriveFiles()}>다시 시도</button>
                        </div>
                    ) : files.length === 0 ? (
                        <div className="center-msg empty">
                            <Folder size={48} strokeWidth={1} />
                            <p>이 폴더는 비어있습니다.</p>
                            <span>파일을 여기로 드래그하여 업로드하세요.</span>
                            {folderStack.length > 1 && (
                                <button className="back-btn" onClick={() => navigateToFolder(folderStack[folderStack.length - 2].id, folderStack.length - 2)}>
                                    상위 폴더로 복귀
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="file-grid-container">
                            {viewMode === 'list' && (
                                <div className="list-header">
                                    <div className="col-check"></div>
                                    <div className="col-name-h">이름</div>
                                    <div className="col-size-h">크기</div>
                                    <div className="col-date-h">수정일</div>
                                </div>
                            )}
                            <div
                                className="scroll-content"
                                ref={scrollContentRef}
                                onMouseDown={handleMouseDown}
                            >
                                {selectionBox.active && (
                                    <div
                                        className="selection-box"
                                        style={{
                                            left: selectionBox.x,
                                            top: selectionBox.y,
                                            width: selectionBox.width,
                                            height: selectionBox.height
                                        }}
                                    />
                                )}
                                {files.map((file, index) => (
                                    <div
                                        key={file.id}
                                        className={`file-item ${selectedFiles.some(f => f.id === file.id) ? 'selected' : ''} ${file.mimeType === 'application/vnd.google-apps.folder' ? 'is-folder' : ''}`}
                                        onClick={(e) => handleItemClick(e, index)}
                                        onDoubleClick={() => handleItemDoubleClick(file)}
                                        draggable
                                        onDragStart={(e) => handleInternalDragStart(e, file)}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => handleInternalDrop(e, file)}
                                    >
                                        {viewMode === 'list' ? (
                                            <>
                                                <div className="col-check">
                                                    {selectedFiles.some(f => f.id === file.id) ? <CheckCircle2 size={16} color="#3b82f6" /> : <div className="dot"></div>}
                                                </div>
                                                <div className="col-name">
                                                    {file.mimeType === 'application/vnd.google-apps.folder' ?
                                                        <Folder size={18} fill="#fbbf24" stroke="#d97706" /> :
                                                        <File size={18} color="#3b82f6" />
                                                    }
                                                    <span>{file.name}</span>
                                                </div>
                                                <div className="col-size">{file.size ? formatFileSize(file.size) : '--'}</div>
                                                <div className="col-date">{file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : '--'}</div>
                                            </>
                                        ) : (
                                            <div className="grid-item-content">
                                                <div className="grid-selection-overlay">
                                                    {selectedFiles.some(f => f.id === file.id) && <CheckCircle2 size={18} color="#3b82f6" fill="white" />}
                                                </div>
                                                <div className="icon-box">
                                                    {file.mimeType === 'application/vnd.google-apps.folder' ?
                                                        <Folder size={40} fill="#fbbf24" stroke="#d97706" /> :
                                                        <File size={40} color="#3b82f6" strokeWidth={1.5} />
                                                    }
                                                </div>
                                                <span className="grid-name">{file.name}</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 드롭 안내 오버레이 */}
                    {isDraggingOver && (
                        <div className="drop-overlay">
                            <div className="overlay-box">
                                <Upload size={48} color="#3b82f6" />
                                <p>파일을 여기에 놓아 업로드</p>
                                <span className="sub-msg">탐색기 내부 어디든 드롭하세요</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* 하단 요약 정보바 (100px) */}
                <div className="explorer-footer">
                    {selectedFiles.length === 1 ? (
                        <div className="info-bar">
                            <div className="info-main">
                                <div className="mini-icon">
                                    {selectedFiles[0].mimeType === 'application/vnd.google-apps.folder' ? <Folder size={24} /> : <File size={24} />}
                                </div>
                                <div className="text-info">
                                    <div className="file-title">{selectedFiles[0].name}</div>
                                    <div className="file-meta">
                                        <span className="meta-item"><User size={12} /> {selectedFiles[0].owners?.[0]?.displayName || '공유됨'}</span>
                                        <span className="dot"></span>
                                        <span className="meta-item"><Clock size={12} /> {new Date(selectedFiles[0].modifiedTime).toLocaleString()}</span>
                                        <span className="dot"></span>
                                        <span className="meta-item bold">{selectedFiles[0].size ? formatFileSize(selectedFiles[0].size) : '폴더'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : selectedFiles.length > 1 ? (
                        <div className="info-bar multiple">
                            <div className="text-info">
                                <div className="file-title">{selectedFiles.length}개의 항목 선택됨</div>
                                <div className="file-meta">
                                    <span className="meta-item">일괄 작업을 수행할 수 있습니다.</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="footer-placeholder">
                            <Info size={16} />
                            <span>파일을 선택하면 상세 정보를 확인할 수 있습니다.</span>
                        </div>
                    )}
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        .file-manager-wrapper {
          display: flex;
          justify-content: center;
          padding: 20px;
          height: 100%;
        }
        .file-manager-container {
          width: 700px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          position: relative;
          transition: all 0.3s ease;
        }
        .drag-active {
          border: 3px solid #3b82f6;
          background: #eff6ff;
          box-shadow: 0 0 0 10px rgba(59, 130, 246, 0.1);
        }

        /* Header & Toolbar */
        .explorer-header {
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          padding: 16px;
        }
        .title-area {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .path-display {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 13px;
          color: #64748b;
        }
        .path-item.link { cursor: pointer; }
        .path-item.link:hover { text-decoration: underline; color: #3b82f6; }
        .path-item.bold { color: #1e293b; font-weight: 700; }
        .header-actions {
          display: flex;
          gap: 10px;
        }
        .search-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f1f5f9;
          padding: 6px 12px;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
        }
        .search-bar input {
          border: none;
          background: transparent;
          font-size: 13px;
          width: 150px;
          outline: none;
        }
        .icon-btn {
          background: white;
          border: 1px solid #e2e8f0;
          padding: 6px;
          border-radius: 50%;
          cursor: pointer;
          transition: background 0.2s;
        }
        .icon-btn:hover { background: #f8fafc; }

        .main-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .button-group {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .tool-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          color: #475569;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tool-btn:hover { background: #f1f5f9; border-color: #e2e8f0; }
        .tool-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .tool-btn.danger:hover { background: #fee2e2; color: #ef4444; border-color: #fecaca; }
        .tool-btn.primary { background: #3b82f6; color: white; margin-left: 10px; }
        .tool-btn.primary:hover { background: #2563eb; }
        .divider { width: 1px; height: 16px; background: #e2e8f0; margin: 0 8px; }

        .main-upload-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: #0f172a;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        }

        /* Body (500px) */
        .explorer-body {
          height: 500px;
          background: #f8fafc;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .file-grid-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0; /* 중요: flex 컨테이너 내부 스크롤 보장 */
        }
        .scroll-content {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
          position: relative; /* Marquee box placement reference */
        }
        .center-msg {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 15px;
          color: #94a3b8;
        }
        .center-msg.empty .back-btn { 
          margin-top: 10px; padding: 6px 12px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; cursor: pointer; 
        }
        .color-primary { color: #3b82f6; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* List View */
        .list-header {
          display: grid;
          grid-template-columns: 36px 1fr 90px 110px;
          padding: 6px 10px;
          background: #f1f5f9;
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          border-bottom: 1px solid #e2e8f0;
          flex-shrink: 0;
        }
        .file-item {
          display: grid;
          grid-template-columns: 36px 1fr 90px 110px;
          padding: 6px 10px; /* 밀도 최적화: 12px -> 6px */
          font-size: 13px;
          border-bottom: 1px solid #f1f1f1;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s;
          border-radius: 4px;
          user-select: none;
        }
        .file-item:hover { background: #f1f5f9; }
        .file-item.selected { background: #eff6ff; box-shadow: inset 0 0 0 1px #3b82f6; }
        .file-item.is-folder { font-weight: 600; color: #1e293b; }
        .col-name { display: flex; align-items: center; gap: 8px; overflow: hidden; }
        .col-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .col-size, .col-date { font-size: 11px; color: #64748b; }
        .col-check { display: flex; justify-content: center; }
        .dot { width: 5px; height: 5px; background: #cbd5e1; border-radius: 50%; }

        /* Grid View */
        .grid-view .scroll-content {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
          gap: 8px 12px; /* 수직 gap 8px, 수평 gap 12px */
        }
        .grid-view .file-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 12px 6px;
          text-align: center;
          background: white;
          border: 1px solid transparent; /* 평상시 테두리 제거 */
          height: auto;
          min-height: 100px;
          position: relative;
          border-radius: 4px;
        }
        .grid-view .file-item:hover { background: #f1f5f9; border-color: #e2e8f0; }
        .grid-view .file-item.selected { background: #eff6ff; border-color: #3b82f6; box-shadow: 0 0 0 1px #3b82f6; }
        .grid-item-content { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100%; }
        .grid-selection-overlay { position: absolute; top: 4px; right: 4px; height: 16px; }
        .grid-name { font-size: 11px; line-height: 1.2; font-weight: 500; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-all; color: #334155; }

        /* Drop Overlay */
        .drop-overlay {
          position: absolute;
          inset: 0;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          pointer-events: none; /* 오버레이 자체가 이벤트를 가로채지 않도록 설정 */
        }
        
        /* Selection Box */
        .selection-box {
          position: absolute;
          background: rgba(59, 130, 246, 0.15);
          border: 1px solid #3b82f6;
          z-index: 500;
          pointer-events: none;
        }

        .overlay-box {
          background: white;
          padding: 40px 60px;
          border-radius: 24px;
          text-align: center;
          box-shadow: 0 25px 60px -12px rgba(0,0,0,0.2);
          border: 2px solid #e2e8f0;
          animation: pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .overlay-box p { font-size: 18px; font-weight: 700; color: #1e293b; margin: 15px 0 5px; }
        .overlay-box .sub-msg { font-size: 13px; color: #64748b; }
        @keyframes pop { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }

        /* Footer (100px) */
        .explorer-footer {
          height: 100px;
          background: #ffffff;
          border-top: 1px solid #e2e8f0;
          padding: 0 20px;
          display: flex;
          align-items: center;
        }
        .info-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }
        .info-bar.multiple .file-title { color: #3b82f6; }
        .info-bar.multiple .file-meta { color: #94a3b8; }
        .info-main {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .mini-icon {
          width: 48px;
          height: 48px;
          background: #f1f5f9;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #3b82f6;
        }
        .file-title { font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
        .file-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #64748b; }
        .meta-item { display: flex; align-items: center; gap: 4px; }
        .info-bar .dot { width: 3px; height: 3px; background: #cbd5e1; }
        .info-side .external-link {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          color: #3b82f6;
          text-decoration: none;
          padding: 8px 12px;
          border-radius: 8px;
          background: #eff6ff;
          transition: background 0.2s;
        }
        .info-side .external-link:hover { background: #dbeafe; }
        .footer-placeholder {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #94a3b8;
          font-size: 14px;
        }
      `}} />
        </div>
    );
};

export default FileManager;

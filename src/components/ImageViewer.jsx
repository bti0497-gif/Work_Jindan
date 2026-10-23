import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Folder, FolderOpen, X, ZoomIn, ZoomOut } from 'lucide-react';
import { isCadFile } from '../services/cadPreviewService';
import { loadViewerPreview } from '../services/viewerPreviewService';
import { useImageTransform } from '../hooks/useImageTransform';
import { collectDriveItems, findFolderTrail, FOLDER_MIME_TYPE, sortGalleryFiles } from '../services/galleryData';

const FolderTreeItem = memo(function FolderTreeItem({ folder, depth = 0, selectedFolderId, expandedFolderIds, fileCounts, onSelect, onToggle }) {
    const children = (folder.children || []).filter(child => child.mimeType === FOLDER_MIME_TYPE);
    const count = fileCounts.get(folder.id) || 0;
    const expanded = expandedFolderIds.has(folder.id);
    return (
        <div>
            <div className={`drive-folder-row ${selectedFolderId === folder.id ? 'is-selected' : ''}`} style={{ paddingLeft: 10 + depth * 16 }}>
                {children.length ? (
                    <button type="button" className="folder-expand" onClick={() => onToggle(folder.id)} aria-label={expanded ? '폴더 접기' : '폴더 펼치기'}>
                        <ChevronDown size={14} style={{ transform: expanded ? undefined : 'rotate(-90deg)' }} />
                    </button>
                ) : <span className="folder-expand-spacer" />}
                <button type="button" className="folder-select" onClick={() => onSelect(folder.id)} title={folder.name}>
                    {expanded ? <FolderOpen size={16} /> : <Folder size={16} />}
                    <span>{folder.name}</span>
                    {count > 0 && <small>{count}</small>}
                </button>
            </div>
            {expanded && children.map(child => <FolderTreeItem key={child.id} folder={child} depth={depth + 1} selectedFolderId={selectedFolderId} expandedFolderIds={expandedFolderIds} fileCounts={fileCounts} onSelect={onSelect} onToggle={onToggle} />)}
        </div>
    );
});

const ImageViewer = ({ tree, initialFileId }) => {
    const { folders, photos, drawings } = useMemo(() => collectDriveItems(tree), [tree]);
    const files = useMemo(() => sortGalleryFiles([...photos, ...drawings]), [photos, drawings]);
    const fileCounts = useMemo(() => {
        const counts = new Map();
        files.forEach(file => counts.set(file.parentFolderId, (counts.get(file.parentFolderId) || 0) + 1));
        return counts;
    }, [files]);
    const initialFile = files.find(file => file.id === initialFileId);
    const [selectedFolderId, setSelectedFolderId] = useState(initialFile?.parentFolderId || tree.id);
    const [selectedFileId, setSelectedFileId] = useState(initialFile?.id || null);
    const [expandedFolderIds, setExpandedFolderIds] = useState(() => new Set([tree.id, ...findFolderTrail(tree, initialFile?.parentFolderId)]));
    const [preview, setPreview] = useState({ fileId: null, url: '', error: '' });
    const { zoom, imageRef, stageRef, resetView, changeZoom, onImageLoad, onPointerDown, onPointerMove, onPointerEnd } = useImageTransform();
    const folderFiles = useMemo(() => files.filter(file => file.parentFolderId === selectedFolderId), [files, selectedFolderId]);
    const selectedIndex = Math.max(0, folderFiles.findIndex(file => file.id === selectedFileId));
    const activeFile = folderFiles[selectedIndex] || null;
    const activeFolder = folders.find(folder => folder.id === selectedFolderId);

    const chooseFile = file => {
        if (!file) return;
        setSelectedFileId(file.id);
        resetView();
    };
    const chooseFolder = useCallback(folderId => {
        setSelectedFolderId(folderId);
        setSelectedFileId(null);
        resetView();
    }, [resetView]);
    const navigate = direction => {
        if (!folderFiles.length) return;
        chooseFile(folderFiles[(selectedIndex + direction + folderFiles.length) % folderFiles.length]);
    };
    const toggleFolder = useCallback(folderId => {
        setExpandedFolderIds(current => {
            const next = new Set(current);
            if (next.has(folderId)) next.delete(folderId);
            else next.add(folderId);
            return next;
        });
    }, []);
    const focusApp = () => {
        if (window.electron?.invoke) {
            window.electron.invoke('focus-main-window').catch(error => console.error('Failed to focus app', error));
        } else if (window.opener && !window.opener.closed) {
            window.opener.focus();
        }
    };

    useEffect(() => {
        document.title = `${activeFile?.name || '사진·도면'} — 이미지 뷰어`;
    }, [activeFile]);

    useEffect(() => {
        if (!activeFile) return;
        let isCurrent = true;
        const controller = new AbortController();
        let url = '';
        const load = async () => {
            try {
                const content = await loadViewerPreview(activeFile, controller.signal);
                if (!isCurrent) return;
                url = URL.createObjectURL(content);
                setPreview({ fileId: activeFile.id, url, error: '' });
            } catch (error) {
                if (!isCurrent || error.name === 'AbortError') return;
                console.error('Failed to load viewer file', error);
                if (isCurrent) setPreview({ fileId: activeFile.id, url: '', error: error.message || '파일을 표시하지 못했습니다.' });
            }
        };
        void load();
        return () => {
            isCurrent = false;
            controller.abort();
            if (url) URL.revokeObjectURL(url);
        };
    }, [activeFile]);

    useEffect(() => {
        const handleKeyDown = event => {
            if (event.key === 'Escape') window.close();
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                if (folderFiles.length) {
                    const direction = event.key === 'ArrowLeft' ? -1 : 1;
                    setSelectedFileId(folderFiles[(selectedIndex + direction + folderFiles.length) % folderFiles.length].id);
                    resetView();
                }
            }
            if (event.key === '+' || event.key === '=') changeZoom(value => value + 0.25);
            if (event.key === '-') changeZoom(value => value - 0.25);
            if (event.key === '0') resetView();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [folderFiles, selectedIndex, resetView, changeZoom]);

    const currentPreview = preview.fileId === activeFile?.id ? preview : null;
    return (
        <div className="standalone-image-viewer">
            <header className="viewer-header">
                <div className="viewer-heading">
                    <strong>{activeFile?.name || activeFolder?.name || '사진·도면 뷰어'}</strong>
                    <span>{activeFolder?.folderPath?.join(' / ') || ''}</span>
                </div>
                <div className="viewer-toolbar">
                    <button type="button" className="back-to-app" onClick={focusApp} title="앱으로 돌아가기"><ArrowLeft /><span>앱으로</span></button>
                    <button type="button" onClick={() => changeZoom(value => value - 0.25)} aria-label="축소" title="축소"><ZoomOut /></button>
                    <button type="button" className="zoom-level" onClick={resetView} aria-label="확대 초기화" title="확대 초기화">{Math.round(zoom * 100)}%</button>
                    <button type="button" onClick={() => changeZoom(value => value + 0.25)} aria-label="확대" title="확대"><ZoomIn /></button>
                    <button type="button" onClick={() => window.close()} aria-label="뷰어 닫기" title="뷰어 닫기"><X /></button>
                </div>
            </header>
            <div className="viewer-body">
                <aside className="drive-tree-sidebar" aria-label="Drive 폴더">
                    <div className="tree-heading">드라이브 폴더</div>
                    <div className="tree-scroll">
                        <FolderTreeItem folder={tree} selectedFolderId={selectedFolderId} expandedFolderIds={expandedFolderIds} fileCounts={fileCounts} onSelect={chooseFolder} onToggle={toggleFolder} />
                    </div>
                </aside>
                <main className="viewer-main">
                    <div className="viewer-photo-stage" ref={stageRef}>
                        {currentPreview?.error ? <div className="viewer-error" role="alert">{currentPreview.error}</div> : activeFile && currentPreview?.url ? (
                            <img ref={imageRef} key={activeFile.id} src={currentPreview.url} alt={activeFile.name} draggable="false"
                                onLoad={onImageLoad}
                                onError={() => setPreview({ fileId: activeFile.id, url: '', error: '이미지를 표시하지 못했습니다. 파일 형식을 확인해 주세요.' })}
                                onPointerDown={onPointerDown}
                                onPointerMove={onPointerMove}
                                onPointerUp={onPointerEnd}
                                onPointerCancel={onPointerEnd}
                                onLostPointerCapture={onPointerEnd}
                            />
                        ) : <div className="viewer-empty">{activeFile ? (isCadFile(activeFile) ? '도면을 읽고 렌더링하는 중입니다.' : '사진을 불러오는 중입니다.') : '이 폴더에는 표시할 사진이나 도면이 없습니다.'}</div>}
                    </div>
                    <footer className="viewer-footer">
                        <button type="button" onClick={() => navigate(-1)} disabled={folderFiles.length < 2} aria-label="이전 파일"><ChevronLeft /></button>
                        <span>{folderFiles.length ? `${selectedIndex + 1} / ${folderFiles.length}` : '파일 없음'}</span>
                        <button type="button" onClick={() => navigate(1)} disabled={folderFiles.length < 2} aria-label="다음 파일"><ChevronRight /></button>
                    </footer>
                </main>
            </div>
        </div>
    );
};

export default ImageViewer;

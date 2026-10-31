import React, { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import {
    Folder,
    File,
    Search,
    Upload,
    ChevronRight,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    Info,
    HardDrive,
    Clock,
    User,
    RefreshCw,
    AlertCircle,
    LayoutGrid,
    List as ListIcon,
    SortAsc,
    Trash2,
    Download as DownloadIcon,
    FolderPlus,
    CheckCircle2,
    Edit2
} from 'lucide-react';
import FileContextMenu from './FileContextMenu';
import {
    uploadFile,
    createFolder,
    deleteFile,
    moveFile,
    renameFile,
    formatFileSize
} from '../services/driveService';
import { downloadSelection } from '../services/driveDownloadService';
import {
    readCachedFolder, refreshDriveFolder, subscribeDriveCache, getDriveCacheStatus,
    warmDriveCache, renameCachedItem, removeCachedItems, upsertCachedItem, formatDriveCacheStatus
} from '../services/driveCacheService';

const FileManager = ({ showAlert, showConfirm, showPrompt }) => {
    // 상태 관리
    const [files, setFiles] = useState([]);
    const [selectedFiles, setSelectedFiles] = useState([]); // 다중 선택 지원
    const [lastSelectedIndex, setLastSelectedIndex] = useState(-1);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [isExternalDrag, setIsExternalDrag] = useState(false);
    const [dragOverFolderId, setDragOverFolderId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

    // 네비게이션 상태
    const [navigation, setNavigation] = useState(() => ({
        entries: [[{ id: import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID || import.meta.env.GOOGLE_DRIVE_FOLDER_ID, name: '공유 드라이브' }]],
        index: 0
    }));
    const folderStack = navigation.entries[navigation.index];
    const currentFolderId = folderStack[folderStack.length - 1].id;
    const [renameState, setRenameState] = useState(null);
    const [renameSaving, setRenameSaving] = useState(false);
    const [contextMenu, setContextMenu] = useState(null);
    const [downloadProgress, setDownloadProgress] = useState('');
    const driveCache = useSyncExternalStore(subscribeDriveCache, getDriveCacheStatus);

    const explorerRef = useRef(null);
    const fileInputRef = useRef(null);
    const scrollContentRef = useRef(null);
    const renameInputRef = useRef(null);
    const renameTimerRef = useRef(null);
    const renameSessionRef = useRef(null);
    const renameSavingRef = useRef(false);
    const loadRequestRef = useRef(0);
    const downloadingRef = useRef(false);
    const dragCounter = useRef(0);

    // 마키(영역 선택) 상태
    const [selectionBox, setSelectionBox] = useState({ active: false, startX: 0, startY: 0, x: 0, y: 0, width: 0, height: 0 });
    const selectionRef = useRef({ isDragging: false, startTime: 0 });

    // 데이터 로드
    const fetchDriveFiles = useCallback(async (folderId = currentFolderId, { force = false } = {}) => {
        const requestId = ++loadRequestRef.current;
        const cached = readCachedFolder(folderId);
        const applyFiles = driveFiles => {
            setFiles(driveFiles);
            setSelectedFiles(previous => previous.flatMap(file => {
                const updated = driveFiles.find(item => item.id === file.id);
                return updated ? [updated] : [];
            }));
        };
        if (cached !== null) applyFiles(cached);
        try {
            setLoading(cached === null);
            setError(null);
            const driveFiles = await refreshDriveFolder(folderId, { force });
            if (requestId !== loadRequestRef.current) return;
            if (!renameSessionRef.current) applyFiles(driveFiles);
        } catch (err) {
            if (requestId !== loadRequestRef.current) return;
            console.error('Error in FileManager:', err);
            if (cached === null) setError(`데이터 로드 실패: ${err.message}`);
        } finally {
            if (requestId === loadRequestRef.current) setLoading(false);
        }
    }, [currentFolderId]);

    useEffect(() => {
        const requests = loadRequestRef;
        const unsubscribe = subscribeDriveCache(() => {
            const cached = readCachedFolder(currentFolderId);
            if (cached === null || renameSessionRef.current) return;
            setFiles(cached);
            setSelectedFiles(previous => previous.flatMap(file => {
                const updated = cached.find(item => item.id === file.id);
                return updated ? [updated] : [];
            }));
            setLoading(false);
            setError(null);
        });
        fetchDriveFiles();
        return () => { requests.current++; unsubscribe(); };
    }, [fetchDriveFiles, currentFolderId]);

    useEffect(() => () => clearTimeout(renameTimerRef.current), []);

    const renameFileId = renameState?.file.id;
    const renameError = renameState?.error;
    useEffect(() => {
        if (!renameFileId) return;
        const input = renameInputRef.current;
        if (!input) return;
        input.focus();
        const lastDot = input.value.lastIndexOf('.');
        const isFolder = renameSessionRef.current?.mimeType === 'application/vnd.google-apps.folder';
        input.setSelectionRange(0, !isFolder && lastDot > 0 ? lastDot : input.value.length);
    }, [renameFileId]);

    useEffect(() => {
        if (renameError && !renameSaving) renameInputRef.current?.focus();
    }, [renameError, renameSaving]);

    const clearRenameTimer = () => {
        clearTimeout(renameTimerRef.current);
        renameTimerRef.current = null;
    };

    const cancelRename = () => {
        clearRenameTimer();
        if (renameSavingRef.current) return;
        renameSessionRef.current = null;
        setRenameState(null);
    };

    // --- 기능 함수들 ---

    // 폴더 진입 (더블 클릭)
    const handleItemDoubleClick = (item) => {
        clearRenameTimer();
        if (renameSessionRef.current || renameSavingRef.current) return;
        if (item.mimeType === 'application/vnd.google-apps.folder') {
            visitFolder([...folderStack, { id: item.id, name: item.name }]);
        } else {
            window.open(`https://drive.google.com/file/d/${encodeURIComponent(item.id)}/view`, '_blank', 'noopener,noreferrer');
        }
    };

    const resetFolderView = (folderId) => {
        setContextMenu(null);
        cancelRename();
        loadRequestRef.current++;
        const cached = readCachedFolder(folderId);
        setLoading(cached === null);
        setFiles(cached || []);
        setError(null);
        setSelectedFiles([]);
        setLastSelectedIndex(-1);
        setSearchTerm('');
        setDragOverFolderId(null);
        selectionRef.current.isDragging = false;
        setSelectionBox(previous => ({ ...previous, active: false }));
    };

    // 방문 기록과 실제 상위 경로를 별도로 관리합니다.
    const visitFolder = (path) => {
        if (renameSavingRef.current || path[path.length - 1].id === currentFolderId) return;
        resetFolderView(path[path.length - 1].id);
        setNavigation(previous => ({
            entries: [...previous.entries.slice(0, previous.index + 1), path],
            index: previous.index + 1
        }));
    };

    // 브레드크럼 이동
    const navigateToFolder = (index) => {
        visitFolder(folderStack.slice(0, index + 1));
    };

    // 새 폴더 만들기
    const handleCreateFolder = async () => {
        const folderName = await showPrompt('새 폴더 이름을 입력하세요:', '새 폴더', '폴더 생성');
        if (!folderName?.trim()) return;

        try {
            setLoading(true);
            const folder = await createFolder(folderName.trim(), currentFolderId);
            upsertCachedItem(currentFolderId, { ...folder, mimeType: 'application/vnd.google-apps.folder' });
            await fetchDriveFiles(currentFolderId, { force: true });
        } catch (err) { showAlert(`폴더 생성 실패: ${err.message}`, '오류', 'error'); }
        finally { setLoading(false); }
    };

    // 삭제
    const handleDelete = async (targets = selectedFiles) => {
        if (targets.length === 0) return showAlert('삭제할 파일을 선택하세요.');
        const count = targets.length;
        const confirmed = await showConfirm(`${count === 1 ? `'${targets[0].name}'` : `${count}개의 항목`}을 삭제하시겠습니까?`);
        if (!confirmed) return;

        try {
            setLoading(true);
            for (const file of targets) {
                await deleteFile(file.id);
                removeCachedItems([file.id]);
            }
            setSelectedFiles([]);
            setLastSelectedIndex(-1);
            await fetchDriveFiles(currentFolderId, { force: true });
            await showAlert('삭제되었습니다.', '성공', 'success');
        } catch (err) { showAlert(`삭제 실패: ${err.message}`, '오류', 'error'); }
        finally { setLoading(false); }
    };

    // 정렬 토글
    const handleSort = () => {
        clearRenameTimer();
        setLastSelectedIndex(-1);
        setSortConfig(prev => ({
            key: 'name',
            direction: prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // 뒤로 가기
    const handleGoBack = () => {
        if (navigation.index === 0 || renameSavingRef.current) return;
        const path = navigation.entries[navigation.index - 1];
        resetFolderView(path[path.length - 1].id);
        setNavigation(previous => ({ ...previous, index: previous.index - 1 }));
    };

    const handleGoForward = () => {
        if (navigation.index >= navigation.entries.length - 1 || renameSavingRef.current) return;
        const path = navigation.entries[navigation.index + 1];
        resetFolderView(path[path.length - 1].id);
        setNavigation(previous => ({ ...previous, index: previous.index + 1 }));
    };

    // 상위 폴더로 가기
    const handleGoUp = () => {
        if (folderStack.length > 1) {
            navigateToFolder(folderStack.length - 2);
        }
    };

    // 이름 바꾸기 (단일 선택 시에만 활성화)
    const handleRename = (file = selectedFiles[0]) => {
        clearRenameTimer();
        if (!file || loading || renameSavingRef.current) return;
        renameSessionRef.current = file;
        setSelectedFiles([file]);
        setRenameState({ file, value: file.name, error: '' });
    };

    const commitRename = async (value) => {
        const file = renameSessionRef.current;
        if (!file || renameSavingRef.current) return;
        const newName = value.trim();
        if (newName === file.name) {
            cancelRename();
            return;
        }
        const validationError = !newName || newName === '.' || newName === '..'
            ? '이름을 입력하세요.'
            : /[\\/:*?"<>|]/.test(newName) || Array.from(newName).some(character => character.charCodeAt(0) < 32)
                ? '이름에는 \\ / : * ? " < > | 문자를 사용할 수 없습니다.'
                : files.some(item => item.id !== file.id && item.name.toLocaleLowerCase() === newName.toLocaleLowerCase())
                    ? '같은 이름의 항목이 이미 있습니다.' : '';
        if (validationError) {
            setRenameState(previous => ({ ...previous, error: validationError }));
            renameInputRef.current?.focus();
            return;
        }

        renameSavingRef.current = true;
        setRenameSaving(true);
        try {
            await renameFile(file.id, newName);
            renameCachedItem(file.id, newName);
            // 이름 변경 전 시작된 목록 조회가 새 이름을 덮어쓰지 않게 합니다.
            loadRequestRef.current++;
            const updateName = items => items.map(item => item.id === file.id ? { ...item, name: newName } : item);
            setFiles(updateName);
            setSelectedFiles(updateName);
            setNavigation(previous => ({
                ...previous,
                entries: previous.entries.map(path => updateName(path))
            }));
            renameSessionRef.current = null;
            setRenameState(null);
            setLastSelectedIndex(-1);
            explorerRef.current?.focus({ preventScroll: true });
        } catch (err) {
            setRenameState(previous => ({ ...previous, error: `이름 변경 실패: ${err.message}` }));
        } finally {
            renameSavingRef.current = false;
            setRenameSaving(false);
        }
    };

    // 다운로드
    const handleDownload = async (targets = selectedFiles) => {
        if (!targets.length) return showAlert('다운로드할 파일을 선택하세요.');
        if (downloadingRef.current) return;
        downloadingRef.current = true;
        setDownloadProgress('다운로드 준비 중…');
        try {
            await downloadSelection(targets, name => setDownloadProgress(name));
        } catch (error) {
            await showAlert(`다운로드 실패: ${error.message}`, '오류', 'error');
        } finally {
            downloadingRef.current = false;
            setDownloadProgress('');
        }
    };

    // 렌더링용 파일 목록 계산 (검색 + 정렬 피터링)
    const displayFiles = useMemo(() => {
        let result = [...files];

        // 1. 검색 필터링
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            result = result.filter(f => f.name.toLowerCase().includes(term));
        }

        // 2. 정렬
        result.sort((a, b) => {
            const valA = a[sortConfig.key] || '';
            const valB = b[sortConfig.key] || '';
            const compare = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
            return sortConfig.direction === 'asc' ? compare : -compare;
        });

        return result;
    }, [files, searchTerm, sortConfig]);

    // 아이템 클릭 처리 (Shift/Ctrl 지원)
    const handleItemClick = (e, index) => {
        setContextMenu(null);
        if (e) e.stopPropagation();
        clearRenameTimer();
        if (renameSavingRef.current) return;
        const clickedFile = displayFiles[index];
        const isSelected = selectedFiles.some(f => f.id === clickedFile.id);
        if (renameSessionRef.current) cancelRename();
        explorerRef.current?.focus({ preventScroll: true });

        if (e && (e.ctrlKey || e.metaKey)) {
            if (isSelected) {
                setSelectedFiles(prev => prev.filter(f => f.id !== clickedFile.id));
            } else {
                setSelectedFiles(prev => [...prev, clickedFile]);
            }
        } else if (e && e.shiftKey && lastSelectedIndex !== -1) {
            const start = Math.min(lastSelectedIndex, index);
            const end = Math.max(lastSelectedIndex, index);
            const rangeSelection = displayFiles.slice(start, end + 1);
            setSelectedFiles(rangeSelection);
        } else {
            setSelectedFiles([clickedFile]);
            // 더블 클릭과 구분해, 선택된 이름을 다시 한 번 클릭하면 편집합니다.
            if (isSelected && selectedFiles.length === 1 && e?.detail === 1 && e.target.closest('.file-name-label')) {
                renameTimerRef.current = setTimeout(() => handleRename(clickedFile), 550);
            }
        }
        setLastSelectedIndex(index);
    };

    // 체크박스 전용 토글
    const toggleSelection = (e, file) => {
        e.stopPropagation();
        cancelRename();
        if (renameSavingRef.current) return;
        explorerRef.current?.focus({ preventScroll: true });
        setSelectedFiles(prev => {
            const isSelected = prev.some(f => f.id === file.id);
            if (isSelected) return prev.filter(f => f.id !== file.id);
            return [...prev, file];
        });
    };

    // --- 마키 선택 (Marquee) 핸들러 ---
    const handleMouseDown = (e) => {
        // 이미 파일을 클릭한 경우는 무시 (버블링 방지 위해 e.target 체크 권장되나 여기선 컨테이너 클릭 전용)
        if (e.button !== 0) return; // 좌클릭만
        if (e.target.closest('.file-item')) return;
        if (renameSavingRef.current) return;
        cancelRename();
        explorerRef.current?.focus({ preventScroll: true });

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
        selectionRef.current.startTime = Date.now();
    };

    const handleMouseMove = useCallback((e) => {
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
                newSelected.push(displayFiles[idx]);
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
    }, [displayFiles]);

    const handleMouseUp = useCallback(() => {
        selectionRef.current.isDragging = false;
        setSelectionBox(prev => ({ ...prev, active: false }));
    }, []);

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
    }, [selectionBox.active, handleMouseMove, handleMouseUp]);

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
                    const confirmed = await showConfirm(`'${file.name}' 파일이 이미 존재합니다.\n이름을 변경하여 업로드하시겠습니까?`);
                    if (confirmed) {
                        uploadName = getUniqueName(file.name);
                    } else {
                        console.log(`Upload skipped for: ${file.name}`);
                        continue; // 건너뛰기
                    }
                }

                const uploaded = await uploadFile(file, currentFolderId, uploadName);
                upsertCachedItem(currentFolderId, { ...uploaded, name: uploadName, size: String(file.size), mimeType: file.type || 'application/octet-stream' });
            }
            await fetchDriveFiles(currentFolderId, { force: true });
            await showAlert('업로드가 완료되었습니다.', '성공', 'success');
        } catch (err) {
            showAlert(`업로드 실패: ${err.message}`, '오류', 'error');
        } finally {
            setUploading(false);
        }
    };

    // --- 드래그 앤 드롭 (외부 업로드) ---
    const handleDragEnter = (e) => {
        e.preventDefault();
        dragCounter.current++;

        // 드래그 소스가 외부 파일인지 확인
        const isFile = e.dataTransfer.types.includes('Files');
        if (isFile) {
            setIsExternalDrag(true);
            setIsDraggingOver(true);
        } else {
            setIsExternalDrag(false);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        // 이미 외부 드래그 상태라면 유지
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDraggingOver(false);
            setIsExternalDrag(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        dragCounter.current = 0;
        setIsDraggingOver(false);
        setIsExternalDrag(false);

        const droppedFiles = e.dataTransfer.files;
        if (droppedFiles.length > 0) {
            processUpload(droppedFiles);
        }
    };

    // --- 내부 드래그 앤 드롭 ---
    const handleInternalDragStart = (e, file) => {
        clearRenameTimer();
        if (renameSessionRef.current || renameSavingRef.current) {
            e.preventDefault();
            return;
        }
        // 만약 선택된 파일이 여러개이고, 드래그하는 파일이 그 중 하나라면 다중 드래그 처리
        const isMultiple = selectedFiles.length > 1 && selectedFiles.some(f => f.id === file.id);
        const filesToMove = isMultiple ? selectedFiles : [file];

        e.dataTransfer.setData('sourceFiles', JSON.stringify(filesToMove.map(f => ({ id: f.id, name: f.name }))));
        e.dataTransfer.effectAllowed = 'move';

        // 투명 아이콘 생성 (네이티브 느낌)
        if (isMultiple) {
            const dragImg = document.createElement('div');
            dragImg.style.padding = '8px 12px';
            dragImg.style.background = '#3b82f6';
            dragImg.style.color = 'white';
            dragImg.style.borderRadius = '8px';
            dragImg.style.fontSize = '12px';
            dragImg.style.fontWeight = '700';
            dragImg.innerText = `${selectedFiles.length}개 항목 이동`;
            dragImg.style.position = 'absolute';
            dragImg.style.top = '-1000px';
            document.body.appendChild(dragImg);
            e.dataTransfer.setDragImage(dragImg, 0, 0);
            setTimeout(() => document.body.removeChild(dragImg), 0);
        }
    };

    const handleInternalDragOver = (e, targetFile) => {
        e.preventDefault();
        if (targetFile.mimeType === 'application/vnd.google-apps.folder') {
            setDragOverFolderId(targetFile.id);
        } else {
            setDragOverFolderId(null);
        }
    };

    const handleInternalDrop = async (e, targetFile) => {
        e.preventDefault();
        setDragOverFolderId(null);

        const data = e.dataTransfer.getData('sourceFiles');
        if (!data) return;

        const sourceFiles = JSON.parse(data);
        if (sourceFiles.some(f => f.id === targetFile.id)) return; // 자기 자신에게 드롭 방지

        if (targetFile.mimeType === 'application/vnd.google-apps.folder') {
            const confirmed = await showConfirm(
                sourceFiles.length === 1
                    ? `'${sourceFiles[0].name}' 항목을 '${targetFile.name}' 폴더로 이동하시겠습니까?`
                    : `${sourceFiles.length}개의 항목을 '${targetFile.name}' 폴더로 이동하시겠습니까?`
            );

            if (confirmed) {
                try {
                    setLoading(true);
                    for (const f of sourceFiles) {
                        const moved = files.find(item => item.id === f.id);
                        await moveFile(f.id, currentFolderId, targetFile.id);
                        removeCachedItems([f.id], { discardFolders: false });
                        if (moved) upsertCachedItem(targetFile.id, moved);
                    }
                    await fetchDriveFiles(currentFolderId, { force: true });
                    setSelectedFiles([]);
                    await showAlert('항목이 이동되었습니다.', '성공', 'success');
                } catch (err) { showAlert(`이동 실패: ${err.message}`, '오류', 'error'); }
                finally { setLoading(false); }
            }
        }
    };

    const handleExplorerKeyDown = (event) => {
        if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (renameSavingRef.current) return;
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            const element = explorerRef.current.querySelector('.file-item.selected') || explorerRef.current.querySelector('.explorer-body');
            const rect = element.getBoundingClientRect();
            openContextMenu(event, selectedFiles[0], rect.left + 20, rect.top + 20);
        } else if (event.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            if (event.key === 'ArrowLeft') handleGoBack();
            if (event.key === 'ArrowRight') handleGoForward();
            if (event.key === 'ArrowUp') handleGoUp();
        } else if (event.key === 'F2' && selectedFiles.length === 1) {
            event.preventDefault();
            handleRename();
        } else if (event.key === 'Enter' && selectedFiles.length === 1 && !event.target.closest('button')) {
            event.preventDefault();
            handleItemDoubleClick(selectedFiles[0]);
        } else if (event.key === 'Escape') {
            clearRenameTimer();
            setSelectedFiles([]);
            setLastSelectedIndex(-1);
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
            event.preventDefault();
            clearRenameTimer();
            setSelectedFiles(displayFiles);
        }
    };

    const closeContextMenu = useCallback((restoreFocus = false) => {
        setContextMenu(null);
        if (restoreFocus) explorerRef.current?.focus({ preventScroll: true });
    }, []);

    const openContextMenu = (event, file = null, x = event.clientX, y = event.clientY) => {
        if (event.target.closest('input, textarea, [contenteditable="true"]')) return;
        event.preventDefault();
        event.stopPropagation();
        clearRenameTimer();
        if (loading || uploading || renameSavingRef.current) return;
        cancelRename();
        const targets = file ? (selectedFiles.some(item => item.id === file.id) ? selectedFiles : [file]) : [];
        setSelectedFiles(targets);
        setLastSelectedIndex(file ? displayFiles.findIndex(item => item.id === file.id) : -1);
        setContextMenu({ x, y, targets });
    };

    const contextTargets = contextMenu?.targets || [];
    const contextActions = [
        ...(contextTargets.length ? [
            { id: 'open', label: '열기', icon: <Folder size={16} />, shortcut: 'Enter', disabled: contextTargets.length !== 1, onSelect: () => handleItemDoubleClick(contextTargets[0]) },
            { id: 'rename', label: '이름 바꾸기', icon: <Edit2 size={16} />, shortcut: 'F2', disabled: contextTargets.length !== 1, onSelect: () => handleRename(contextTargets[0]) },
            { id: 'download', label: '다운로드', title: '폴더 또는 여러 항목은 ZIP 파일로 다운로드', icon: <DownloadIcon size={16} />, disabled: Boolean(downloadProgress), onSelect: () => handleDownload(contextTargets) },
            { id: 'delete', label: '삭제', icon: <Trash2 size={16} />, danger: true, onSelect: () => handleDelete(contextTargets) }
        ] : []),
        { id: 'new-folder', label: '새 폴더', title: '현재 위치에 새 폴더 만들기', icon: <FolderPlus size={16} />, separatorBefore: contextTargets.length > 0, onSelect: handleCreateFolder },
        { id: 'upload', label: '파일 올리기', icon: <Upload size={16} />, onSelect: () => fileInputRef.current?.click() },
        { id: 'refresh', label: '동기화', title: '드라이브 목록을 백그라운드에서 동기화', icon: <RefreshCw size={16} />, disabled: driveCache.syncing, onSelect: () => warmDriveCache({ force: true }) }
    ];

    const renderFileName = (file, className = '') => renameState?.file.id === file.id ? (
        <div className="rename-field" onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
            <input
                ref={renameInputRef}
                className="rename-input"
                autoFocus
                aria-label={`${file.name} 이름 변경`}
                aria-invalid={Boolean(renameState.error)}
                aria-describedby={renameState.error ? 'file-rename-error' : undefined}
                value={renameState.value}
                disabled={renameSaving}
                onChange={event => setRenameState(previous => ({ ...previous, value: event.target.value, error: '' }))}
                onBlur={event => commitRename(event.target.value)}
                onKeyDown={event => {
                    event.stopPropagation();
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        commitRename(event.currentTarget.value);
                    } else if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelRename();
                        explorerRef.current?.focus({ preventScroll: true });
                    }
                }}
            />
            {renameSaving && <span className="rename-status" role="status">저장 중…</span>}
            {renameState.error && <span id="file-rename-error" className="rename-error" role="alert">{renameState.error}</span>}
        </div>
    ) : <span className={`file-name-label ${className}`} title={file.name}>{file.name}</span>;

    return (
        <div className="file-manager-wrapper" ref={explorerRef} tabIndex={0} role="region" aria-label="공유 파일 탐색기" onKeyDown={handleExplorerKeyDown}>
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
                            <button
                                className="nav-arrow-btn"
                                onClick={handleGoBack}
                                disabled={navigation.index === 0 || renameSaving}
                                title="뒤로 가기 (Alt+←)"
                                aria-label="뒤로 가기"
                            >
                                <ArrowLeft size={18} />
                            </button>
                            <button
                                className="nav-arrow-btn"
                                onClick={handleGoForward}
                                disabled={navigation.index >= navigation.entries.length - 1 || renameSaving}
                                title="앞으로 가기 (Alt+→)"
                                aria-label="앞으로 가기"
                            >
                                <ArrowRight size={18} />
                            </button>
                            <button
                                className="nav-arrow-btn"
                                onClick={handleGoUp}
                                disabled={folderStack.length <= 1 || renameSaving}
                                title="상위 폴더로 이동 (Alt+↑)"
                                aria-label="상위 폴더로 이동"
                            >
                                <ArrowUp size={18} />
                            </button>
                            <div className="divider mini"></div>
                            <HardDrive size={16} />
                            {folderStack.map((folder, idx) => (
                                <React.Fragment key={folder.id}>
                                    <button
                                        className={`path-item ${idx === folderStack.length - 1 ? 'bold' : 'link'}`}
                                        onClick={() => navigateToFolder(idx)}
                                        disabled={idx === folderStack.length - 1 || renameSaving}
                                        aria-current={idx === folderStack.length - 1 ? 'location' : undefined}
                                    >
                                        {folder.name}
                                    </button>
                                    {idx < folderStack.length - 1 && <ChevronRight size={14} />}
                                </React.Fragment>
                            ))}
                        </div>
                        <div className="header-actions">
                            <div className="search-bar">
                                <Search size={14} />
                                <input
                                    type="text"
                                    aria-label="현재 폴더에서 검색"
                                    placeholder="파일 검색..."
                                    value={searchTerm}
                                    onChange={(e) => {
                                        clearRenameTimer();
                                        setSelectedFiles([]);
                                        setLastSelectedIndex(-1);
                                        setSearchTerm(e.target.value);
                                    }}
                                    disabled={Boolean(renameState)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="main-toolbar">
                        <div className="button-group">
                            <button className="tool-btn labeled-action" onClick={handleCreateFolder} title="현재 위치에 새 폴더 만들기" aria-label="새 폴더 만들기" disabled={loading || Boolean(renameState)}>
                                <FolderPlus size={16} color="#10b981" />
                                <span>새폴더</span>
                            </button>
                            <button className="tool-btn labeled-action" onClick={() => warmDriveCache({ force: true })} title="공유 드라이브의 폴더·파일 목록을 백그라운드에서 동기화합니다. 캐시로 계속 작업할 수 있습니다." aria-label="드라이브 동기화" disabled={driveCache.syncing || Boolean(renameState)}>
                                <RefreshCw size={16} className={driveCache.syncing ? 'spin' : ''} />
                                <span>동기화</span>
                            </button>
                            <div className="divider"></div>
                            <button className="tool-btn" onClick={() => { cancelRename(); setViewMode(viewMode === 'list' ? 'grid' : 'list'); }} title="보기 전환" aria-label="보기 전환" disabled={Boolean(renameState)}>
                                {viewMode === 'list' ? <LayoutGrid size={16} /> : <ListIcon size={16} />}
                                <span>보기</span>
                            </button>
                            <button className={`tool-btn ${sortConfig.direction === 'desc' ? 'active' : ''}`} onClick={handleSort} title={sortConfig.direction === 'asc' ? '이름 내림차순으로 정렬' : '이름 오름차순으로 정렬'} aria-label="이름순 정렬" disabled={Boolean(renameState)}>
                                <SortAsc size={16} className={sortConfig.direction === 'desc' ? 'flip-v' : ''} />
                                <span>정렬</span>
                            </button>
                            <div className="divider"></div>
                            <button className="tool-btn" onClick={() => handleRename()} title="이름 바꾸기 (F2)" aria-label="이름 바꾸기" disabled={loading || selectedFiles.length !== 1 || Boolean(renameState)}>
                                <Edit2 size={16} />
                                <span>이름바꾸기</span>
                            </button>
                            <button className="tool-btn danger" onClick={() => handleDelete()} title="삭제" disabled={loading || selectedFiles.length === 0 || Boolean(renameState)}>
                                <Trash2 size={16} />
                                <span>삭제</span>
                            </button>
                            <button className="tool-btn primary" onClick={() => handleDownload()} title="다운로드 (폴더·여러 항목은 ZIP)" disabled={loading || selectedFiles.length === 0 || Boolean(renameState) || Boolean(downloadProgress)}>
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
                            <button className="main-upload-btn" onClick={() => fileInputRef.current?.click()} title="현재 폴더에 파일 업로드 (여러 파일 선택 가능)" aria-label="파일 올리기" disabled={uploading || loading || Boolean(renameState)}>
                                {uploading ? <RefreshCw size={14} className="spin" /> : <Upload size={14} />}
                                <span>{uploading ? '업로드 중..' : '파일 올리기'}</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* 파일 리스트 영역 (500px) */}
                <div className={`explorer-body ${viewMode}-view`} onContextMenu={event => openContextMenu(event)}>
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
                    ) : displayFiles.length === 0 ? (
                        <div className="center-msg empty">
                            <Folder size={48} strokeWidth={1} />
                            <p>{searchTerm.trim() ? '검색 결과가 없습니다.' : '이 폴더는 비어있습니다.'}</p>
                            <span>{searchTerm.trim() ? '검색어를 바꾸거나 지워주세요.' : '파일을 여기로 드래그하여 업로드하세요.'}</span>
                            {folderStack.length > 1 && (
                                <button className="back-btn" onClick={handleGoUp}>
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
                                {displayFiles.map((file, index) => (
                                    <div
                                        key={file.id}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={file.name}
                                        className={`file-item ${selectedFiles.some(f => f.id === file.id) ? 'selected' : ''} ${file.mimeType === 'application/vnd.google-apps.folder' ? 'is-folder' : ''} ${dragOverFolderId === file.id ? 'drag-target' : ''}`}
                                        onClick={(e) => handleItemClick(e, index)}
                                        onDoubleClick={() => handleItemDoubleClick(file)}
                                        onContextMenu={event => openContextMenu(event, file)}
                                        draggable={!renameState}
                                        aria-pressed={selectedFiles.some(f => f.id === file.id)}
                                        onKeyDown={event => {
                                            if (event.target !== event.currentTarget) return;
                                            if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); handleItemDoubleClick(file); }
                                            else if (event.key === ' ') { event.preventDefault(); event.stopPropagation(); toggleSelection(event, file); }
                                        }}
                                        onDragStart={(e) => handleInternalDragStart(e, file)}
                                        onDragOver={(e) => handleInternalDragOver(e, file)}
                                        onDrop={(e) => handleInternalDrop(e, file)}
                                    >
                                        {viewMode === 'list' ? (
                                            <>
                                                <div className="col-check" onClick={(e) => toggleSelection(e, file)} onDoubleClick={event => event.stopPropagation()}>
                                                    {selectedFiles.some(f => f.id === file.id) ?
                                                        <CheckCircle2 size={16} color="#1e293b" fill="#f1f5f9" /> :
                                                        <div className="dot"></div>
                                                    }
                                                </div>
                                                <div className="col-name">
                                                    {file.mimeType === 'application/vnd.google-apps.folder' ?
                                                        <Folder size={18} fill="#fbbf24" stroke="#d97706" /> :
                                                        <File size={18} color="#3b82f6" />
                                                    }
                                                    {renderFileName(file)}
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
                                                {renderFileName(file, 'grid-name')}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 드롭 안내 오버레이 (외부 파일 드래그 시에만 노출) */}
                    {isExternalDrag && (
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
                    {downloadProgress && <div className="drive-cache-status" role="status"><DownloadIcon size={12} /> 다운로드 준비: {downloadProgress}</div>}
                    <div className="drive-cache-status" role="status" title={driveCache.error || (driveCache.lastSynced ? `마지막 갱신: ${new Date(driveCache.lastSynced).toLocaleString()}` : '폴더·파일 목록을 기기에 저장해 빠르게 표시합니다.')}>
                        <RefreshCw size={12} className={driveCache.syncing ? 'spin' : ''} />
                        {formatDriveCacheStatus(driveCache)}
                    </div>
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
                                        <span className="meta-item"><Clock size={12} /> {selectedFiles[0].modifiedTime ? new Date(selectedFiles[0].modifiedTime).toLocaleString() : '수정일 정보 없음'}</span>
                                        <span className="dot"></span>
                                        <span className="meta-item bold">{selectedFiles[0].size ? formatFileSize(selectedFiles[0].size) : selectedFiles[0].mimeType === 'application/vnd.google-apps.folder' ? '폴더' : '크기 정보 없음'}</span>
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
                            <span>우클릭: 파일 작업 메뉴 · 더블 클릭: 열기 · F2: 이름 변경</span>
                        </div>
                    )}
                </div>
            </div>

            {contextMenu && <FileContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                label={contextTargets.length === 1 ? contextTargets[0].name : contextTargets.length ? `${contextTargets.length}개 항목 선택` : folderStack[folderStack.length - 1].name}
                items={contextActions}
                onClose={closeContextMenu}
            />}

            <style dangerouslySetInnerHTML={{
                __html: `
        .file-manager-wrapper {
          display: flex;
          justify-content: center;
          padding: 20px;
          height: 100%;
        }
        .file-manager-wrapper:focus { outline: none; }
        .file-manager-wrapper:focus-visible .file-manager-container { outline: 2px solid #93c5fd; outline-offset: 2px; }
        .file-manager-container {
          width: 100%;
          max-width: 900px;
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
          border: 2px solid #3b82f6;
          box-shadow: inset 0 0 0 2px #3b82f6, 0 10px 25px -5px rgba(59, 130, 246, 0.2);
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
          flex-wrap: wrap;
          gap: 12px;
        }
        .path-display {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 13px;
          color: #64748b;
          flex: 1;
          min-width: 0;
          flex-wrap: wrap;
        }
        .path-item { background: none; border: none; padding: 3px; font: inherit; color: inherit; overflow-wrap: anywhere; text-align: left; }
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
          padding: 4px 12px;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
          height: 32px;
        }
        .search-bar input {
          border: none;
          background: transparent;
          font-size: 13px;
          width: 130px;
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
          gap: 12px;
          flex-wrap: wrap;
        }
        .button-group {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
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
          white-space: nowrap;
        }

        /* Responsive Breakpoints for FileManager */
        @media (max-width: 1280px) {
          .main-toolbar { padding: 10px; }
          .tool-btn span { display: none; }
          .tool-btn.labeled-action span { display: inline; }
          .tool-btn { padding: 8px; }
          .divider { margin: 0 4px; }
          .search-bar input { width: 100px; }
        }

        @media (max-width: 1024px) {
          .explorer-header { padding: 10px; }
          .title-area { flex-direction: column; align-items: flex-start; gap: 10px; }
          .header-actions { width: 100%; justify-content: space-between; }
          .search-bar { flex: 1; }
          .main-toolbar { flex-direction: column; align-items: stretch; }
          .button-group { justify-content: space-between; margin-bottom: 10px; }
          .upload-zone { width: 100%; }
          .main-upload-btn { width: 100%; justify-content: center; }
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
          grid-template-columns: 36px minmax(0, 1fr) 90px 110px;
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
          grid-template-columns: 36px minmax(0, 1fr) 90px 110px;
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
        .file-item.drag-target {
          background: #dbeafe !important;
          border: 1px solid #3b82f6 !important;
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.3) !important;
          transform: scale(1.02);
          z-index: 10;
        }
        .file-item.is-folder { font-weight: 600; color: #1e293b; }
        .col-name { display: flex; align-items: center; gap: 8px; overflow: hidden; }
        .col-name > svg { flex-shrink: 0; }
        .col-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rename-field { min-width: 0; width: 100%; display: flex; flex-direction: column; gap: 4px; }
        .rename-input { width: 100%; min-width: 0; box-sizing: border-box; padding: 3px 5px; border: 1px solid #3b82f6; border-radius: 3px; background: white; color: #1e293b; font: inherit; outline: 2px solid #bfdbfe; user-select: text; }
        .rename-input[aria-invalid="true"] { border-color: #dc2626; outline-color: #fecaca; }
        .rename-input:disabled { opacity: 0.7; }
        .rename-field .rename-error { color: #b91c1c; font-size: 11px; white-space: normal; overflow-wrap: anywhere; }
        .rename-status { color: #64748b; font-size: 11px; }
        .col-size, .col-date { font-size: 11px; color: #64748b; }
        .col-check { display: flex; justify-content: center; }
        .dot { width: 5px; height: 5px; background: #cbd5e1; border-radius: 50%; }

        /* Grid View */
        .grid-view .scroll-content {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
          gap: 12px 10px;
          align-content: start;
        }
        .grid-view .file-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 8px 4px;
          text-align: center;
          background: transparent;
          border: 1px solid transparent;
          height: auto;
          min-height: 85px;
          position: relative;
          border-radius: 6px;
        }
        .grid-view .file-item:hover { background: #f1f5f9; border-color: #e2e8f0; }
        .grid-view .file-item.selected { background: #eff6ff; border-color: #3b82f6; box-shadow: inset 0 0 0 1px #3b82f6; }
        .grid-item-content { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; }
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
          min-height: 100px;
          background: #ffffff;
          border-top: 1px solid #e2e8f0;
          padding: 0 20px;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          justify-content: center;
          gap: 10px;
          padding-top: 12px;
          padding-bottom: 12px;
        }
        .drive-cache-status { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #64748b; }
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
        .nav-arrow-btn {
          background: none;
          border: 1px solid #e2e8f0;
          color: #64748b;
          padding: 6px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .nav-arrow-btn:hover:not(:disabled) { background: #f1f5f9; color: #1e293b; border-color: #cbd5e1; }
        .nav-arrow-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .divider.mini { width: 1px; height: 12px; background: #e2e8f0; margin: 0 4px; }
        .tool-btn.active { color: #3b82f6; background: #eff6ff; border-color: #bfdbfe; }
        .flip-v { transform: scaleY(-1); }
      `}} />
        </div>
    );
};

export default FileManager;

import { zip } from 'fflate';
import { getAccessToken, getFiles } from './driveService';
import { isSharedDriveItem } from './driveCacheService';

const FOLDER_TYPE = 'application/vnd.google-apps.folder';
const exportFormats = {
    'application/vnd.google-apps.document': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
    'application/vnd.google-apps.spreadsheet': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
    'application/vnd.google-apps.presentation': ['application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx'],
    'application/vnd.google-apps.drawing': ['application/pdf', '.pdf']
};

const safeName = name => name.replace(/[\\/:*?"<>|]/g, '_').replace(/[. ]+$/, '') || '이름 없음';

const saveBlob = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // 브라우저가 다운로드를 시작한 뒤 임시 URL을 해제합니다.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export const downloadSelection = async (items, onProgress = () => {}) => {
    if (!items.length) return;
    let token = await getAccessToken();
    const fetchFile = async file => {
        const format = exportFormats[file.mimeType];
        const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}${format ? '/export' : ''}`);
        if (format) url.searchParams.set('mimeType', format[0]);
        else {
            url.searchParams.set('alt', 'media');
            url.searchParams.set('supportsAllDrives', 'true');
        }
        let response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (response.status === 401) {
            token = await getAccessToken({ force: true });
            response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        }
        if (!response.ok) throw new Error(`'${file.name}' 다운로드 실패 (${response.status}). 권한 또는 파일 형식을 확인하세요.`);
        return new Uint8Array(await response.arrayBuffer());
    };
    const fileName = file => {
        const extension = exportFormats[file.mimeType]?.[1];
        const name = safeName(file.name);
        return extension && !name.toLowerCase().endsWith(extension) ? name + extension : name;
    };

    if (items.length === 1 && items[0].mimeType !== FOLDER_TYPE) {
        onProgress(items[0].name);
        const bytes = await fetchFile(items[0]);
        saveBlob(new Blob([bytes]), fileName(items[0]));
        return;
    }

    const archive = Object.create(null);
    const usedPaths = new Set();
    const uniquePath = (parent, name, isFolder) => {
        const dot = !isFolder ? name.lastIndexOf('.') : -1;
        const base = dot > 0 ? name.slice(0, dot) : name;
        const extension = dot > 0 ? name.slice(dot) : '';
        let candidate = parent + name;
        let counter = 1;
        while (usedPaths.has(candidate.toLocaleLowerCase())) candidate = `${parent}${base} (${counter++})${extension}`;
        usedPaths.add(candidate.toLocaleLowerCase());
        return candidate;
    };
    const addToArchive = async (file, parent, ancestors) => {
        const isFolder = file.mimeType === FOLDER_TYPE;
        const path = uniquePath(parent, isFolder ? safeName(file.name) : fileName(file), isFolder);
        onProgress(path);
        if (isFolder) {
            if (ancestors.has(file.id)) throw new Error(`'${file.name}' 폴더의 순환 경로를 확인하세요.`);
            archive[`${path}/`] = new Uint8Array();
            const children = await getFiles(file.id);
            const nextAncestors = new Set([...ancestors, file.id]);
            for (const child of children.filter(isSharedDriveItem)) await addToArchive(child, `${path}/`, nextAncestors);
        } else {
            archive[path] = await fetchFile(file);
        }
    };
    for (const file of items) await addToArchive(file, '', new Set());
    onProgress('ZIP 파일 생성 중…');
    const bytes = await new Promise((resolve, reject) => {
        zip(archive, { level: 0 }, (error, output) => error ? reject(error) : resolve(output));
    });
    saveBlob(new Blob([bytes], { type: 'application/zip' }), items.length === 1 ? `${safeName(items[0].name)}.zip` : '선택한 파일.zip');
};

import { getFiles } from './driveService';

export const DRIVE_ROOT_ID = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID || import.meta.env.GOOGLE_DRIVE_FOLDER_ID;
const CACHE_KEY = `jindan_drive_listing_v1:${DRIVE_ROOT_ID}`;
const MAX_AGE = 2 * 60 * 1000;
const FOLDER_TYPE = 'application/vnd.google-apps.folder';
const hiddenNames = new Set(['.system', 'resources', 'resouces']);
const listeners = new Set();
const pending = new Map();
const revisions = new Map();
let folders = {};
let loaded = false;
let activeRequests = 0;
let warming = null;
let status = { syncing: false, completed: 0, total: 0, cachedFolders: 0, lastSynced: null, error: '', persistent: true };

export const isSharedDriveItem = item => !hiddenNames.has(item.name.toLowerCase());

const publish = (changes = {}) => {
    status = { ...status, ...changes, cachedFolders: Object.keys(folders).length, syncing: activeRequests > 0 || Boolean(warming) };
    listeners.forEach(listener => listener());
};

const load = () => {
    if (loaded) return;
    loaded = true;
    try {
        const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (saved?.version === 1 && saved.rootId === DRIVE_ROOT_ID && saved.folders && typeof saved.folders === 'object') {
            folders = Object.fromEntries(Object.entries(saved.folders).filter(([, entry]) =>
                Number.isFinite(entry?.updatedAt) && Array.isArray(entry.files) &&
                entry.files.every(file => typeof file?.id === 'string' && typeof file?.name === 'string')
            ));
        }
    } catch {
        folders = {};
    }
    status = {
        ...status,
        cachedFolders: Object.keys(folders).length,
        lastSynced: Math.max(0, ...Object.values(folders).map(entry => entry.updatedAt)) || null
    };
};

const persist = () => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 1, rootId: DRIVE_ROOT_ID, folders }));
        status = { ...status, persistent: true };
    } catch {
        // 저장 공간이 부족해도 현재 실행 중에는 메모리 캐시를 계속 사용합니다.
        status = { ...status, persistent: false };
    }
};

export const subscribeDriveCache = listener => {
    load();
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const getDriveCacheStatus = () => {
    load();
    return status;
};

export const readCachedFolder = folderId => {
    load();
    return folders[folderId]?.files ?? null;
};

export const refreshDriveFolder = (folderId = DRIVE_ROOT_ID, { force = false } = {}) => {
    load();
    if (!folderId) return Promise.reject(new Error('공유 드라이브 경로가 설정되지 않았습니다.'));
    if (pending.has(folderId)) return pending.get(folderId);
    const cached = folders[folderId];
    if (!force && cached && Date.now() - cached.updatedAt < MAX_AGE) return Promise.resolve(cached.files);
    const revision = revisions.get(folderId) || 0;
    activeRequests++;
    publish();
    const request = getFiles(folderId).then(files => {
        // 이름 변경·삭제·이동 전에 시작한 조회 결과는 캐시에 반영하지 않습니다.
        if ((revisions.get(folderId) || 0) === revision) {
            folders[folderId] = { files: files.filter(isSharedDriveItem), updatedAt: Date.now() };
            persist();
        }
        publish({ error: '', lastSynced: Date.now() });
        return folders[folderId]?.files ?? [];
    }).catch(error => {
        publish({ error: `드라이브 연결 실패: ${error.message}` });
        throw error;
    }).finally(() => {
        pending.delete(folderId);
        activeRequests--;
        publish();
    });
    pending.set(folderId, request);
    return request;
};

// 목록만 미리 읽습니다. 보고서나 첨부 파일 본문은 다운로드하지 않습니다.
export const warmDriveCache = ({ force = false } = {}) => {
    load();
    if (warming) return warming;
    if (!DRIVE_ROOT_ID) {
        publish({ error: '공유 드라이브 경로가 설정되지 않았습니다.' });
        return Promise.resolve();
    }
    warming = (async () => {
        const queue = [DRIVE_ROOT_ID];
        const visited = new Set();
        const errors = [];
        publish({ completed: 0, total: 1, error: '' });
        while (queue.length) {
            const folderId = queue.shift();
            if (visited.has(folderId)) continue;
            visited.add(folderId);
            let files;
            try {
                files = await refreshDriveFolder(folderId, { force });
            } catch (error) {
                errors.push(error.message);
                files = readCachedFolder(folderId) || [];
            }
            for (const file of files) {
                if (file.mimeType === FOLDER_TYPE && !visited.has(file.id) && !queue.includes(file.id)) queue.push(file.id);
            }
            publish({ completed: visited.size, total: visited.size + queue.length });
            if (queue.length) await new Promise(resolve => setTimeout(resolve, 75));
        }
        if (!errors.length) {
            // 다른 사용자에게 삭제·이동된 폴더의 오래된 캐시도 제거합니다.
            for (const folderId of Object.keys(folders)) if (!visited.has(folderId)) delete folders[folderId];
            persist();
        }
        publish({ error: errors.length ? `일부 폴더 동기화 실패 (${errors.length}개): ${errors[0]}` : '', lastSynced: errors.length ? status.lastSynced : Date.now() });
    })().finally(() => {
        warming = null;
        publish();
    });
    publish();
    return warming;
};

const changeCachedFolders = change => {
    load();
    for (const [folderId, entry] of Object.entries(folders)) {
        const files = change(entry.files);
        if (files !== entry.files) {
            revisions.set(folderId, (revisions.get(folderId) || 0) + 1);
            folders[folderId] = { ...entry, files };
        }
    }
    persist();
    publish();
};

export const renameCachedItem = (id, name) => changeCachedFolders(files =>
    files.some(file => file.id === id) ? files.map(file => file.id === id ? { ...file, name } : file) : files
);

export const removeCachedItems = (ids, { discardFolders = true } = {}) => {
    const removed = new Set(ids);
    if (discardFolders) {
        for (const id of removed) {
            for (const file of folders[id]?.files || []) removed.add(file.id);
        }
    }
    changeCachedFolders(files => files.some(file => removed.has(file.id)) ? files.filter(file => !removed.has(file.id)) : files);
    // 삭제된 폴더의 이전 목록이 방문 기록에 다시 나타나지 않도록 합니다.
    if (discardFolders) {
        for (const id of removed) {
            delete folders[id];
            revisions.set(id, (revisions.get(id) || 0) + 1);
        }
    }
    persist();
    publish();
};

export const upsertCachedItem = (folderId, item) => {
    load();
    if (!isSharedDriveItem(item)) return;
    // 아직 조회하지 않은 폴더를 일부 항목만으로 완전한 목록처럼 저장하지 않습니다.
    if (!folders[folderId]) return;
    const files = folders[folderId].files;
    revisions.set(folderId, (revisions.get(folderId) || 0) + 1);
    folders[folderId] = {
        updatedAt: folders[folderId]?.updatedAt || 0,
        files: [...files.filter(file => file.id !== item.id), item]
    };
    persist();
    publish();
};

export const formatDriveCacheStatus = state => {
    if (state.syncing) return `드라이브 백그라운드 동기화 · ${state.completed}/${state.total}개 폴더 · 캐시 사용 중`;
    if (state.error) return state.cachedFolders ? `드라이브 연결 지연 · 저장된 캐시 사용 중 (${state.cachedFolders}개 폴더)` : '드라이브 연결 실패 · 동기화 재시도 필요';
    if (!state.persistent) return `드라이브 메모리 캐시 사용 중 · ${state.cachedFolders}개 폴더 (기기 저장 공간 부족)`;
    return state.cachedFolders ? `드라이브 캐시 준비됨 · ${state.cachedFolders}개 폴더` : '드라이브 캐시 준비 중';
};

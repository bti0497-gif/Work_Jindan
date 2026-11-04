/* 
 * ==========================================================================
 * [PROTECTION ZONE] DRIVE SERVICE ENGINE - CRITICAL
 * --------------------------------------------------------------------------
 */
import { getFiles, createFolder, uploadFile, deleteFile } from './driveService';

// 시스템 폴더 이름 정의
const SYSTEM_ROOT = '.system';
const JSON_DIR = 'json';
const RESOURCE_DIR = 'resources'; // 'resouces' 오타 가능성 방지 및 표준화

let systemFolderId = null;
let jsonFolderId = null;
let resourceFolderId = null;
let isInitializing = false;
let initPromise = null;
/* ========================================================================== */

// 시스템 폴더 구조 초기화
export const initSystemStorage = async (rootFolderId) => {
    // 중복 초기화 방지 (레이스 컨디션 해결)
    if (isInitializing) return initPromise;
    if (systemFolderId && jsonFolderId && resourceFolderId) return { jsonFolderId, resourceFolderId };

    isInitializing = true;
    initPromise = (async () => {
        try {
            console.log('Initializing system storage...');
            const rootFiles = await getFiles(rootFolderId);

            // 1. .system 폴더 확인 및 생성 (대소문자 무시 검색)
            let systemFolder = rootFiles.find(f =>
                f.name.toLowerCase() === SYSTEM_ROOT.toLowerCase() &&
                f.mimeType === 'application/vnd.google-apps.folder'
            );

            if (!systemFolder) {
                console.log('Creating system root folder...');
                systemFolder = await createFolder(SYSTEM_ROOT, rootFolderId);
            }
            systemFolderId = systemFolder.id;

            // 2. 하위 폴더 확인 및 생성 (json, resources)
            const systemFiles = await getFiles(systemFolderId);

            // JSON 폴더
            let jsonFolder = systemFiles.find(f => f.name.toLowerCase() === JSON_DIR.toLowerCase());
            if (!jsonFolder) {
                console.log('Creating JSON data folder...');
                jsonFolder = await createFolder(JSON_DIR, systemFolderId);
            }
            jsonFolderId = jsonFolder.id;

            // 리소스 폴더 (사용자가 언급한 'resouces' 오타 포함하여 검색)
            let resourceFolder = systemFiles.find(f =>
                f.name.toLowerCase() === RESOURCE_DIR.toLowerCase() ||
                f.name.toLowerCase() === 'resouces'
            );

            if (!resourceFolder) {
                console.log('Creating resources folder...');
                resourceFolder = await createFolder(RESOURCE_DIR, systemFolderId);
            } else if (resourceFolder.name === 'resouces') {
                // 기존에 오타로 생성된 폴더가 있다면 이름을 정정 (선택 사항)
                // await renameFile(resourceFolder.id, RESOURCE_DIR);
            }
            resourceFolderId = resourceFolder.id;

            console.log('System storage initialized successfully:', { systemFolderId, jsonFolderId, resourceFolderId });

            // 오래된 파일 정리 정책 실행 (7일 경과) - 백그라운드 진행
            cleanupOldData();

            return { jsonFolderId, resourceFolderId };
        } catch (err) {
            console.error('Failed to init system storage:', err);
            throw err;
        } finally {
            isInitializing = false;
        }
    })();

    return initPromise;
};

// 7일이 지난 데이터 삭제 정책
const cleanupOldData = async () => {
    if (!jsonFolderId) return;
    try {
        const files = await getFiles(jsonFolderId);
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

        const filesToDelete = files.filter(file => {
            if (file.name.startsWith('회원관리_')) return false;
            const modifiedTime = new Date(file.modifiedTime);
            return modifiedTime < sevenDaysAgo;
        });

        if (filesToDelete.length > 0) {
            console.log(`Cleaning up ${filesToDelete.length} old system files...`);
            // 병렬 삭제로 속도 향상
            await Promise.all(filesToDelete.map(file => deleteFile(file.id)));
            console.log('Data cleanup completed.');
        }
    } catch (err) {
        console.error('Data cleanup failed:', err);
    }
};

// JSON 데이터 저장 (DB 트랜잭션 로그처럼 활용)
export const saveJsonData = async (tableName, data) => {
    if (!jsonFolderId) throw new Error('System storage not initialized');

    // 파일명에 날짜와 랜덤 요소를 넣어 중복 방지 (일주일 후 삭제를 용이하게 함)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${tableName}_${timestamp}.json`;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const file = new File([blob], fileName);

    return await uploadFile(file, jsonFolderId);
};

// 최신 데이터 조회를 위한 파일 목록 가져오기
export const fetchTableLogs = async (tableName) => {
    if (!jsonFolderId) throw new Error('System storage not initialized');
    const allFiles = await getFiles(jsonFolderId);
    if (!tableName) return allFiles;
    return allFiles.filter(f => f.name.startsWith(`${tableName}_`));
};

// 리소스(첨부파일) 업로드
export const uploadResource = async (file) => {
    if (!resourceFolderId) throw new Error('System storage not initialized');
    return await uploadFile(file, resourceFolderId);
};

/**
 * 변경 이력(명령 로그) 저장
 * @param {string} op - 작업 종류 (CREATE, UPDATE, DELETE)
 * @param {string} tableName - 대상 테이블명
 * @param {string} id - 데이터 고유 ID
 */
export const saveActionLog = async (op, tableName, id) => {
    if (!jsonFolderId) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `ACTION_${timestamp}.json`;

    const actionData = {
        op,
        tableName,
        id,
        timestamp: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(actionData, null, 2)], { type: 'application/json' });
    const file = new File([blob], fileName);

    console.log(`Saving action log: ${op} for ${tableName} (ID: ${id})`);
    return await uploadFile(file, jsonFolderId);
};
// 시스템 폴더 ID 가져오기 (관리용)
export const getSystemFolderIds = () => ({
    systemFolderId,
    jsonFolderId,
    resourceFolderId
});

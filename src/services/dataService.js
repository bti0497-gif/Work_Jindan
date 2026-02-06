/* 
 * ==========================================================================
 * [PROTECTION ZONE] DRIVE SERVICE ENGINE - CRITICAL
 * --------------------------------------------------------------------------
 */
import { getFiles, createFolder, uploadFile, deleteFile } from './driveService';

// 시스템 폴더 이름 정의
const SYSTEM_ROOT = '.system';
const JSON_DIR = 'json';
const RESOURCE_DIR = 'resources';

let systemFolderId = null;
let jsonFolderId = null;
let resourceFolderId = null;
/* ========================================================================== */

// 시스템 폴더 구조 초기화
export const initSystemStorage = async (rootFolderId) => {
    try {
        console.log('Initializing system storage...');
        const rootFiles = await getFiles(rootFolderId);

        // 1. .system 폴더 확인 및 생성
        let systemFolder = rootFiles.find(f => f.name === SYSTEM_ROOT && f.mimeType === 'application/vnd.google-apps.folder');
        if (!systemFolder) {
            systemFolder = await createFolder(SYSTEM_ROOT, rootFolderId);
        }
        systemFolderId = systemFolder.id;

        // 2. 하위 폴더 확인 및 생성 (json, resources)
        const systemFiles = await getFiles(systemFolderId);

        let jsonFolder = systemFiles.find(f => f.name === JSON_DIR);
        if (!jsonFolder) jsonFolder = await createFolder(JSON_DIR, systemFolderId);
        jsonFolderId = jsonFolder.id;

        let resourceFolder = systemFiles.find(f => f.name === RESOURCE_DIR);
        if (!resourceFolder) resourceFolder = await createFolder(RESOURCE_DIR, systemFolderId);
        resourceFolderId = resourceFolder.id;

        console.log('System storage initialized:', { systemFolderId, jsonFolderId, resourceFolderId });

        // 오래된 파일 정리 정책 실행 (7일 경과)
        await cleanupOldData();

        return { jsonFolderId, resourceFolderId };
    } catch (err) {
        console.error('Failed to init system storage:', err);
        throw err;
    }
};

// 7일이 지난 데이터 삭제 정책
const cleanupOldData = async () => {
    if (!jsonFolderId) return;
    try {
        const files = await getFiles(jsonFolderId);
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

        for (const file of files) {
            const modifiedTime = new Date(file.modifiedTime);
            if (modifiedTime < sevenDaysAgo) {
                console.log(`Cleaning up old system file: ${file.name} (${file.modifiedTime})`);
                await deleteFile(file.id);
            }
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
    return allFiles.filter(f => f.name.startsWith(`${tableName}_`));
};

// 리소스(첨부파일) 업로드
export const uploadResource = async (file) => {
    if (!resourceFolderId) throw new Error('System storage not initialized');
    return await uploadFile(file, resourceFolderId);
};

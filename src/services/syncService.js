
import { getFiles, getFileContent } from './driveService';
import { dbService } from './dbService';
import { fetchTableLogs, getSystemFolderIds, saveJsonData, saveActionLog } from './dataService';
import { supabaseService } from './supabaseService';

/**
 * Supabase로 로컬 데이터 상향 동기화 (Push)
 */
export const pushLocalToSupabase = async () => {
    const queue = dbService.getSyncQueue();
    if (queue.length === 0) return;

    console.log(`Starting background sync to Supabase... (${queue.length} items)`);

    // 큐에 있는 항목들을 하나씩 처리
    for (const item of queue) {
        try {
            const { tableName, id } = item;
            const data = dbService.getById(tableName, id);
            
            if (data) {
                // Supabase에 저장
                await supabaseService.upsertData(tableName, data);
                
                // 구글 드라이브에도 백업 성격으로 저장 (기존 로직 유지)
                await saveJsonData(tableName, data);
                await saveActionLog('UPDATE', tableName, id);
            }
            
            // 성공하면 큐에서 제거
            dbService.removeFromSyncQueue(tableName, id);
        } catch (err) {
            console.warn('Background sync item failed (likely offline):', err);
            // 실패하면 큐에 남겨두고 다음 기회에 재시도
        }
    }
};

/**
 * 중앙 동기화 프로시저 (Sync Procedure)
 * 1. Supabase에서 최신 데이터를 가져와 로컬 DB 업데이트
 * 2. 구글 드라이브 (입력 로그) 동기화 (하이브리드 지원)
 */
export const syncAllData = async () => {
    try {
        const lastSync = dbService.getLastSync();
        
        // --- 1. Supabase에서 최신 데이터 가져오기 ---
        console.log('Syncing from Supabase...');
        const tables = ['회원관리', '프로젝트관리', '공정관리', '할일관리', '전체게시판', '게시판댓글'];
        
        for (const tableName of tables) {
            try {
                const cloudData = await supabaseService.fetchData(tableName);
                if (cloudData) {
                    // 클라우드 데이터를 로컬에 덮어쓰기 (Deleted items will disappear)
                    dbService.setTable(tableName, cloudData);
                    console.log(`Synced ${tableName}: ${cloudData.length} items from cloud.`);
                }
            } catch (sbErr) {
                console.warn(`Supabase fetch failed for ${tableName}:`, sbErr);
            }
        }

        // --- 2. 구글 드라이브 ACTION 로그 기반 증분 동기화 (기존 로직 - 하이브리드 백업용) ---
        const { jsonFolderId } = getSystemFolderIds();
        if (jsonFolderId) {
            const allFiles = await fetchTableLogs('');
            const actionLogs = allFiles
                .filter(f => f.name.startsWith('ACTION_'))
                .filter(f => new Date(f.modifiedTime) > new Date(lastSync))
                .sort((a, b) => a.modifiedTime.localeCompare(b.modifiedTime));

            if (actionLogs.length > 0) {
                // ... (기존 로그 처리 로직 동일하게 수행 가능)
            }
        }

        // --- 3. 로컬의 미동기화 데이터 상향 전송 ---
        await pushLocalToSupabase();

        // 4. 마지막 동기화 시각 업데이트
        dbService.setLastSync(new Date().toISOString());
        console.log('Global sync completed successfully.');
    } catch (err) {
        console.error('Sync failed:', err);
    }
};

/**
 * 특정 메뉴(테이블) 진입 시 실행되는 빠른 동기화
 * (App.jsx의 onMenuSelect 등에서 호출)
 */
export const syncMenuData = async (activeMenu) => {
    // 특정 테이블만 동기화하더라도 전체 ACTION 로그를 체크하는 것이 안전함
    // 하지만 우선은 전체 싱크 프로시저를 호출하는 것으로 구현
    await syncAllData();
};

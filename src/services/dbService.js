
/**
 * 로컬 데이터베이스 관리 서비스 (localStorage 기반 캐시)
 */

const STORAGE_KEY_PREFIX = 'jindan_db_';

export const dbService = {
    // 특정 테이블의 전체 데이터 가져오기
    getAll: (tableName) => {
        const data = localStorage.getItem(`${STORAGE_KEY_PREFIX}${tableName}`);
        return data ? JSON.parse(data) : [];
    },

    // 특정 데이터(ID기준) 가져오기
    getById: (tableName, id) => {
        const list = dbService.getAll(tableName);
        return list.find(item => item.id === id || item.person_id === id);
    },

    // 데이터 저장/업데이트
    save: (tableName, data) => {
        const currentList = dbService.getAll(tableName);
        const idKey = tableName === '회원관리' ? 'person_id' : 'id';
        const index = currentList.findIndex(item => item[idKey] === data[idKey]);

        let newList;
        if (index > -1) {
            newList = [...currentList];
            newList[index] = data;
        } else {
            newList = [...currentList, data];
        }

        localStorage.setItem(`${STORAGE_KEY_PREFIX}${tableName}`, JSON.stringify(newList));
        
        // 동기화 큐에 추가 (Supabase 동기화용)
        dbService.addToSyncQueue(tableName, data[idKey]);
        
        return newList;
    },

    // 동기화 큐 관리
    addToSyncQueue: (tableName, id) => {
        const queue = JSON.parse(localStorage.getItem('jindan_sync_queue') || '[]');
        // 중복 제거 후 추가
        const filtered = queue.filter(item => !(item.tableName === tableName && item.id === id));
        filtered.push({ tableName, id, timestamp: new Date().toISOString() });
        localStorage.setItem('jindan_sync_queue', JSON.stringify(filtered));
    },

    getSyncQueue: () => {
        return JSON.parse(localStorage.getItem('jindan_sync_queue') || '[]');
    },

    removeFromSyncQueue: (tableName, id) => {
        const queue = dbService.getSyncQueue();
        const newList = queue.filter(item => !(item.tableName === tableName && item.id === id));
        localStorage.setItem('jindan_sync_queue', JSON.stringify(newList));
    },

    // 데이터 삭제
    remove: (tableName, id) => {
        const currentList = dbService.getAll(tableName);
        const idKey = tableName === '회원관리' ? 'person_id' : 'id';
        const newList = currentList.filter(item => item[idKey] !== id);

        localStorage.setItem(`${STORAGE_KEY_PREFIX}${tableName}`, JSON.stringify(newList));
        return newList;
    },

    // 테이블 전체 교체 (Full Sync용)
    setTable: (tableName, list) => {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${tableName}`, JSON.stringify(list));
    },

    // 마지막 동기화 시간 관리
    getLastSync: () => {
        return localStorage.getItem('jindan_last_sync') || '1970-01-01T00:00:00Z';
    },

    setLastSync: (timestamp) => {
        localStorage.setItem('jindan_last_sync', timestamp || new Date().toISOString());
    }
};

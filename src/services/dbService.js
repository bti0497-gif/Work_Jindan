
/**
 * 로컬 데이터베이스 관리 서비스 (localStorage 기반 캐시)
 */

const STORAGE_KEY_PREFIX = 'jindan_db_';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const readRecords = raw => {
    if (!raw) return [];
    try {
        const value = JSON.parse(raw);
        if (Array.isArray(value)) return value.filter(isRecord);
        // 구버전 백업에는 전체 목록 대신 단일 저장 레코드가 들어갈 수 있다.
        if (isRecord(value) && (value.person_id != null || value.id != null)) return [value];
    } catch { /* 읽을 수 없는 캐시도 원본은 그대로 보존한다. */ }
    return [];
};

const writeRecords = (key, records) => {
    if (!Array.isArray(records) || !records.every(isRecord)) {
        throw new TypeError('저장할 데이터는 레코드 배열이어야 합니다.');
    }
    const previous = localStorage.getItem(key);
    if (previous) {
        let canonical = false;
        try {
            const value = JSON.parse(previous);
            canonical = Array.isArray(value) && value.every(isRecord);
        } catch { /* 비표준 캐시는 덮어쓰기 전에 별도로 보관한다. */ }
        if (!canonical) {
            localStorage.setItem(`${key}_backup_${crypto.randomUUID()}`, previous);
        }
    }
    localStorage.setItem(key, JSON.stringify(records));
};

export const dbService = {
    // 특정 테이블의 전체 데이터 가져오기
    getAll: (tableName) => {
        const data = localStorage.getItem(`${STORAGE_KEY_PREFIX}${tableName}`);
        return readRecords(data);
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

        writeRecords(`${STORAGE_KEY_PREFIX}${tableName}`, newList);
        
        // 동기화 큐에 추가 (Supabase 동기화용)
        dbService.addToSyncQueue(tableName, data[idKey]);
        
        return newList;
    },

    // 동기화 큐 관리
    addToSyncQueue: (tableName, id) => {
        const queue = dbService.getSyncQueue();
        // 중복 제거 후 추가
        const filtered = queue.filter(item => !(item.tableName === tableName && item.id === id));
        filtered.push({ tableName, id, timestamp: new Date().toISOString() });
        writeRecords('jindan_sync_queue', filtered);
    },

    getSyncQueue: () => {
        return readRecords(localStorage.getItem('jindan_sync_queue'));
    },

    removeFromSyncQueue: (tableName, id) => {
        const queue = dbService.getSyncQueue();
        const newList = queue.filter(item => !(item.tableName === tableName && item.id === id));
        writeRecords('jindan_sync_queue', newList);
    },

    // 데이터 삭제
    remove: (tableName, id) => {
        const currentList = dbService.getAll(tableName);
        const idKey = tableName === '회원관리' ? 'person_id' : 'id';
        const newList = currentList.filter(item => item[idKey] !== id);

        writeRecords(`${STORAGE_KEY_PREFIX}${tableName}`, newList);
        return newList;
    },

    // 테이블 전체 교체 (Full Sync용)
    setTable: (tableName, list) => {
        writeRecords(`${STORAGE_KEY_PREFIX}${tableName}`, list);
    },

    // 마지막 동기화 시간 관리
    getLastSync: () => {
        return localStorage.getItem('jindan_last_sync') || '1970-01-01T00:00:00Z';
    },

    setLastSync: (timestamp) => {
        localStorage.setItem('jindan_last_sync', timestamp || new Date().toISOString());
    }
};

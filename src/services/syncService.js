import { dbService } from './dbService';
import { firebaseWorkService } from './firebaseWorkService';
import { WORK_TABLES, isWorkTable, mergeWorkRecords } from './workModel';

let pushing;
export const pushLocalToFirebase = () => {
    if (pushing) return pushing;
    pushing = (async () => {
        const failures = [];
        for (const item of dbService.getSyncQueue().filter(item => isWorkTable(item.tableName))) {
            try {
                if (item.operation === 'delete') await firebaseWorkService.deleteData(item.tableName, item.id);
                else {
                    const data = dbService.getById(item.tableName, item.id);
                    if (!data) continue; // Legacy missing records are not inferred as deletions.
                    await firebaseWorkService.upsertData(item.tableName, data);
                }
                dbService.removeFromSyncQueue(item.tableName, item.id, item);
            } catch (error) { failures.push(`${item.tableName}: ${error.message}`); }
        }
        if (failures.length) throw new Error(failures.join('\n'));
    })().finally(() => { pushing = null; });
    return pushing;
};

export const syncAllData = async () => {
    const failures = [];
    // Upload first and protect any still-pending local changes when merging.
    try { await pushLocalToFirebase(); } catch (error) { failures.push(error.message); }
    for (const table of WORK_TABLES) {
        try {
            const records = await firebaseWorkService.fetchData(table);
            const pending = dbService.getSyncQueue().filter(item => item.tableName === table);
            dbService.setTable(table, mergeWorkRecords(dbService.getAll(table), records, pending, table === '할일관리'));
        } catch (error) { failures.push(`${table}: ${error.message}`); }
    }
    if (failures.length) throw new Error(failures.join('\n'));
    dbService.setLastSync(new Date().toISOString());
};
export const syncMenuData = () => syncAllData();

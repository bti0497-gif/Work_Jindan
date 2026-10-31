import { collection, doc, getDocsFromServer, query, runTransaction, where } from 'firebase/firestore';
import { getFirebase } from './firebaseClient';
import { getBoardUser } from './firebaseBoardAuth';
import { WORK_COLLECTIONS, assertWorkId, assertWorkTable, makeWorkRecord } from './workModel';

const requireUser = async () => {
    const user = await getBoardUser();
    if (!user) throw new Error('Firebase에 로그인해 주세요.');
    return user;
};
const ref = (table, id) => { assertWorkTable(table); assertWorkId(id); return doc(getFirebase().db, WORK_COLLECTIONS[table], id); };
const unpack = snapshot => ({ ...snapshot.data(), id: snapshot.id });
export const firebaseWorkService = {
    fetchData: async table => {
        assertWorkTable(table);
        const user = await requireUser(), records = collection(getFirebase().db, WORK_COLLECTIONS[table]);
        const snapshots = table === '할일관리'
            ? await Promise.all([getDocsFromServer(query(records, where('isPublic', '==', true))), getDocsFromServer(query(records, where('authorId', '==', user.person_id)))])
            : [await getDocsFromServer(records)];
        return [...new Map(snapshots.flatMap(snapshot => snapshot.docs.map(unpack)).map(row => [row.id, row])).values()];
    },
    upsertData: async (table, input) => {
        assertWorkTable(table); assertWorkId(input.id);
        const user = await requireUser();
        return runTransaction(getFirebase().db, async transaction => {
            const target = ref(table, input.id), current = await transaction.get(target);
            const record = makeWorkRecord(table, input, user, current.exists() ? unpack(current) : null);
            transaction.set(target, record);
            return record;
        });
    },
    deleteData: async (table, id) => {
        assertWorkTable(table); assertWorkId(id); await requireUser();
        await runTransaction(getFirebase().db, async transaction => {
            const target = ref(table, id), current = await transaction.get(target);
            if (!current.exists() || current.data().deleted) return;
            transaction.update(target, { deleted: true, updatedAt: new Date().toISOString() });
        });
    },
};

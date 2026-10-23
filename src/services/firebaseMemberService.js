import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, deleteUser, initializeAuth, inMemoryPersistence, signOut } from 'firebase/auth';
import { collection, doc, getDocsFromServer, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { getFirebase } from './firebaseClient';
import { getBoardUser } from './firebaseBoardAuth';
import { dbService } from './dbService';
import { authPasswordForId, loginEmailForId } from './firebaseIdentity';

const requireAdmin = async () => {
    const user = await getBoardUser();
    if (user?.role !== 'admin') throw new Error('관리자만 회원 계정을 관리할 수 있습니다.');
    return user;
};
const normalize = (uid, data) => ({
    ...data, uid, firebaseUid: uid,
    person_id: data.person_id,
    role: Number(data.userLevel) === 0 ? 'admin' : 'user',
});
const cache = member => {
    const members = dbService.getAll('회원관리');
    const previous = members.findIndex(item => item.firebaseUid === member.uid || item.person_id === member.person_id || (member.email && item.email === member.email));
    if (previous >= 0) members[previous] = { ...members[previous], ...member };
    else members.push(member);
    dbService.setTable('회원관리', members);
};

export const firebaseMemberService = {
    list: async () => {
        await requireAdmin();
        const snapshot = await getDocsFromServer(collection(getFirebase().db, 'jindan_members'));
        const members = snapshot.docs.map(item => normalize(item.id, item.data())).filter(item => item.isActive === true);
        members.forEach(cache);
        return members;
    },
    save: async (input, existing) => {
        await requireAdmin();
        const { auth, db } = getFirebase();
        const data = {
            person_id: input.person_id.trim(), name: input.name.trim(),
            position: input.position,
            userLevel: input.role === 'admin' ? 0 : 2, isActive: true,
            updatedAt: new Date().toISOString(),
        };
        if (!data.name || !data.person_id) throw new Error('아이디와 이름을 입력해 주세요.');
        if (existing) {
            if (data.person_id !== existing.person_id) throw new Error('아이디는 변경할 수 없습니다.');
            await updateDoc(doc(db, 'jindan_members', existing.uid), data);
            cache(normalize(existing.uid, { ...existing, ...data }));
            return;
        }
        if (!input.password) throw new Error('초기 비밀번호를 입력해 주세요.');
        const [email, password] = await Promise.all([loginEmailForId(data.person_id), authPasswordForId(data.person_id, input.password)]);
        // 보조 Auth 인스턴스를 사용해 새 계정을 만들어도 관리자 세션은 유지한다.
        const secondary = initializeApp(auth.app.options, `member-${crypto.randomUUID()}`);
        let created;
        try {
            const provisionAuth = initializeAuth(secondary, { persistence: inMemoryPersistence });
            created = (await createUserWithEmailAndPassword(provisionAuth, email, password)).user;
            const profile = { ...data, uid: created.uid, createdAt: new Date().toISOString() };
            try { await setDoc(doc(db, 'jindan_members', created.uid), profile); }
            catch (error) { await deleteUser(created); throw error; }
            cache(normalize(created.uid, profile));
            await signOut(provisionAuth);
        } catch (error) {
            if (error.code === 'auth/email-already-in-use') throw new Error('이미 존재하는 아이디입니다.');
            throw error;
        } finally { await deleteApp(secondary); }
    },
    deactivate: async members => {
        const admin = await requireAdmin();
        if (members.some(member => member.uid === admin.uid)) throw new Error('현재 로그인한 관리자 계정은 삭제할 수 없습니다.');
        const batch = writeBatch(getFirebase().db);
        for (const member of members) batch.update(doc(getFirebase().db, 'jindan_members', member.uid), { isActive: false, updatedAt: new Date().toISOString() });
        await batch.commit();
    },
};

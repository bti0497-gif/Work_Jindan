import { EmailAuthProvider, reauthenticateWithCredential, signInWithEmailAndPassword, signOut, updatePassword } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { getFirebase } from './firebaseClient';
import { authPasswordForId, loginEmailForId } from './firebaseIdentity';

const toBoardUser = (user, profile) => ({
    uid: user.uid,
    email: profile.email || '',
    person_id: profile.person_id,
    name: profile.name || user.displayName || user.email,
    position: profile.position || '',
    role: Number(profile.userLevel) === 0 ? 'admin' : 'user',
});

export const getBoardUser = async () => {
    const { auth, db } = getFirebase();
    await auth.authStateReady();
    if (!auth.currentUser) return null;
    const profile = await getDocFromServer(doc(db, 'jindan_members', auth.currentUser.uid));
    if (!profile.exists() || profile.data().isActive !== true) {
        throw new Error('게시판 이용 권한이 없습니다. 관리자에게 문의해 주세요.');
    }
    return toBoardUser(auth.currentUser, profile.data());
};

export const loginBoard = async (personId, password) => {
    const { auth } = getFirebase();
    try {
        const [email, credential] = await Promise.all([loginEmailForId(personId), authPasswordForId(personId, password)]);
        await signInWithEmailAndPassword(auth, email, credential);
        return await getBoardUser();
    } catch (error) {
        await signOut(auth);
        if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password', 'auth/invalid-email'].includes(error.code)) {
            throw new Error('아이디 또는 비밀번호를 확인해 주세요.');
        }
        if (error.code === 'auth/network-request-failed') throw new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
        if (error.code === 'auth/too-many-requests') throw new Error('로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.');
        throw error;
    }
};

export const logoutBoard = () => signOut(getFirebase().auth);

export const changeOwnPassword = async (oldPassword, newPassword) => {
    const user = await getBoardUser();
    if (!user) throw new Error('다시 로그인해 주세요.');
    if (newPassword.length < 4) throw new Error('새 비밀번호는 4자 이상 입력해 주세요.');
    const { auth } = getFirebase();
    const [oldCredential, nextCredential] = await Promise.all([
        authPasswordForId(user.person_id, oldPassword), authPasswordForId(user.person_id, newPassword),
    ]);
    try {
        await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, oldCredential));
        await updatePassword(auth.currentUser, nextCredential);
    } catch (error) {
        if (['auth/invalid-credential', 'auth/wrong-password'].includes(error.code)) throw new Error('현재 비밀번호가 맞지 않습니다.');
        throw error;
    }
};

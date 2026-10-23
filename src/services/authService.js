import { dbService } from './dbService';
import { getBoardUser, loginBoard, logoutBoard } from './firebaseBoardAuth';

const saveSession = user => {
    if (!user) {
        sessionStorage.removeItem('currentUser');
        return null;
    }
    // 기존 업무 배정 ID를 유지하고 Firebase 계정으로 인증한다.
    const local = dbService.getAll('회원관리').find(member =>
        member.firebaseUid === user.uid || member.person_id === user.person_id ||
        (user.email && member.email?.toLowerCase() === user.email.toLowerCase()));
    const merged = { ...local, ...user, firebaseUid: user.uid, person_id: local?.person_id || user.person_id };
    delete merged.password;
    sessionStorage.setItem('currentUser', JSON.stringify(merged));
    return merged;
};

export const login = async (personId, password) => saveSession(await loginBoard(personId, password));
export const restoreSession = async () => saveSession(await getBoardUser());
export const logout = async () => {
    sessionStorage.removeItem('currentUser');
    await logoutBoard();
};
export const getCurrentUser = () => {
    const raw = sessionStorage.getItem('currentUser');
    if (!raw) return null;
    const user = JSON.parse(raw);
    return user.firebaseUid ? user : null;
};

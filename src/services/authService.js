import { dbService } from './dbService';
import { getBoardUser, loginBoard, logoutBoard } from './firebaseBoardAuth';

const saveSession = user => {
    if (!user) {
        sessionStorage.removeItem('currentUser');
        return null;
    }
    // 기존 업무 배정 ID를 유지하고 Firebase 계정으로 인증한다.
    let local;
    try {
        local = dbService.getAll('회원관리').find(member =>
            (user.uid && member.firebaseUid === user.uid) ||
            (user.person_id && member.person_id === user.person_id) ||
            (user.email && typeof member.email === 'string' && member.email.toLowerCase() === user.email.toLowerCase()));
    } catch {
        // 부가 업무정보 캐시의 읽기 실패가 서버에서 인증한 로그인을 막지 않도록 한다.
        console.warn('로컬 회원정보를 읽지 못해 서버 회원정보로 로그인합니다.');
    }
    const merged = { ...local, ...user, firebaseUid: user.uid, person_id: user.person_id || local?.person_id };
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

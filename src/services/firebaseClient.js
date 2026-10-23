import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const getFirebase = () => {
    if (!config.apiKey || !config.projectId || !config.appId) {
        throw new Error('Firebase 게시판 연결 설정이 없습니다. 관리자에게 문의해 주세요.');
    }
    const app = getApps().length ? getApp() : initializeApp(config);
    return { auth: getAuth(app), db: getFirestore(app) };
};

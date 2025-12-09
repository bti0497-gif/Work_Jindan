/**
 * 관리자 계정 생성 스크립트 (Firebase 버전)
 * 
 * 용도: 
 * - 초기 관리자 계정 생성
 * - Firebase Authentication + Firestore에 계정 생성
 * 
 * 실행방법:
 * node scripts/create-admin.js
 * 
 * 생성되는 계정:
 * - 이메일: admin@thezone.com
 * - 비밀번호: admin123!
 * - 권한: Level 0 (최고관리자)
 * 
 * 주의사항:
 * - Firebase Admin SDK 서비스 계정 키가 필요합니다
 * - .env.local에 Firebase 설정이 있어야 합니다
 */

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

// Firebase Admin 초기화
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const auth = admin.auth();
const db = admin.firestore();

async function createAdminUser() {
  try {
    console.log('🌱 관리자 계정 생성을 시작합니다...');

    const adminEmail = 'admin@thezone.com';
    const adminPassword = 'admin123!';

    // Firebase Authentication에 사용자 생성
    let user;
    try {
      user = await auth.createUser({
        email: adminEmail,
        password: adminPassword,
        displayName: 'Administrator',
      });
      console.log('✅ Firebase Authentication에 Admin 계정이 생성되었습니다.');
    } catch (error) {
      if (error.code === 'auth/email-already-exists') {
        console.log('ℹ️  Admin 계정이 이미 존재합니다. 기존 계정을 사용합니다.');
        user = await auth.getUserByEmail(adminEmail);
      } else {
        throw error;
      }
    }

    // Firestore에 사용자 정보 저장
    await db.collection('users').doc(user.uid).set({
      email: adminEmail,
      name: 'Administrator',
      phone: null,
      position: 'System Admin',
      userLevel: 0, // 최고관리자
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    console.log('✅ Firestore에 관리자 정보가 저장되었습니다.');
    console.log('');
    console.log('🎉 관리자 계정 생성이 완료되었습니다!');
    console.log('📧 Admin 이메일: admin@thezone.com');
    console.log('🔑 Admin 비밀번호: admin123!');
    console.log('🌐 개발 서버: http://localhost:3000');

  } catch (error) {
    console.error('❌ 관리자 계정 생성 중 오류 발생:', error);
    process.exit(1);
  }
}

createAdminUser();
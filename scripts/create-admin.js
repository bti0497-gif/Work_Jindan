/**
 * 관리자 계정 생성 스크립트 (SQLite + Prisma 버전)
 * 
 * 용도: 
 * - 초기 관리자 계정 생성
 * - 로컬 SQLite DB에 계정 생성
 * 
 * 실행방법:
 * node scripts/create-admin.js
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    console.log('🌱 관리자 계정 생성을 시작합니다...');

    const adminEmail = 'admin@thezone.com';
    const adminPassword = 'admin123!';

    // 기존 사용자 확인
    const existingUser = await prisma.user.findUnique({
      where: { email: adminEmail }
    });

    if (existingUser) {
      console.log('ℹ️  Admin 계정이 이미 존재합니다.');
      
      // 필요한 경우 등급 업데이트
      if (existingUser.userLevel !== 0) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { userLevel: 0 }
        });
        console.log('✅ 기존 계정의 관리자 권한을 복구했습니다.');
      }
    } else {
      // 새 관리자 계정 생성
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      await prisma.user.create({
        data: {
          email: adminEmail,
          password: hashedPassword,
          name: 'Administrator',
          position: 'System Admin',
          userLevel: 0, // 최고관리자
          isActive: true
        }
      });
      console.log('✅ Admin 계정이 생성되었습니다.');
    }

    console.log('');
    console.log('🎉 관리자 계정 설정이 완료되었습니다!');
    console.log('📧 Admin 이메일: admin@thezone.com');
    console.log('🔑 Admin 비밀번호: admin123!');

  } catch (error) {
    console.error('❌ 관리자 계정 생성 중 오류 발생:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdminUser();
/**
 * 관리자 계정 생성 스크립트
 * 
 * 용도: 
 * - 초기 관리자 계정 생성 (이미 완료됨)
 * - 데이터베이스 초기화 시 재사용 가능
 * - 새로운 환경 구축시 활용
 * 
 * 실행방법:
 * node scripts/create-admin.js
 * 
 * 생성되는 계정:
 * - 이메일: admin@teamcollab.com
 * - 비밀번호: admin
 * - 권한: Level 0 (최고관리자)
 * 
 * 주의사항:
 * - 이미 관리자 계정이 존재하는 경우 권한만 업데이트됩니다
 * - 프로덕션 환경에서는 반드시 비밀번호를 변경하세요
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedDatabase() {
  try {
    console.log('🌱 데이터베이스 시드 작업을 시작합니다...');

    // 기존 admin 사용자 확인
    const existingAdmin = await prisma.user.findUnique({
      where: { email: 'admin@teamcollab.com' }
    });

    if (existingAdmin) {
      // 기존 admin의 권한을 최고관리자로 업데이트
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: { userLevel: 0 }
      });
      console.log('✅ 기존 Admin 사용자 권한이 업데이트되었습니다.');
    } else {
      // 새 admin 사용자 생성 (ID를 이메일과 동일하게 설정)
      const hashedPassword = await bcrypt.hash('admin', 12);
      
      const adminUser = await prisma.user.create({
        data: {
          id: 'admin@teamcollab.com', // ID를 이메일과 동일하게 설정
          email: 'admin@teamcollab.com',
          name: 'Administrator',
          password: hashedPassword,
          userLevel: 0, // 최고관리자
          isActive: true
        },
      });

      console.log('✅ Admin 사용자가 생성되었습니다.');
      console.log('📁 기본 설정이 완료되었습니다.');
    }

    console.log('');
    console.log('🎉 시드 작업이 완료되었습니다!');
    console.log('📧 Admin 이메일: admin@teamcollab.com');
    console.log('🔑 Admin 비밀번호: admin');
    console.log('🌐 개발 서버: http://localhost:3000');

  } catch (error) {
    console.error('❌ 시드 작업 중 오류 발생:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedDatabase();
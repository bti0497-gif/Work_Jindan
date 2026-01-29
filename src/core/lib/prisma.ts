import { PrismaClient } from '@prisma/client';

// Prisma Client 싱글톤 패턴
declare global {
  var __prisma: PrismaClient | undefined;
}

// 개발 환경에서는 Hot Reload로 인한 재생성을 방지
// 프로덕션에서는 매번 새로운 인스턴스 생성
const prisma = globalThis.__prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV === 'development') {
  globalThis.__prisma = prisma;
}

export default prisma;

// 연결 해제 헬퍼 함수
export const disconnectPrisma = async () => {
  await prisma.$disconnect();
};

// 트랜잭션 헬퍼 함수
export const executeTransaction = async <T>(
  fn: (prisma: PrismaClient) => Promise<T>
): Promise<T> => {
  try {
    const result = await fn(prisma);
    return result;
  } catch (error) {
    console.error('Transaction error:', error);
    throw error;
  }
};

// 건강성 체크 함수
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
};
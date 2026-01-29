import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // 최고관리자만 접근 가능
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email! }
    });

    // TypeScript 오류 무시하고 런타임에서 체크
    if (!currentUser || (currentUser as any).userLevel !== 0) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { userId, reason } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: '사용자 ID가 필요합니다.' }, { status: 400 });
    }

    // 대상 사용자 조회
    const targetUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!targetUser) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 최고관리자는 수정 불가
    if ((targetUser as any).userLevel === 0) {
      return NextResponse.json({ error: '최고관리자는 수정할 수 없습니다.' }, { status: 400 });
    }

    const newActiveStatus = !(targetUser as any).isActive;

    // 트랜잭션으로 사용자 상태 변경 및 로그 기록
    await prisma.$transaction(async (tx) => {
      // 사용자 상태 변경
      await (tx.user as any).update({
        where: { id: userId },
        data: { isActive: newActiveStatus }
      });

      // 관리 로그 기록
      await (tx as any).userManagementLog.create({
        data: {
          managerId: currentUser.id,
          targetUserId: userId,
          action: newActiveStatus ? 'ACTIVATE' : 'DEACTIVATE',
          oldValue: (targetUser as any).isActive ? 'active' : 'inactive',
          newValue: newActiveStatus ? 'active' : 'inactive',
          reason: reason || null
        }
      });
    });

    return NextResponse.json({ 
      message: `사용자가 ${newActiveStatus ? '활성화' : '비활성화'}되었습니다.`,
      isActive: newActiveStatus 
    });
  } catch (error) {
    console.error('사용자 상태 변경 오류:', error);
    return NextResponse.json(
      { error: '사용자 상태 변경 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

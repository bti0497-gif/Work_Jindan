import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

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

    if (!currentUser || currentUser.userLevel !== 0) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { userId, newLevel, reason } = await request.json();

    if (!userId || newLevel === undefined) {
      return NextResponse.json({ error: '필수 정보가 누락되었습니다.' }, { status: 400 });
    }

    // 대상 사용자 조회
    const targetUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!targetUser) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 최고관리자는 수정 불가
    if (targetUser.userLevel === 0) {
      return NextResponse.json({ error: '최고관리자는 수정할 수 없습니다.' }, { status: 400 });
    }

    // 등급이 동일한 경우
    if (targetUser.userLevel === newLevel) {
      return NextResponse.json({ error: '이미 동일한 등급입니다.' }, { status: 400 });
    }

    // 트랜잭션으로 사용자 등급 변경 및 로그 기록
    const result = await prisma.$transaction(async (tx) => {
      // 사용자 등급 변경
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { userLevel: newLevel }
      });

      // 로그 기록
      await tx.userManagementLog.create({
        data: {
          managerId: currentUser.id,
          targetUserId: userId,
          action: 'LEVEL_CHANGE',
          oldValue: targetUser.userLevel.toString(),
          newValue: newLevel.toString(),
          reason: reason || '관리자에 의한 등급 변경'
        }
      });

      return updatedUser;
    });

    return NextResponse.json({
      message: '사용자 등급이 변경되었습니다.',
      user: result
    });

  } catch (error) {
    console.error('등급 변경 오류:', error);
    return NextResponse.json(
      { error: '등급 변경 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

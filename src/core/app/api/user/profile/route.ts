import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { name, phone, position } = await request.json();

    // 입력 검증
    if (!name || name.trim().length < 2 || name.trim().length > 20) {
      return NextResponse.json(
        { error: '이름은 2자 이상 20자 이하로 입력해주세요.' },
        { status: 400 }
      );
    }

    if (position && position.trim().length > 50) {
      return NextResponse.json(
        { error: '직책은 50자 이하로 입력해주세요.' },
        { status: 400 }
      );
    }

    // 전화번호 형식 검증 (입력된 경우)
    if (phone && phone.trim()) {
      const phoneRegex = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/;
      if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
        return NextResponse.json(
          { error: '올바른 전화번호 형식이 아닙니다.' },
          { status: 400 }
        );
      }
    }

    // 사용자 정보 업데이트
    const updatedUser = await prisma.user.update({
      where: { email: session.user.email },
      data: {
        name: name.trim(),
        phone: phone ? phone.trim() : null,
        position: position ? position.trim() : null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        position: true,
        userLevel: true,
        avatar: true,
      },
    });

    return NextResponse.json({
      message: '프로필이 성공적으로 업데이트되었습니다.',
      user: updatedUser,
    });
  } catch (error) {
    console.error('프로필 업데이트 오류:', error);
    return NextResponse.json(
      { error: '프로필 업데이트 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

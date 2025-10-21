import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';



export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // 최고관리자만 접근 가능
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email! }
    });

    if (!currentUser || (currentUser as any).userLevel !== 0) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    // 모든 사용자 조회 (게시글, 댓글 수 포함)
    const users = await (prisma.user as any).findMany({
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        position: true,
        userLevel: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            posts: true,
            comments: true,
          }
        }
      },
      orderBy: [
        { userLevel: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('사용자 목록 조회 오류:', error);
    return NextResponse.json(
      { error: '사용자 목록을 조회할 수 없습니다.' },
      { status: 500 }
    );
  }
}
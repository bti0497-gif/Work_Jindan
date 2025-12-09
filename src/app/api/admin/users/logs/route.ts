import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';



export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: '?�증???�요?�니??' }, { status: 401 });
    }

    // 최고관리자�??�근 가??
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email! }
    });

    if (!currentUser || (currentUser as any).userLevel !== 0) {
      return NextResponse.json({ error: '권한???�습?�다.' }, { status: 403 });
    }

    // 관�?로그 조회
    const logs = await (prisma as any).userManagementLog.findMany({
      select: {
        id: true,
        action: true,
        oldValue: true,
        newValue: true,
        reason: true,
        createdAt: true,
        manager: {
          select: {
            name: true,
            email: true
          }
        },
        targetUser: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100 // 최근 100개만
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('관�?로그 조회 ?�류:', error);
    return NextResponse.json(
      { error: '관�?로그�?조회?????�습?�다.' },
      { status: 500 }
    );
  }
}
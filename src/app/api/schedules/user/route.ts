import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// 사용자 일정 목록 조회
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    
    // 특정 날짜 조회 또는 오늘 날짜
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const schedules = await prisma.userSchedule.findMany({
      where: {
        date: {
          gte: targetDate,
          lt: nextDate,
        },
        OR: [
          { userId: session.user.id }, // 자신의 일정
          { isTeamEvent: true }        // 팀 일정
        ]
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            position: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    return NextResponse.json({
      schedules: schedules,
      date: targetDate.toISOString().split('T')[0]
    });

  } catch (error) {
    console.error('사용자 일정 조회 오류:', error);
    return NextResponse.json(
      { error: '일정을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 사용자 일정 생성
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { title, description, date, isTeamEvent } = body;

    if (!title || !date) {
      return NextResponse.json(
        { error: '제목과 날짜는 필수입니다.' },
        { status: 400 }
      );
    }

    // 팀 일정은 관리자만 생성 가능
    if (isTeamEvent && (session.user.userLevel ?? 2) > 1) {
      return NextResponse.json(
        { error: '팀 일정은 관리자만 생성할 수 있습니다.' },
        { status: 403 }
      );
    }

    const schedule = await prisma.userSchedule.create({
      data: {
        title,
        description,
        date: new Date(date),
        isTeamEvent: Boolean(isTeamEvent),
        userId: session.user.id,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            position: true
          }
        }
      }
    });

    return NextResponse.json(schedule);

  } catch (error) {
    console.error('일정 생성 오류:', error);
    return NextResponse.json(
      { error: '일정을 생성하는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
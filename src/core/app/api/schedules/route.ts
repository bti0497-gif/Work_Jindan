import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// 프로젝트별 일정 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: '프로젝트 ID가 필요합니다.' }, { status: 400 });
    }

    const schedules = await prisma.schedule.findMany({
      where: {
        projectId: projectId,
      },
      orderBy: {
        startDate: 'asc',
      },
    });

    return NextResponse.json(schedules);
  } catch (error) {
    console.error('일정 조회 오류:', error);
    return NextResponse.json(
      { error: '일정을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 일정 생성
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, startDate, endDate, projectId, isNotice, priority } = body;

    if (!title || !startDate || !endDate || !projectId) {
      return NextResponse.json(
        { error: '필수 항목이 누락되었습니다.' },
        { status: 400 }
      );
    }

    // 공지 일정 권한 체크 (관리자만 가능)
    if (isNotice && session.user.userLevel > 1) {
      return NextResponse.json(
        { error: '공지 일정 등록 권한이 없습니다.' },
        { status: 403 }
      );
    }

    const schedule = await prisma.schedule.create({
      data: {
        title,
        description,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        projectId,
        isNotice: isNotice || false,
        priority: priority || 'normal',
        createdBy: session.user.id,
      },
    });

    return NextResponse.json(schedule);
  } catch (error) {
    console.error('일정 생성 오류:', error);
    return NextResponse.json(
      { error: '일정 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

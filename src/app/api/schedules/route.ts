import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// 프로젝트별 일정 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: '프로젝트 ID가 필요합니다' }, { status: 400 });
    }

    // 사용자가 해당 프로젝트의 멤버인지 확인
    const projectMember = await prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: session.user.id
      }
    });

    if (!projectMember) {
      return NextResponse.json({ error: '프로젝트 접근 권한이 없습니다' }, { status: 403 });
    }

    const schedules = await prisma.schedule.findMany({
      where: { projectId },
      orderBy: { startDate: 'asc' }
    });

    return NextResponse.json({ schedules });

  } catch (error) {
    console.error('일정 조회 오류:', error);
    return NextResponse.json(
      { error: '일정을 불러오는 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}

// 새 일정 생성
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const { title, description, startDate, endDate, projectId } = await request.json();

    if (!title || !startDate || !endDate || !projectId) {
      return NextResponse.json({ 
        error: '제목, 시작일, 종료일, 프로젝트 ID는 필수입니다' 
      }, { status: 400 });
    }

    // 사용자가 해당 프로젝트의 멤버인지 확인
    const projectMember = await prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: session.user.id
      }
    });

    if (!projectMember) {
      return NextResponse.json({ error: '프로젝트 접근 권한이 없습니다' }, { status: 403 });
    }

    const schedule = await prisma.schedule.create({
      data: {
        title,
        description,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        projectId
      }
    });

    return NextResponse.json({ 
      success: true, 
      schedule 
    });

  } catch (error) {
    console.error('일정 생성 오류:', error);
    return NextResponse.json(
      { error: '일정 생성 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
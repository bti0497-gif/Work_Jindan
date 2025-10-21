import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';



// 마일스톤 목록 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: '프로젝트 ID가 필요합니다.' }, { status: 400 });
    }

    // 사용자가 프로젝트에 접근 권한이 있는지 확인
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: user.id },
          { 
            members: {
              some: {
                userId: user.id
              }
            }
          }
        ]
      }
    });

    if (!project) {
      return NextResponse.json({ error: '프로젝트에 접근 권한이 없습니다.' }, { status: 403 });
    }

    // 마일스톤 조회 (order 순으로 정렬)
    const milestones = await prisma.milestone.findMany({
      where: { projectId },
      orderBy: [
        { order: 'asc' },
        { startDate: 'asc' }
      ]
    });

    return NextResponse.json({ milestones });

  } catch (error) {
    console.error('마일스톤 목록 조회 오류:', error);
    return NextResponse.json(
      { error: '마일스톤 목록을 조회하는데 실패했습니다.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// 새 마일스톤 생성
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { title, description, startDate, endDate, status, projectId, order } = await request.json();

    if (!title || !title.trim()) {
      return NextResponse.json({ error: '마일스톤 제목은 필수입니다.' }, { status: 400 });
    }

    if (!startDate || !endDate) {
      return NextResponse.json({ error: '시작일과 종료일은 필수입니다.' }, { status: 400 });
    }

    if (!projectId) {
      return NextResponse.json({ error: '프로젝트 ID는 필수입니다.' }, { status: 400 });
    }

    // 사용자가 프로젝트에 접근 권한이 있는지 확인
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: user.id },
          { 
            members: {
              some: {
                userId: user.id
              }
            }
          }
        ]
      },
      include: {
        members: {
          where: { userId: user.id },
          select: { role: true }
        }
      }
    });

    if (!project) {
      return NextResponse.json({ error: '프로젝트에 접근 권한이 없습니다.' }, { status: 403 });
    }

    // 레벨 2 이상 사용자만 마일스톤 생성 가능 (어드민과 매니저)
    if (user.userLevel > 2) {
      return NextResponse.json({ error: '마일스톤 생성 권한이 없습니다. (레벨 2 이상 필요)' }, { status: 403 });
    }

    // 날짜 유효성 검사
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start >= end) {
      return NextResponse.json({ error: '종료일은 시작일보다 늦어야 합니다.' }, { status: 400 });
    }

    // 마일스톤 생성
    const milestone = await prisma.milestone.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        status: status || 'NOT_STARTED',
        progress: 0,
        projectId,
        order: order || 1,
      }
    });

    return NextResponse.json({ 
      milestone,
      message: '마일스톤이 성공적으로 생성되었습니다.' 
    }, { status: 201 });

  } catch (error) {
    console.error('마일스톤 생성 오류:', error);
    return NextResponse.json(
      { error: '마일스톤 생성에 실패했습니다.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
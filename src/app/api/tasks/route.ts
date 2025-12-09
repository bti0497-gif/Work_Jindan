import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// 프로젝트별 작업 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: '프로젝트 ID가 필요합니다' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다' }, { status: 404 });
    }

    // 사용자가 해당 프로젝트의 멤버인지 확인
    const projectMember = await prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: user.id
      }
    });

    if (!projectMember) {
      return NextResponse.json({ error: '프로젝트 접근 권한이 없습니다' }, { status: 403 });
    }

    const tasks = await prisma.task.findMany({
      where: { projectId },
      include: {
        assignee: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ tasks });

  } catch (error) {
    console.error('작업 조회 오류:', error);
    return NextResponse.json(
      { error: '작업을 불러오는 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}

// 새 작업 생성
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다' }, { status: 404 });
    }

    const { title, description, priority, dueDate, projectId, assigneeId } = await request.json();

    if (!title || !projectId) {
      return NextResponse.json({ 
        error: '제목과 프로젝트 ID는 필수입니다' 
      }, { status: 400 });
    }

    // 사용자가 해당 프로젝트의 멤버인지 확인
    const projectMember = await prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: user.id
      }
    });

    if (!projectMember) {
      return NextResponse.json({ error: '프로젝트 접근 권한이 없습니다' }, { status: 403 });
    }

    // 담당자가 지정되지 않은 경우 현재 사용자로 설정
    const finalAssigneeId = assigneeId || user.id;

    const task = await prisma.task.create({
      data: {
        title,
        description,
        priority: priority || 'medium',
        dueDate: dueDate ? new Date(dueDate) : null,
        projectId,
        assigneeId: finalAssigneeId,
        status: 'todo'
      },
      include: {
        assignee: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    return NextResponse.json({ 
      success: true, 
      task 
    });

  } catch (error) {
    console.error('작업 생성 오류:', error);
    return NextResponse.json(
      { error: '작업 생성 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}

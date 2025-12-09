import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';



// 작업 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const taskId = id;
    const { title, description, status, priority, dueDate, assigneeId } = await request.json();

    // 작업이 존재하는지 확인
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: { include: { members: true } } }
    });

    if (!existingTask) {
      return NextResponse.json({ error: '작업을 찾을 수 없습니다' }, { status: 404 });
    }

    // 사용자가 해당 프로젝트의 멤버인지 확인
    const isProjectMember = existingTask.project.members.some(
      member => member.userId === session.user.id
    );

    if (!isProjectMember) {
      return NextResponse.json({ error: '프로젝트 접근 권한이 없습니다' }, { status: 403 });
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        title,
        description,
        status,
        priority,
        dueDate: dueDate ? new Date(dueDate) : null,
        assigneeId
      },
      include: {
        assignee: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    return NextResponse.json({ 
      success: true, 
      task: updatedTask 
    });

  } catch (error) {
    console.error('작업 수정 오류:', error);
    return NextResponse.json(
      { error: '작업 수정 중 오류가 발생했습니다' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// 작업 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const taskId = id;

    // 작업이 존재하는지 확인
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: { include: { members: true } } }
    });

    if (!existingTask) {
      return NextResponse.json({ error: '작업을 찾을 수 없습니다' }, { status: 404 });
    }

    // 사용자가 해당 프로젝트의 멤버인지 확인
    const isProjectMember = existingTask.project.members.some(
      member => member.userId === session.user.id
    );

    if (!isProjectMember) {
      return NextResponse.json({ error: '프로젝트 접근 권한이 없습니다' }, { status: 403 });
    }

    await prisma.task.delete({
      where: { id: taskId }
    });

    return NextResponse.json({ 
      success: true,
      message: '작업이 삭제되었습니다'
    });

  } catch (error) {
    console.error('작업 삭제 오류:', error);
    return NextResponse.json(
      { error: '작업 삭제 중 오류가 발생했습니다' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// 일정 수정 (PATCH 메소드로 변경)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const scheduleId = params.id;
    const { title, description, startDate, endDate } = await request.json();

    // 일정이 존재하는지 확인
    const existingSchedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { project: { include: { members: true } } }
    });

    if (!existingSchedule) {
      return NextResponse.json({ error: '일정을 찾을 수 없습니다' }, { status: 404 });
    }

    // 사용자가 해당 프로젝트의 멤버인지 확인
    const isProjectMember = existingSchedule.project.members.some(
      member => member.userId === session.user.id
    );

    if (!isProjectMember) {
      return NextResponse.json({ error: '프로젝트 접근 권한이 없습니다' }, { status: 403 });
    }

    // 업데이트할 데이터 준비
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = new Date(endDate);

    const updatedSchedule = await prisma.schedule.update({
      where: { id: scheduleId },
      data: updateData
    });

    return NextResponse.json({ 
      success: true, 
      schedule: updatedSchedule 
    });

  } catch (error) {
    console.error('일정 수정 오류:', error);
    return NextResponse.json(
      { error: '일정 수정 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}

// 일정 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const scheduleId = params.id;

    // 일정이 존재하는지 확인
    const existingSchedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { project: { include: { members: true } } }
    });

    if (!existingSchedule) {
      return NextResponse.json({ error: '일정을 찾을 수 없습니다' }, { status: 404 });
    }

    // 사용자가 해당 프로젝트의 멤버인지 확인
    const isProjectMember = existingSchedule.project.members.some(
      member => member.userId === session.user.id
    );

    if (!isProjectMember) {
      return NextResponse.json({ error: '프로젝트 접근 권한이 없습니다' }, { status: 403 });
    }

    await prisma.schedule.delete({
      where: { id: scheduleId }
    });

    return NextResponse.json({ 
      success: true,
      message: '일정이 삭제되었습니다'
    });

  } catch (error) {
    console.error('일정 삭제 오류:', error);
    return NextResponse.json(
      { error: '일정 삭제 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
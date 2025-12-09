import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';



// 특정 일정 조회
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const schedule = await prisma.userSchedule.findUnique({
      where: { id: id },
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

    if (!schedule) {
      return NextResponse.json(
        { error: '일정을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 본인 일정이거나 팀 일정만 조회 가능
    if (schedule.userId !== session.user.id && !schedule.isTeamEvent) {
      return NextResponse.json(
        { error: '일정에 접근할 권한이 없습니다.' },
        { status: 403 }
      );
    }

    return NextResponse.json(schedule);

  } catch (error) {
    console.error('일정 조회 오류:', error);
    return NextResponse.json(
      { error: '일정을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 일정 수정
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const schedule = await prisma.userSchedule.findUnique({
      where: { id: id }
    });

    if (!schedule) {
      return NextResponse.json(
        { error: '일정을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 본인 일정이거나 관리자만 수정 가능
    const isAdmin = (session.user.userLevel ?? 2) <= 1;
    if (schedule.userId !== session.user.id && !isAdmin) {
      return NextResponse.json(
        { error: '일정을 수정할 권한이 없습니다.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, description, date, isCompleted, isTeamEvent } = body;

    // 팀 일정 설정은 관리자만 가능
    if (isTeamEvent !== undefined && !isAdmin) {
      return NextResponse.json(
        { error: '팀 일정 설정은 관리자만 가능합니다.' },
        { status: 403 }
      );
    }

    const updatedSchedule = await prisma.userSchedule.update({
      where: { id: id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(date !== undefined && { date: new Date(date) }),
        ...(isCompleted !== undefined && { isCompleted }),
        ...(isTeamEvent !== undefined && { isTeamEvent }),
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

    return NextResponse.json(updatedSchedule);

  } catch (error) {
    console.error('일정 수정 오류:', error);
    return NextResponse.json(
      { error: '일정을 수정하는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 일정 삭제
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const schedule = await prisma.userSchedule.findUnique({
      where: { id: id }
    });

    if (!schedule) {
      return NextResponse.json(
        { error: '일정을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 본인 일정이거나 관리자만 삭제 가능
    const isAdmin = (session.user.userLevel ?? 2) <= 1;
    if (schedule.userId !== session.user.id && !isAdmin) {
      return NextResponse.json(
        { error: '일정을 삭제할 권한이 없습니다.' },
        { status: 403 }
      );
    }

    await prisma.userSchedule.delete({
      where: { id: id }
    });

    return NextResponse.json({ message: '일정이 삭제되었습니다.' });

  } catch (error) {
    console.error('일정 삭제 오류:', error);
    return NextResponse.json(
      { error: '일정을 삭제하는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
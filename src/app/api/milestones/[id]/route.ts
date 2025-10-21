import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';



// 특정 마일스톤 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const milestone = await prisma.milestone.findUnique({
      where: { id: params.id },
      include: {
        project: {
          include: {
            members: true
          }
        }
      }
    });

    if (!milestone) {
      return NextResponse.json({ error: '마일스톤을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 사용자가 프로젝트에 접근 권한이 있는지 확인
    const hasAccess = milestone.project.ownerId === user.id || 
                     milestone.project.members.some(member => member.userId === user.id);

    if (!hasAccess) {
      return NextResponse.json({ error: '마일스톤에 접근 권한이 없습니다.' }, { status: 403 });
    }

    return NextResponse.json({ milestone });

  } catch (error) {
    console.error('마일스톤 조회 오류:', error);
    return NextResponse.json(
      { error: '마일스톤 조회에 실패했습니다.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// 마일스톤 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { title, description, startDate, endDate, status, progress } = await request.json();

    if (!title || !title.trim()) {
      return NextResponse.json({ error: '마일스톤 제목은 필수입니다.' }, { status: 400 });
    }

    // 마일스톤 존재 여부 및 권한 확인
    const existingMilestone = await prisma.milestone.findUnique({
      where: { id: params.id },
      include: {
        project: {
          include: {
            members: true
          }
        }
      }
    });

    if (!existingMilestone) {
      return NextResponse.json({ error: '마일스톤을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 사용자가 프로젝트에 접근 권한이 있는지 확인
    const hasAccess = existingMilestone.project.ownerId === user.id || 
                     existingMilestone.project.members.some(member => member.userId === user.id);

    if (!hasAccess) {
      return NextResponse.json({ error: '마일스톤을 수정할 권한이 없습니다.' }, { status: 403 });
    }

    // 날짜 유효성 검사
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (start >= end) {
        return NextResponse.json({ error: '종료일은 시작일보다 늦어야 합니다.' }, { status: 400 });
      }
    }

    // 진행률 자동 조정 (상태에 따라)
    let finalProgress = progress;
    if (status === 'COMPLETED' && progress < 100) {
      finalProgress = 100;
    } else if (status === 'NOT_STARTED' && progress > 0) {
      finalProgress = 0;
    }

    // 마일스톤 수정
    const updatedMilestone = await prisma.milestone.update({
      where: { id: params.id },
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        status: status || undefined,
        progress: finalProgress !== undefined ? Math.max(0, Math.min(100, finalProgress)) : undefined,
        updatedAt: new Date(),
      }
    });

    return NextResponse.json({ 
      milestone: updatedMilestone,
      message: '마일스톤이 성공적으로 수정되었습니다.' 
    });

  } catch (error) {
    console.error('마일스톤 수정 오류:', error);
    return NextResponse.json(
      { error: '마일스톤 수정에 실패했습니다.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// 마일스톤 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // 마일스톤 존재 여부 및 권한 확인
    const milestone = await prisma.milestone.findUnique({
      where: { id: params.id },
      include: {
        project: {
          include: {
            members: true
          }
        }
      }
    });

    if (!milestone) {
      return NextResponse.json({ error: '마일스톤을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 사용자가 프로젝트에 접근 권한이 있는지 확인 (소유자이거나 관리자)
    const hasDeletePermission = milestone.project.ownerId === user.id ||
                               milestone.project.members.some(member => 
                                 member.userId === user.id && member.role === 'ADMIN'
                               );

    if (!hasDeletePermission) {
      return NextResponse.json({ error: '마일스톤을 삭제할 권한이 없습니다.' }, { status: 403 });
    }

    // 마일스톤 삭제
    await prisma.milestone.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ 
      message: '마일스톤이 성공적으로 삭제되었습니다.' 
    });

  } catch (error) {
    console.error('마일스톤 삭제 오류:', error);
    return NextResponse.json(
      { error: '마일스톤 삭제에 실패했습니다.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
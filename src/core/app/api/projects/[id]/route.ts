import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';



// 특정 프로젝트 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              }
            }
          }
        },
        _count: {
          select: {
            schedules: true,
            tasks: true,
            files: true,
          }
        }
      }
    });

    if (!project) {
      return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 사용자가 프로젝트에 접근 권한이 있는지 확인
    const hasAccess = project.ownerId === user.id || 
                     project.members.some(member => member.userId === user.id);

    if (!hasAccess) {
      return NextResponse.json({ error: '프로젝트에 접근 권한이 없습니다.' }, { status: 403 });
    }

    return NextResponse.json({
      ...project,
      memberCount: project.members.length + 1, // 소유자 포함
      scheduleCount: project._count.schedules,
      taskCount: project._count.tasks,
      fileCount: project._count.files,
    });

  } catch (error) {
    console.error('프로젝트 조회 오류:', error);
    return NextResponse.json(
      { error: '프로젝트 조회에 실패했습니다.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// 프로젝트 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { 
      name, 
      description, 
      color,
      facilityType,
      facilityName,
      address,
      diagnosisType,
      startDate,
      endDate,
      contactPerson,
      contactPhone,
      contactEmail,
      specialNotes,
      status
    } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: '프로젝트 이름은 필수입니다.' }, { status: 400 });
    }

    const { id } = await params;
    
    // 프로젝트 존재 여부 및 권한 확인
    const existingProject = await prisma.project.findUnique({
      where: { id },
      include: {
        members: true
      }
    });

    if (!existingProject) {
      return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 소유자이거나 관리자 권한이 있는지 확인
    const hasEditPermission = existingProject.ownerId === user.id ||
                             existingProject.members.some(member => 
                               member.userId === user.id && member.role === 'ADMIN'
                             );

    if (!hasEditPermission) {
      return NextResponse.json({ error: '프로젝트를 수정할 권한이 없습니다.' }, { status: 403 });
    }

    // 프로젝트 수정
    const updatedProject = await prisma.project.update({
      where: { id },
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        color: color || existingProject.color,
        // 처리장 정보
        facilityType: facilityType?.trim() || null,
        facilityName: facilityName?.trim() || null,
        address: address?.trim() || null,
        // 진단 정보
        diagnosisType: diagnosisType?.trim() || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        // 연락처 정보
        contactPerson: contactPerson?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        contactEmail: contactEmail?.trim() || null,
        // 특별 사항
        specialNotes: specialNotes?.trim() || null,
        status: status || existingProject.status,
        updatedAt: new Date(),
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        _count: {
          select: {
            members: true,
          }
        }
      }
    });

    return NextResponse.json({ 
      success: true,
      data: {
        ...updatedProject,
        memberCount: updatedProject._count.members + 1, // 소유자 포함
      },
      message: '프로젝트가 성공적으로 수정되었습니다.' 
    });

  } catch (error) {
    console.error('프로젝트 수정 오류:', error);
    return NextResponse.json(
      { error: '프로젝트 수정에 실패했습니다.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// 프로젝트 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;

    // 프로젝트 존재 여부 및 소유자 확인
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (project.ownerId !== user.id) {
      return NextResponse.json({ error: '프로젝트를 삭제할 권한이 없습니다. 소유자만 삭제할 수 있습니다.' }, { status: 403 });
    }

    // 트랜잭션으로 프로젝트 및 관련 데이터 삭제
    await prisma.$transaction(async (tx) => {
      // 프로젝트 멤버 삭제
      await tx.projectMember.deleteMany({
        where: { projectId: id }
      });

      // 프로젝트 스케줄 삭제
      await tx.schedule.deleteMany({
        where: { projectId: id }
      });

      // 프로젝트 태스크 삭제
      await tx.task.deleteMany({
        where: { projectId: id }
      });

      // 프로젝트 파일 삭제
      await tx.projectFile.deleteMany({
        where: { projectId: id }
      });

      // 프로젝트 메시지 삭제
      await tx.message.deleteMany({
        where: { projectId: id }
      });

      // 마지막으로 프로젝트 삭제
      await tx.project.delete({
        where: { id }
      });
    });

    return NextResponse.json({ 
      success: true,
      data: null,
      message: '프로젝트가 성공적으로 삭제되었습니다.' 
    });

  } catch (error) {
    console.error('프로젝트 삭제 오류:', error);
    return NextResponse.json(
      { error: '프로젝트 삭제에 실패했습니다.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
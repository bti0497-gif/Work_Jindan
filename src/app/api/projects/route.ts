import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// 프로젝트 목록 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    const where: any = {};
    
    if (search && search.trim()) {
      const searchLower = search.trim();
      where.OR = [
        { name: { contains: searchLower } },
        { description: { contains: searchLower } },
        { facilityName: { contains: searchLower } },
      ];
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              }
            }
          }
        },
        _count: {
          select: {
            tasks: true,
            milestones: true,
            schedules: true,
            files: true,
            members: true,
          }
        }
      },
      orderBy: { updatedAt: 'desc' },
    });

    const formattedProjects = projects.map(project => ({
      ...project,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      startDate: project.startDate?.toISOString() || null,
      endDate: project.endDate?.toISOString() || null,
    }));

    return NextResponse.json({ 
        success: true, 
        data: formattedProjects 
    });
  } catch (error) {
    console.error('프로젝트 조회 오류:', error);
    return NextResponse.json(
      { error: '프로젝트 조회 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}

// 프로젝트 생성
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, facilityName, address, startDate, endDate } = body;

    if (!name) {
        return NextResponse.json({ error: '프로젝트 이름이 필요합니다' }, { status: 400 });
    }

    const userId = session.user.id;

    // Use transaction to create project and add owner as member
    const newProject = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name,
          description,
          facilityName,
          address,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          status: '준비중', // Default status from schema
          ownerId: userId,
        }
      });

      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: userId,
          role: 'ADMIN', // specific role string used in your system
          specialty: '총괄'
        }
      });

      return project;
    });

    // Re-fetch to get included data
    const fullProject = await prisma.project.findUnique({
      where: { id: newProject.id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true, 
              }
            }
          }
        },
        _count: {
          select: {
            tasks: true,
            milestones: true,
            schedules: true,
            files: true,
            members: true,
          }
        }
      }
    });

    return NextResponse.json({
        project: fullProject
    }, { status: 201 });

  } catch (error) {
    console.error('프로젝트 생성 오류:', error);
    return NextResponse.json(
      { error: '프로젝트 생성 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}

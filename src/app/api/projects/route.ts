import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';



// 프로젝트 목록 조회 (사용자가 속한 프로젝트들)
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

    // 검색어 가져오기
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    // 모든 프로젝트를 조회할 수 있도록 수정 (권한 제한 없음)
    let whereCondition: any = {};

    // 검색어가 있는 경우 필터링
    if (search && search.trim()) {
      whereCondition = {
        OR: [
          { name: { contains: search.trim() } },
          { description: { contains: search.trim() } },
          { facilityName: { contains: search.trim() } }
        ]
      };
    }

    // 모든 프로젝트를 조회 (권한 제한 없음)
    const projects = await prisma.project.findMany({
      where: whereCondition,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        members: {
          select: {
            id: true,
            role: true,
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
            members: true,
            schedules: true,
            tasks: true,
            files: true,
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    // 멤버 수를 포함한 프로젝트 데이터 변환
    const projectsWithMemberCount = projects.map(project => ({
      id: project.id,
      name: project.name,
      description: project.description,
      color: project.color,
      status: project.status,
      startDate: project.startDate,
      endDate: project.endDate,
      facilityType: project.facilityType,
      facilityName: project.facilityName,
      address: project.address,
      diagnosisType: project.diagnosisType,
      contactPerson: project.contactPerson,
      contactPhone: project.contactPhone,
      contactEmail: project.contactEmail,
      specialNotes: project.specialNotes,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      ownerId: project.ownerId,
      owner: project.owner,
      members: project.members,
      memberCount: project._count.members + 1, // 소유자 포함
      scheduleCount: project._count.schedules,
      taskCount: project._count.tasks,
      fileCount: project._count.files,
    }));

    return NextResponse.json({ 
      success: true,
      data: projectsWithMemberCount // useCRUD 훅에서 기대하는 형식
    });

  } catch (error) {
    console.error('프로젝트 목록 조회 오류:', error);
    return NextResponse.json(
      { error: '프로젝트 목록을 조회하는데 실패했습니다.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// 새 프로젝트 생성
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

    // 프로젝트 생성
    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        color: color || '#3B82F6',
        ownerId: user.id,
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
        status: status || '준비중',
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
        ...project,
        memberCount: project._count.members + 1, // 소유자 포함
      },
      message: '프로젝트가 성공적으로 생성되었습니다.' 
    }, { status: 201 });

  } catch (error) {
    console.error('프로젝트 생성 오류:', error);
    return NextResponse.json(
      { error: '프로젝트 생성에 실패했습니다.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
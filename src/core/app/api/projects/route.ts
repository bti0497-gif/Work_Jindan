import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// 프로젝트 목록 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    const projectsRef = adminDb.collection('projects');
    const snapshot = await projectsRef.get();

    let projects = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        owner: data.owner || { name: 'Unknown', email: '' },
        members: data.members || [],
        createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
        updatedAt: data.updatedAt ? data.updatedAt.toDate() : new Date(),
        _count: {
            tasks: 0,
            milestones: 0,
            schedules: 0,
            files: 0,
            members: (data.members || []).length,
        }
      };
    });

    if (search && search.trim()) {
      const searchLower = search.trim().toLowerCase();
      projects = projects.filter((p: any) => 
        p.name?.toLowerCase().includes(searchLower) || 
        p.description?.toLowerCase().includes(searchLower) ||
        p.facilityName?.toLowerCase().includes(searchLower)
      );
    }

    projects.sort((a: any, b: any) => b.updatedAt - a.updatedAt);

    return NextResponse.json({ 
        success: true, 
        data: projects 
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
    const { name, description, facilityName, location, startDate, endDate } = body;

    if (!name) {
        return NextResponse.json({ error: '프로젝트 이름이 필요합니다' }, { status: 400 });
    }

    const newProjectRef = adminDb.collection('projects').doc();
    const now = new Date();

    const projectData = {
        id: newProjectRef.id,
        name,
        description,
        facilityName,
        location,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: 'PLANNING',
        owner: {
            email: session.user.email,
            name: session.user.name,
            image: session.user.image,
            id: session.user.id
        },
        members: [
            {
                user: {
                    email: session.user.email,
                    name: session.user.name,
                    image: session.user.image,
                    id: session.user.id
                },
                role: 'ADMIN'
            }
        ],
        createdAt: now,
        updatedAt: now
    };

    await newProjectRef.set(projectData);

    return NextResponse.json({
        project: {
            ...projectData,
            _count: {
                tasks: 0,
                milestones: 0,
                schedules: 0,
                files: 0,
                members: 1
            }
        }
    }, { status: 201 });

  } catch (error) {
    console.error('프로젝트 생성 오류:', error);
    return NextResponse.json(
      { error: '프로젝트 생성 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}

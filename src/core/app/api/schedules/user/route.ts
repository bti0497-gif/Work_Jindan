import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { adminDb } from '@/lib/firebase-admin';

// 사용자 일정 목록 조회
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    
    // 일정 날짜 조회 또는 오늘 날짜
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const schedulesRef = adminDb.collection('schedules');
    
    // Query: All schedules for the date (filtering in memory to avoid composite index requirement)
    const schedulesSnapshot = await schedulesRef
        .where('date', '>=', targetDate)
        .where('date', '<', nextDate)
        .get();

    const schedulesMap = new Map();

    schedulesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        // Filter: My schedules OR Team schedules
        if (data.userId === session.user.id || data.isTeamEvent === true) {
            schedulesMap.set(doc.id, { id: doc.id, ...data });
        }
    });

    let schedules = Array.from(schedulesMap.values()).map((data: any) => ({
        ...data,
        date: data.date.toDate(),
        createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
        updatedAt: data.updatedAt ? data.updatedAt.toDate() : new Date(),
        user: data.user || {
             id: data.userId,
             name: 'User',
             avatar: null
        }
    }));

    // Sort by createdAt
    schedules.sort((a: any, b: any) => a.createdAt - b.createdAt);

    return NextResponse.json({
      schedules: schedules,
      date: targetDate.toISOString().split('T')[0]
    });

  } catch (error) {
    console.error('사용자 일정 조회 오류:', error);
    return NextResponse.json(
      { error: '일정을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 사용자 일정 생성
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { title, description, date, isTeamEvent } = body;

    if (!title || !date) {
      return NextResponse.json(
        { error: '제목과 날짜는 필수입니다.' },
        { status: 400 }
      );
    }

    const newScheduleRef = adminDb.collection('schedules').doc();
    const now = new Date();
    const scheduleDate = new Date(date);

    const scheduleData = {
        id: newScheduleRef.id,
        title,
        description,
        date: scheduleDate,
        isTeamEvent: !!isTeamEvent,
        userId: session.user.id,
        isCompleted: false,
        createdAt: now,
        updatedAt: now,
        user: {
            id: session.user.id,
            name: session.user.name,
            image: session.user.image
        }
    };

    await newScheduleRef.set(scheduleData);

    return NextResponse.json({
        ...scheduleData,
        date: scheduleDate.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
    });

  } catch (error) {
    console.error('일정 생성 오류:', error);
    return NextResponse.json(
      { error: '일정 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

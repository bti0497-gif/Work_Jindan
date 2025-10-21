import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// 온라인 사용자 목록 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    // 최근 5분 이내에 활동한 사용자를 온라인으로 간주
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const onlineUsers = await prisma.user.findMany({
      where: {
        lastSeen: {
          gte: fiveMinutesAgo
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        userLevel: true,
        position: true,
        lastSeen: true,
        createdAt: true
      },
      orderBy: {
        lastSeen: 'desc'
      }
    });

    // 사용자 상태 계산
    const usersWithStatus = onlineUsers.map(user => {
      const now = new Date();
      const lastSeen = new Date(user.lastSeen || user.createdAt);
      const minutesAgo = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60));
      
      let status = 'offline';
      let lastSeenText = '오프라인';
      
      if (minutesAgo <= 1) {
        status = 'online';
        lastSeenText = '온라인';
      } else if (minutesAgo <= 5) {
        status = 'online';
        lastSeenText = '온라인';
      } else if (minutesAgo <= 30) {
        status = 'away';
        lastSeenText = `${minutesAgo}분 전`;
      } else {
        status = 'offline';
        if (minutesAgo < 60) {
          lastSeenText = `${minutesAgo}분 전`;
        } else if (minutesAgo < 1440) {
          lastSeenText = `${Math.floor(minutesAgo / 60)}시간 전`;
        } else {
          lastSeenText = `${Math.floor(minutesAgo / 1440)}일 전`;
        }
      }

      return {
        id: user.id,
        name: user.name || '이름 없음',
        email: user.email,
        level: user.userLevel,
        position: user.position,
        status,
        lastSeenText,
        lastSeen: user.lastSeen
      };
    });

    return NextResponse.json({ 
      users: usersWithStatus,
      onlineCount: usersWithStatus.filter(u => u.status === 'online').length,
      totalCount: usersWithStatus.length
    });

  } catch (error) {
    console.error('온라인 사용자 조회 오류:', error);
    return NextResponse.json(
      { error: '온라인 사용자 조회 중 오류가 발생했습니다' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// 사용자 온라인 상태 업데이트 (heartbeat)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    // 사용자가 존재하는지 먼저 확인
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (!user) {
      console.error('사용자를 찾을 수 없습니다:', session.user.id);
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다' }, { status: 404 });
    }

    // 현재 사용자의 lastSeen 업데이트
    await prisma.user.update({
      where: { id: session.user.id },
      data: { lastSeen: new Date() }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('사용자 상태 업데이트 오류:', error);
    return NextResponse.json(
      { error: '사용자 상태 업데이트 중 오류가 발생했습니다' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
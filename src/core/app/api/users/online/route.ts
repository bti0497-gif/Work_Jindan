import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// 온라인 사용자 목록 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    // 최근 5분 이내 활동한 사용자를 온라인으로 간주
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const usersRef = adminDb.collection('users');
    const snapshot = await usersRef
        .where('lastSeen', '>=', fiveMinutesAgo)
        .orderBy('lastSeen', 'desc')
        .get();

    const onlineUsers = snapshot.docs.map(doc => {
        const data = doc.data();
        
        // 날짜 처리 헬퍼 함수
        const getDate = (field: any) => {
            if (!field) return null;
            if (typeof field.toDate === 'function') return field.toDate();
            return new Date(field);
        };

        return {
            id: doc.id,
            name: data.name,
            email: data.email,
            userLevel: data.userLevel,
            position: data.position,
            lastSeen: getDate(data.lastSeen),
            createdAt: getDate(data.createdAt)
        };
    });

    // 사용자 상태 계산
    const usersWithStatus = onlineUsers.map(user => {
      const now = new Date();
      const lastSeen = user.lastSeen || new Date(); // Fallback
      const minutesAgo = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60));
      
      let status = 'offline';
      let lastSeenText = '오프라인';
      
      if (minutesAgo <= 1) {
        status = 'online';
        lastSeenText = '온라인';
      } else if (minutesAgo <= 5) {
        status = 'away';
        lastSeenText = '자리비움';
      }

      return {
        ...user,
        status,
        lastSeenText
      };
    });

    return NextResponse.json({ users: usersWithStatus });

  } catch (error) {
    console.error('온라인 사용자 조회 오류:', error);
    return NextResponse.json(
      { error: '사용자 목록을 불러오는데 실패했습니다' },
      { status: 500 }
    );
  }
}

// 사용자 상태 업데이트 (Heartbeat)
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userRef = adminDb.collection('users').doc(session.user.id);
        
        await userRef.set({
            lastSeen: FieldValue.serverTimestamp(),
            email: session.user.email,
            name: session.user.name,
        }, { merge: true });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Status update error:', error);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}

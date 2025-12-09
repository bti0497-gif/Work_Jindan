import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';



export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: '?¸ì¦???„ìš”?©ë‹ˆ??' }, { status: 401 });
    }

    // ìµœê³ ê´€ë¦¬ìë§??‘ê·¼ ê°€??
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email! }
    });

    if (!currentUser || (currentUser as any).userLevel !== 0) {
      return NextResponse.json({ error: 'ê¶Œí•œ???†ìŠµ?ˆë‹¤.' }, { status: 403 });
    }

    const { userId, newLevel, reason } = await request.json();

    if (!userId || newLevel === undefined) {
      return NextResponse.json({ error: '?„ìˆ˜ ?•ë³´ê°€ ?„ë½?˜ì—ˆ?µë‹ˆ??' }, { status: 400 });
    }

    // ?€???¬ìš©??ì¡°íšŒ
    const targetUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!targetUser) {
      return NextResponse.json({ error: '?¬ìš©?ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.' }, { status: 404 });
    }

    // ìµœê³ ê´€ë¦¬ì???˜ì • ë¶ˆê?
    if ((targetUser as any).userLevel === 0) {
      return NextResponse.json({ error: 'ìµœê³ ê´€ë¦¬ì???˜ì •?????†ìŠµ?ˆë‹¤.' }, { status: 400 });
    }

    // ?±ê¸‰???™ì¼??ê²½ìš°
    if ((targetUser as any).userLevel === newLevel) {
      return NextResponse.json({ error: '?´ë? ?™ì¼???±ê¸‰?…ë‹ˆ??' }, { status: 400 });
    }

    // ?¸ëœ??…˜?¼ë¡œ ?¬ìš©???±ê¸‰ ë³€ê²?ë°?ë¡œê·¸ ê¸°ë¡
    await prisma.$transaction(async (tx) => {
      // ?¬ìš©???±ê¸‰ ë³€ê²?
      await (tx.user as any).update({
        where: { id: userId },
        data: { userLevel: newLevel }
      });

      // ê´€ë¦?ë¡œê·¸ ê¸°ë¡
      await (tx as any).userManagementLog.create({
        data: {
          managerId: currentUser.id,
          targetUserId: userId,
          action: 'LEVEL_CHANGE',
          oldValue: (targetUser as any).userLevel.toString(),
          newValue: newLevel.toString(),
          reason: reason || null
        }
      });
    });

    return NextResponse.json({ 
      message: '?¬ìš©???±ê¸‰??ë³€ê²½ë˜?ˆìŠµ?ˆë‹¤.',
      oldLevel: (targetUser as any).userLevel,
      newLevel 
    });
  } catch (error) {
    console.error('?±ê¸‰ ë³€ê²??¤ë¥˜:', error);
    return NextResponse.json(
      { error: '?±ê¸‰ ë³€ê²?ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' },
      { status: 500 }
    );
  }
}
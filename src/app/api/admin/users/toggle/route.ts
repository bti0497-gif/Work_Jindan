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

    // TypeScript ?¤ë¥˜ ë¬´ì‹œ?˜ê³  ?°í??„ì—??ì²´í¬
    if (!currentUser || (currentUser as any).userLevel !== 0) {
      return NextResponse.json({ error: 'ê¶Œí•œ???†ìŠµ?ˆë‹¤.' }, { status: 403 });
    }

    const { userId, reason } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: '?¬ìš©??IDê°€ ?„ìš”?©ë‹ˆ??' }, { status: 400 });
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

    const newActiveStatus = !(targetUser as any).isActive;

    // ?¸ëœ??…˜?¼ë¡œ ?¬ìš©???íƒœ ë³€ê²?ë°?ë¡œê·¸ ê¸°ë¡
    await prisma.$transaction(async (tx) => {
      // ?¬ìš©???íƒœ ë³€ê²?
      await (tx.user as any).update({
        where: { id: userId },
        data: { isActive: newActiveStatus }
      });

      // ê´€ë¦?ë¡œê·¸ ê¸°ë¡
      await (tx as any).userManagementLog.create({
        data: {
          managerId: currentUser.id,
          targetUserId: userId,
          action: newActiveStatus ? 'ACTIVATE' : 'DEACTIVATE',
          oldValue: (targetUser as any).isActive ? 'active' : 'inactive',
          newValue: newActiveStatus ? 'active' : 'inactive',
          reason: reason || null
        }
      });
    });

    return NextResponse.json({ 
      message: `?¬ìš©?ê? ${newActiveStatus ? '?œì„±?? : 'ë¹„í™œ?±í™”'}?˜ì—ˆ?µë‹ˆ??`,
      isActive: newActiveStatus 
    });
  } catch (error) {
    console.error('?¬ìš©???íƒœ ë³€ê²??¤ë¥˜:', error);
    return NextResponse.json(
      { error: '?¬ìš©???íƒœ ë³€ê²?ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' },
      { status: 500 }
    );
  }
}
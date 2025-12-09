import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';



export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: '?¸ì¦???„ìš”?©ë‹ˆ??' }, { status: 401 });
    }

    const { name, phone, position } = await request.json();

    // ?…ë ¥ ê²€ì¦?
    if (!name || name.trim().length < 2 || name.trim().length > 20) {
      return NextResponse.json(
        { message: '?´ë¦„?€ 2???´ìƒ 20???´í•˜ë¡??…ë ¥?´ì£¼?¸ìš”.' },
        { status: 400 }
      );
    }

    // ?„í™”ë²ˆí˜¸ ?•ì‹ ê²€ì¦?(?…ë ¥??ê²½ìš°)
    if (phone && phone.trim()) {
      const phoneRegex = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/;
      if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
        return NextResponse.json(
          { message: '?¬ë°”ë¥??„í™”ë²ˆí˜¸ ?•ì‹???„ë‹™?ˆë‹¤. (?? 010-1234-5678)' },
          { status: 400 }
        );
      }
    }

    // ì§ì±… ê¸¸ì´ ê²€ì¦?(?…ë ¥??ê²½ìš°)
    if (position && position.trim().length > 50) {
      return NextResponse.json(
        { message: 'ì§ì±…?€ 50???´í•˜ë¡??…ë ¥?´ì£¼?¸ìš”.' },
        { status: 400 }
      );
    }

    // ?¬ìš©???•ë³´ ?…ë°?´íŠ¸
    const updatedUser = await (prisma.user as any).update({
      where: { email: session.user.email },
      data: {
        name: name.trim(),
        phone: phone?.trim() || null,
        position: position?.trim() || null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        position: true,
        userLevel: true,
        isActive: true,
      }
    });

    return NextResponse.json({ 
      message: '?„ë¡œ?„ì´ ?±ê³µ?ìœ¼ë¡??…ë°?´íŠ¸?˜ì—ˆ?µë‹ˆ??',
      user: updatedUser 
    });

  } catch (error) {
    console.error('?„ë¡œ???…ë°?´íŠ¸ ?¤ë¥˜:', error);
    return NextResponse.json(
      { message: '?„ë¡œ???…ë°?´íŠ¸ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
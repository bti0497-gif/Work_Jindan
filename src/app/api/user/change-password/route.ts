import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { validatePassword } from '@/lib/password-validation';



export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: '?¸ì¦???„ìš”?©ë‹ˆ??' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();

    // ?…ë ¥ ê²€ì¦?
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { message: '?„ì¬ ë¹„ë?ë²ˆí˜¸?€ ??ë¹„ë?ë²ˆí˜¸ë¥?ëª¨ë‘ ?…ë ¥?´ì£¼?¸ìš”.' },
        { status: 400 }
      );
    }

    // ??ë¹„ë?ë²ˆí˜¸ ê°•ë„ ê²€ì¦?
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { 
          message: '??ë¹„ë?ë²ˆí˜¸ê°€ ?”êµ¬?¬í•­??ì¶©ì¡±?˜ì? ?ŠìŠµ?ˆë‹¤.',
          errors: passwordValidation.errors
        },
        { status: 400 }
      );
    }

    // ?¬ìš©??ì¡°íšŒ
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json(
        { message: '?¬ìš©?ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.' },
        { status: 404 }
      );
    }

    // ?„ì¬ ë¹„ë?ë²ˆí˜¸ ê²€ì¦?
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return NextResponse.json(
        { message: '?„ì¬ ë¹„ë?ë²ˆí˜¸ê°€ ?¬ë°”ë¥´ì? ?ŠìŠµ?ˆë‹¤.' },
        { status: 400 }
      );
    }

    // ??ë¹„ë?ë²ˆí˜¸ ?”í˜¸??
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // ë¹„ë?ë²ˆí˜¸ ?…ë°?´íŠ¸
    await prisma.user.update({
      where: { email: session.user.email },
      data: {
        password: hashedNewPassword,
      },
    });

    return NextResponse.json({ 
      message: 'ë¹„ë?ë²ˆí˜¸ê°€ ?±ê³µ?ìœ¼ë¡?ë³€ê²½ë˜?ˆìŠµ?ˆë‹¤.' 
    });

  } catch (error) {
    console.error('ë¹„ë?ë²ˆí˜¸ ë³€ê²??¤ë¥˜:', error);
    return NextResponse.json(
      { message: 'ë¹„ë?ë²ˆí˜¸ ë³€ê²?ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
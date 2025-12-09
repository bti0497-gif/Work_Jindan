import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';



// ê²Œì‹œê¸€ ëª©ë¡ ì¡°íšŒ
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: '?¸ì¦???„ìš”?©ë‹ˆ??' }, { status: 401 });
    }

    const posts = await (prisma as any).post.findMany({
      select: {
        id: true,
        title: true,
        content: false, // ëª©ë¡?ì„œ???´ìš© ?œì™¸
        isNotice: true,
        viewCount: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            userLevel: true
          }
        },
        _count: {
          select: {
            comments: true
          }
        }
      },
      orderBy: [
        { isNotice: 'desc' }, // ê³µì??¬í•­ ?°ì„ 
        { createdAt: 'desc' }
      ]
    });

    return NextResponse.json({ posts });
  } catch (error) {
    console.error('ê²Œì‹œê¸€ ëª©ë¡ ì¡°íšŒ ?¤ë¥˜:', error);
    return NextResponse.json(
      { error: 'ê²Œì‹œê¸€ ëª©ë¡??ì¡°íšŒ?????†ìŠµ?ˆë‹¤.' },
      { status: 500 }
    );
  }
}

// ê²Œì‹œê¸€ ?‘ì„±
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: '?¸ì¦???„ìš”?©ë‹ˆ??' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email! }
    });

    if (!currentUser) {
      return NextResponse.json({ error: '?¬ìš©?ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.' }, { status: 404 });
    }

    const { title, content, isNotice } = await request.json();

    if (!title || !content) {
      return NextResponse.json({ error: '?œëª©ê³??´ìš©???„ìš”?©ë‹ˆ??' }, { status: 400 });
    }

    // ê³µì??¬í•­?€ ê´€ë¦¬ìë§??‘ì„± ê°€??
    const canWriteNotice = (currentUser as any).userLevel <= 1;
    const finalIsNotice = isNotice && canWriteNotice;

    const post = await (prisma as any).post.create({
      data: {
        title,
        content,
        isNotice: finalIsNotice,
        authorId: currentUser.id
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            userLevel: true
          }
        }
      }
    });

    return NextResponse.json({ post });
  } catch (error) {
    console.error('ê²Œì‹œê¸€ ?‘ì„± ?¤ë¥˜:', error);
    return NextResponse.json(
      { error: 'ê²Œì‹œê¸€ ?‘ì„± ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' },
      { status: 500 }
    );
  }
}
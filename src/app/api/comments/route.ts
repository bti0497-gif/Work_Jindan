import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';



// ?“ê? ?‘ì„±
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

    const { postId, content } = await request.json();

    if (!postId || !content) {
      return NextResponse.json({ error: 'ê²Œì‹œê¸€ ID?€ ?´ìš©???„ìš”?©ë‹ˆ??' }, { status: 400 });
    }

    // ê²Œì‹œê¸€ ì¡´ì¬ ?•ì¸
    const post = await (prisma as any).post.findUnique({
      where: { id: postId }
    });

    if (!post) {
      return NextResponse.json({ error: 'ê²Œì‹œê¸€??ì°¾ì„ ???†ìŠµ?ˆë‹¤.' }, { status: 404 });
    }

    const comment = await (prisma as any).comment.create({
      data: {
        content,
        postId,
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

    return NextResponse.json({ comment });
  } catch (error) {
    console.error('?“ê? ?‘ì„± ?¤ë¥˜:', error);
    return NextResponse.json(
      { error: '?“ê? ?‘ì„± ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.' },
      { status: 500 }
    );
  }
}
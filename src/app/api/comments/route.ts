import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';



// 댓글 작성
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email! }
    });

    if (!currentUser) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { postId, content } = await request.json();

    if (!postId || !content) {
      return NextResponse.json({ error: '게시글 ID와 내용이 필요합니다.' }, { status: 400 });
    }

    // 게시글 존재 확인
    const post = await (prisma as any).post.findUnique({
      where: { id: postId }
    });

    if (!post) {
      return NextResponse.json({ error: '게시글을 찾을 수 없습니다.' }, { status: 404 });
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
    console.error('댓글 작성 오류:', error);
    return NextResponse.json(
      { error: '댓글 작성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
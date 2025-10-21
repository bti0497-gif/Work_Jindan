import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';



// 게시글 목록 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const posts = await (prisma as any).post.findMany({
      select: {
        id: true,
        title: true,
        content: false, // 목록에서는 내용 제외
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
        { isNotice: 'desc' }, // 공지사항 우선
        { createdAt: 'desc' }
      ]
    });

    return NextResponse.json({ posts });
  } catch (error) {
    console.error('게시글 목록 조회 오류:', error);
    return NextResponse.json(
      { error: '게시글 목록을 조회할 수 없습니다.' },
      { status: 500 }
    );
  }
}

// 게시글 작성
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

    const { title, content, isNotice } = await request.json();

    if (!title || !content) {
      return NextResponse.json({ error: '제목과 내용이 필요합니다.' }, { status: 400 });
    }

    // 공지사항은 관리자만 작성 가능
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
    console.error('게시글 작성 오류:', error);
    return NextResponse.json(
      { error: '게시글 작성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
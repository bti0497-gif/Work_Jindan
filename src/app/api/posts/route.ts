import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { syncPostsToDrive } from '@/lib/drive-sync';

// 게시글 목록 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const type = searchParams.get('type') || 'all'; // all, notice, normal

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { content: { contains: search } },
      ];
    }

    if (type === 'notice') {
      where.isNotice = true;
    } else if (type === 'normal') {
      where.isNotice = false;
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        select: {
          id: true,
          title: true,
          content: true,
          isNotice: true,
          viewCount: true,
          createdAt: true,
          author: {
            select: {
              name: true,
              email: true,
            },
          },
          _count: {
            select: { comments: true },
          },
        },
        orderBy: [
          { isNotice: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      prisma.post.count({ where }),
    ]);

    return NextResponse.json({
      posts,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        page,
        limit,
      },
    });
  } catch (error) {
    console.error('게시글 조회 오류:', error);
    return NextResponse.json(
      { error: '게시글을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 게시글 작성
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { title, content, isNotice } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: '제목과 내용을 입력해주세요.' },
        { status: 400 }
      );
    }

    // 공지사항 권한 체크 (관리자만 가능)
    if (isNotice && session.user.userLevel > 1) {
      return NextResponse.json(
        { error: '공지사항 작성 권한이 없습니다.' },
        { status: 403 }
      );
    }

    const post = await prisma.post.create({
      data: {
        title,
        content,
        isNotice: isNotice || false,
        authorId: session.user.id,
      },
    });

    // Sync to Google Drive
    syncPostsToDrive().catch(err => console.error('Background post sync failed:', err));

    return NextResponse.json(post);
  } catch (error) {
    console.error('게시글 작성 오류:', error);
    return NextResponse.json(
      { error: '게시글 작성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

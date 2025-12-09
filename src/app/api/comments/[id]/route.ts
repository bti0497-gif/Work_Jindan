import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';



// 댓글 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { content } = await request.json();

    if (!content) {
      return NextResponse.json({ error: '내용이 필요합니다.' }, { status: 400 });
    }

    const { id } = await params;

    // 댓글 조회 및 작성자 확인
    const comment = await (prisma as any).comment.findUnique({
      where: { id }
    });

    if (!comment) {
      return NextResponse.json({ error: '댓글을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (comment.authorId !== currentUser.id) {
      return NextResponse.json({ error: '댓글 작성자만 수정할 수 있습니다.' }, { status: 403 });
    }

    const updatedComment = await (prisma as any).comment.update({
      where: { id },
      data: { content },
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

    return NextResponse.json({ comment: updatedComment });
  } catch (error) {
    console.error('댓글 수정 오류:', error);
    return NextResponse.json(
      { error: '댓글 수정 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 댓글 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // 댓글 조회 및 작성자 확인
    const comment = await (prisma as any).comment.findUnique({
      where: { id }
    });

    if (!comment) {
      return NextResponse.json({ error: '댓글을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 작성자 또는 관리자만 삭제 가능
    const canDelete = comment.authorId === currentUser.id || (currentUser as any).userLevel <= 1;
    
    if (!canDelete) {
      return NextResponse.json({ error: '댓글을 삭제할 권한이 없습니다.' }, { status: 403 });
    }

    await (prisma as any).comment.delete({
      where: { id }
    });

    return NextResponse.json({ message: '댓글이 삭제되었습니다.' });
  } catch (error) {
    console.error('댓글 삭제 오류:', error);
    return NextResponse.json(
      { error: '댓글 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
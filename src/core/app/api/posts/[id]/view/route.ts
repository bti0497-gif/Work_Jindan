import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PrismaClient } from '@prisma/client';



// 조회수 증가
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    await (prisma as any).post.update({
      where: { id: id },
      data: {
        viewCount: {
          increment: 1
        }
      }
    });

    return NextResponse.json({ message: '조회수가 증가했습니다.' });
  } catch (error) {
    console.error('조회수 증가 오류:', error);
    return NextResponse.json(
      { error: '조회수 증가 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
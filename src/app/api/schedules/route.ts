import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// ?„ë¡œ?íŠ¸ë³??¼ì • ì¡°íšŒ
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '?¸ì¦???„ìš”?©ë‹ˆ?? }, { status: 401 });
    }

    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: '?„ë¡œ?íŠ¸ IDê°€ ?„ìš”?©ë‹ˆ?? }, { status: 400 });
    }

    // ?¬ìš©?ê? ?´ë‹¹ ?„ë¡œ?íŠ¸??ë©¤ë²„?¸ì? ?•ì¸
    const projectMember = await prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: session.user.id
      }
    });

    if (!projectMember) {
      return NextResponse.json({ error: '?„ë¡œ?íŠ¸ ?‘ê·¼ ê¶Œí•œ???†ìŠµ?ˆë‹¤' }, { status: 403 });
    }

    const schedules = await prisma.schedule.findMany({
      where: { projectId },
      orderBy: { startDate: 'asc' }
    });

    return NextResponse.json({ schedules });

  } catch (error) {
    console.error('?¼ì • ì¡°íšŒ ?¤ë¥˜:', error);
    return NextResponse.json(
      { error: '?¼ì •??ë¶ˆëŸ¬?¤ëŠ” ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤' },
      { status: 500 }
    );
  }
}

// ???¼ì • ?ì„±
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '?¸ì¦???„ìš”?©ë‹ˆ?? }, { status: 401 });
    }

    const { title, description, startDate, endDate, projectId } = await request.json();

    if (!title || !startDate || !endDate || !projectId) {
      return NextResponse.json({ 
        error: '?œëª©, ?œì‘?? ì¢…ë£Œ?? ?„ë¡œ?íŠ¸ ID???„ìˆ˜?…ë‹ˆ?? 
      }, { status: 400 });
    }

    // ?¬ìš©?ê? ?´ë‹¹ ?„ë¡œ?íŠ¸??ë©¤ë²„?¸ì? ?•ì¸
    const projectMember = await prisma.projectMember.findFirst({
      where: {
        projectId,
        userId: session.user.id
      }
    });

    if (!projectMember) {
      return NextResponse.json({ error: '?„ë¡œ?íŠ¸ ?‘ê·¼ ê¶Œí•œ???†ìŠµ?ˆë‹¤' }, { status: 403 });
    }

    const schedule = await prisma.schedule.create({
      data: {
        title,
        description,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        projectId
      }
    });

    return NextResponse.json({ 
      success: true, 
      schedule 
    });

  } catch (error) {
    console.error('?¼ì • ?ì„± ?¤ë¥˜:', error);
    return NextResponse.json(
      { error: '?¼ì • ?ì„± ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤' },
      { status: 500 }
    );
  }
}
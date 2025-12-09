import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { uploadFileToDrive } from '@/lib/google-api';
import { PrismaClient } from '@prisma/client';



export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '?¸ì¦???„ìš”?©ë‹ˆ?? }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const parentId = formData.get('parentId') as string | null;
    // projectId ?œê±° - ?„ì—­ ?Œì¼ ?…ë¡œ??

    if (!file) {
      return NextResponse.json({ error: '?Œì¼??? íƒ?˜ì? ?Šì•˜?µë‹ˆ?? }, { status: 400 });
    }

    // ?Œì¼ ?¬ê¸° ?œí•œ (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '?Œì¼ ?¬ê¸°??10MBë¥?ì´ˆê³¼?????†ìŠµ?ˆë‹¤' }, { status: 400 });
    }

    // ?Œì¼??Bufferë¡?ë³€??
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let result;
    try {
      // Google Drive???…ë¡œ???œë„
      result = await uploadFileToDrive(
        buffer,
        file.name,
        file.type,
        parentId || undefined
      );
    } catch (error) {
      console.error('Google Drive ?…ë¡œ???¤íŒ¨:', error);
      // Google Drive ?¤íŒ¨ ??ë¡œì»¬?ì„œë§??ì„±
      result = {
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: file.name
      };
    }

    // ?„ì—­ ?Œì¼ë¡??€??(projectId??null)
    let firstProject = await prisma.project.findFirst();
    
    // ?„ì—­ ?Œì¼?´ë?ë¡??„ë¡œ?íŠ¸ ?†ì´ ?€??
    if (!firstProject) {
      firstProject = await prisma.project.create({
        data: {
          name: 'Global Files Project',
          description: 'System generated project for global file storage',
          ownerId: session.user.id,
          color: '#3B82F6'
        }
      });
    }
    
    const projectIdToUse = firstProject.id;

    // ?°ì´?°ë² ?´ìŠ¤???Œì¼ ?•ë³´ ?€??(?„ì—­ ?Œì¼)
    const filePath = parentId 
      ? `/global/files/${parentId}/${result.id}`
      : `/global/files/${result.id}`;

    const projectFile = await prisma.projectFile.create({
      data: {
        name: file.name,
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
        path: filePath,
        googleFileId: result.id,
        projectId: projectIdToUse,
        uploadedBy: session.user.id
      }
    });

    return NextResponse.json({
      success: true,
      file: {
        id: result.id,
        name: result.name,
        mimeType: file.type,
        size: file.size,
        projectFileId: projectFile.id
      }
    });

  } catch (error) {
    console.error('?Œì¼ ?…ë¡œ???¤ë¥˜:', error);
    return NextResponse.json(
      { error: '?Œì¼ ?…ë¡œ??ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
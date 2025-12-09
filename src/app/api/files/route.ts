import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { 
  uploadFileToDrive, 
  createDriveFolder, 
  deleteFileFromDrive, 
  downloadFileFromDrive,
  updateDriveFileName
} from '@/lib/google-api';
import { PrismaClient } from '@prisma/client';



// ?„ì—­ ?Œì¼ ëª©ë¡ ì¡°íšŒ (?´ë”ë³?
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '?¸ì¦???„ìš”?©ë‹ˆ?? }, { status: 401 });
    }

    const url = new URL(request.url);
    const parentId = url.searchParams.get('parentId');

    // ?¹ì • ?´ë” ?ëŠ” ë£¨íŠ¸ ?´ë”???Œì¼ ì¡°íšŒ
    // ëª¨ë“  ?Œì¼??ê°€?¸ì˜¨ ??JavaScript?ì„œ ?„í„°ë§?
    const allFiles = await prisma.projectFile.findMany({
      orderBy: { createdAt: 'desc' }
    });

    // JavaScript?ì„œ ?¬ë°”ë¥?depth ?„í„°ë§?
    const filteredFiles = allFiles.filter(file => {
      const pathParts = file.path.split('/').filter(part => part !== '');
      
      if (parentId) {
        // ?¹ì • ?´ë” ?´ë???ì§ê³„ ?ì‹ë§?
        return (
          (file.path.startsWith(`/global/folders/${parentId}/`) || 
           file.path.startsWith(`/global/files/${parentId}/`)) &&
          pathParts.length === 4 // /global/folders|files/parentId/fileId
        );
      } else {
        // ë£¨íŠ¸ ?´ë”??ì§ê³„ ?ì‹ë§?
        return (
          (file.path.startsWith('/global/folders/') || 
           file.path.startsWith('/global/files/')) &&
          pathParts.length === 3 // /global/folders|files/fileId
        );
      }
    });

    // Google Drive?ì„œ ?Œì¼ ?•ë³´??ê°€?¸ì???ë³‘í•©?????ˆì?ë§? 
    // ?„ì¬???°ì´?°ë² ?´ìŠ¤???•ë³´ë§??¬ìš©
    const formattedFiles = filteredFiles.map(file => ({
      id: file.googleFileId || file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.createdAt.toISOString(),
      size: file.size,
      isFolder: file.mimeType === 'application/vnd.google-apps.folder',
      parentId: parentId
    }));

    return NextResponse.json({ files: formattedFiles });

  } catch (error) {
    console.error('?Œì¼ ëª©ë¡ ì¡°íšŒ ?¤ë¥˜:', error);
    return NextResponse.json(
      { error: '?Œì¼ ëª©ë¡??ë¶ˆëŸ¬?¤ëŠ” ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// ?Œì¼ ?? œ
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '?¸ì¦???„ìš”?©ë‹ˆ?? }, { status: 401 });
    }

    const { fileId } = await request.json();

    if (!fileId) {
      return NextResponse.json({ error: '?Œì¼ IDê°€ ?„ìš”?©ë‹ˆ?? }, { status: 400 });
    }

    // ?Œì¼??ì¡´ì¬?˜ëŠ”ì§€ ?•ì¸ (ê¶Œí•œ ?•ì¸ ?œê±°)
    const projectFile = await prisma.projectFile.findFirst({
      where: {
        OR: [
          { googleFileId: fileId },
          { id: fileId }
        ]
      }
    });

    if (!projectFile) {
      return NextResponse.json({ error: '?Œì¼??ì°¾ì„ ???†ìŠµ?ˆë‹¤' }, { status: 404 });
    }

    // Google Drive?ì„œ ?Œì¼ ?? œ
    if (projectFile.googleFileId) {
      await deleteFileFromDrive(projectFile.googleFileId);
    }

    // ?°ì´?°ë² ?´ìŠ¤?ì„œ ?Œì¼ ?•ë³´ ?? œ
    await prisma.projectFile.delete({
      where: { id: projectFile.id }
    });

    return NextResponse.json({ success: true, message: '?Œì¼???? œ?˜ì—ˆ?µë‹ˆ?? });

  } catch (error) {
    console.error('?Œì¼ ?? œ ?¤ë¥˜:', error);
    return NextResponse.json(
      { error: '?Œì¼ ?? œ ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// ?„ì—­ ?´ë” ?ì„±
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '?¸ì¦???„ìš”?©ë‹ˆ?? }, { status: 401 });
    }

    const { folderName, parentId } = await request.json();

    if (!folderName) {
      return NextResponse.json({ error: '?´ë” ?´ë¦„???„ìš”?©ë‹ˆ?? }, { status: 400 });
    }

    let driveResult;
    try {
      // Google Drive???´ë” ?ì„± ?œë„
      driveResult = await createDriveFolder(folderName, parentId);
    } catch (error) {
      console.error('Google Drive ?´ë” ?ì„± ?¤íŒ¨:', error);
      // Google Drive ?¤íŒ¨ ??ë¡œì»¬?ì„œë§??ì„±
      driveResult = {
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: folderName
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

    // ?°ì´?°ë² ?´ìŠ¤???´ë” ?•ë³´ ?€??(?„ì—­ ?Œì¼)
    const folderPath = parentId 
      ? `/global/folders/${parentId}/${driveResult.id}`
      : `/global/folders/${driveResult.id}`;

    const projectFile = await prisma.projectFile.create({
      data: {
        name: folderName,
        originalName: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        size: 0,
        path: folderPath,
        googleFileId: driveResult.id,
        projectId: projectIdToUse,
        uploadedBy: session.user.id
      }
    });

    return NextResponse.json({
      success: true,
      folder: {
        id: driveResult.id,
        name: driveResult.name,
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: true,
        projectFileId: projectFile.id
      }
    });

  } catch (error) {
    console.error('?´ë” ?ì„± ?¤ë¥˜:', error);
    return NextResponse.json(
      { error: '?´ë” ?ì„± ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// ?Œì¼/?´ë” ?´ë¦„ ë³€ê²?
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '?¸ì¦???„ìš”?©ë‹ˆ?? }, { status: 401 });
    }

    const { fileId, newName } = await request.json();

    if (!fileId || !newName) {
      return NextResponse.json({ error: '?Œì¼ ID?€ ???´ë¦„???„ìš”?©ë‹ˆ?? }, { status: 400 });
    }

    // ?Œì¼??ì¡´ì¬?˜ëŠ”ì§€ ?•ì¸
    const projectFile = await prisma.projectFile.findFirst({
      where: {
        OR: [
          { googleFileId: fileId },
          { id: fileId }
        ]
      }
    });

    if (!projectFile) {
      return NextResponse.json({ error: '?Œì¼??ì°¾ì„ ???†ìŠµ?ˆë‹¤' }, { status: 404 });
    }

    try {
      // Google Drive?ì„œ ?´ë¦„ ë³€ê²??œë„
      if (projectFile.googleFileId) {
        await updateDriveFileName(projectFile.googleFileId, newName);
      }
    } catch (error) {
      console.error('Google Drive ?´ë¦„ ë³€ê²??¤íŒ¨:', error);
      // Google Drive ?¤íŒ¨?´ë„ ê³„ì† ì§„í–‰
    }

    // ?°ì´?°ë² ?´ìŠ¤?ì„œ ?´ë¦„ ?…ë°?´íŠ¸
    const updatedFile = await prisma.projectFile.update({
      where: { id: projectFile.id },
      data: { 
        name: newName,
        originalName: newName
      }
    });

    return NextResponse.json({
      success: true,
      file: {
        id: updatedFile.googleFileId || updatedFile.id,
        name: updatedFile.name,
        mimeType: updatedFile.mimeType,
        isFolder: updatedFile.mimeType === 'application/vnd.google-apps.folder'
      }
    });

  } catch (error) {
    console.error('?Œì¼ ?´ë¦„ ë³€ê²??¤ë¥˜:', error);
    return NextResponse.json(
      { error: '?Œì¼ ?´ë¦„ ë³€ê²?ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
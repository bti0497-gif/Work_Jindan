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

// 전역 파일 목록 조회 (폴더별)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const url = new URL(request.url);
    const parentId = url.searchParams.get('parentId');

    // 특정 폴더 또는 루트 폴더의 파일 조회
    // 모든 파일을 가져온 후 JavaScript에서 필터링
    const allFiles = await prisma.projectFile.findMany({
      orderBy: { createdAt: 'desc' }
    });

    // JavaScript에서 올바른 depth 필터링
    const filteredFiles = allFiles.filter(file => {
      const pathParts = file.path.split('/').filter(part => part !== '');
      
      if (parentId) {
        // 특정 폴더 내의 직계 자식만
        return (
          (file.path.startsWith(`/global/folders/${parentId}/`) || 
           file.path.startsWith(`/global/files/${parentId}/`)) &&
          pathParts.length === 4 // /global/folders|files/parentId/fileId
        );
      } else {
        // 루트 폴더의 직계 자식만
        return (
          (file.path.startsWith('/global/folders/') || 
           file.path.startsWith('/global/files/')) &&
          pathParts.length === 3 // /global/folders|files/fileId
        );
      }
    });

    // Google Drive에서 파일 정보를 가져와 병합할 수 있지만 
    // 현재는 데이터베이스의 정보만 사용
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
    console.error('파일 목록 조회 오류:', error);
    return NextResponse.json(
      { error: '파일 목록을 불러오는 중 오류가 발생했습니다' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// 파일 삭제
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { fileId } = await request.json();

    if (!fileId) {
      return NextResponse.json({ error: '파일 ID가 필요합니다.' }, { status: 400 });
    }

    // 파일이 존재하는지 확인 (권한 확인 제거)
    const projectFile = await prisma.projectFile.findFirst({
      where: {
        OR: [
          { googleFileId: fileId },
          { id: fileId }
        ]
      }
    });

    if (!projectFile) {
      return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
    }

    // Google Drive에서 삭제
    if (projectFile.googleFileId) {
      await deleteFileFromDrive(projectFile.googleFileId);
    }

    // DB에서 삭제
    await prisma.projectFile.delete({
      where: { id: projectFile.id }
    });

    return NextResponse.json({ message: '파일이 삭제되었습니다.' });

  } catch (error) {
    console.error('파일 삭제 오류:', error);
    return NextResponse.json(
      { error: '파일 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// 폴더 생성
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { name, parentId } = await request.json();

    if (!name) {
      return NextResponse.json({ error: '폴더 이름이 필요합니다.' }, { status: 400 });
    }

    // Google Drive에 폴더 생성
    const folder = await createDriveFolder(name, parentId);

    if (!folder) {
      throw new Error('Google Drive 폴더 생성 실패');
    }

    // DB에 폴더 정보 저장
    const path = parentId 
      ? `/global/folders/${parentId}/${folder.id}`
      : `/global/folders/${folder.id}`;

    const newFolder = await prisma.projectFile.create({
      data: {
        name: folder.name,
        originalName: folder.name,
        mimeType: 'application/vnd.google-apps.folder',
        size: 0,
        path: path,
        googleFileId: folder.id,
        projectId: null, // 전역 파일
        uploadedBy: session.user.id
      }
    });

    return NextResponse.json({ 
      folder: {
        id: newFolder.googleFileId,
        name: newFolder.name,
        mimeType: newFolder.mimeType,
        modifiedTime: newFolder.createdAt.toISOString(),
        parentId: parentId
      }
    });

  } catch (error) {
    console.error('폴더 생성 오류:', error);
    return NextResponse.json(
      { error: '폴더 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// 파일 이름 변경
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { fileId, name } = await request.json();

    if (!fileId || !name) {
      return NextResponse.json({ error: '파일 ID와 새 이름이 필요합니다.' }, { status: 400 });
    }

    // 파일 조회
    const projectFile = await prisma.projectFile.findFirst({
      where: {
        OR: [
          { googleFileId: fileId },
          { id: fileId }
        ]
      }
    });

    if (!projectFile) {
      return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
    }

    // Google Drive 파일 이름 변경
    if (projectFile.googleFileId) {
      await updateDriveFileName(projectFile.googleFileId, name);
    }

    // DB 업데이트
    await prisma.projectFile.update({
      where: { id: projectFile.id },
      data: { name: name }
    });

    return NextResponse.json({ message: '이름이 변경되었습니다.' });

  } catch (error) {
    console.error('이름 변경 오류:', error);
    return NextResponse.json(
      { error: '이름 변경 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

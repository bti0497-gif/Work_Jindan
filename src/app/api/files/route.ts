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
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
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
        // 특정 폴더 내부의 직계 자식만
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

    // Google Drive에서 파일 정보도 가져와서 병합할 수 있지만, 
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
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const { fileId } = await request.json();

    if (!fileId) {
      return NextResponse.json({ error: '파일 ID가 필요합니다' }, { status: 400 });
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
      return NextResponse.json({ error: '파일을 찾을 수 없습니다' }, { status: 404 });
    }

    // Google Drive에서 파일 삭제
    if (projectFile.googleFileId) {
      await deleteFileFromDrive(projectFile.googleFileId);
    }

    // 데이터베이스에서 파일 정보 삭제
    await prisma.projectFile.delete({
      where: { id: projectFile.id }
    });

    return NextResponse.json({ success: true, message: '파일이 삭제되었습니다' });

  } catch (error) {
    console.error('파일 삭제 오류:', error);
    return NextResponse.json(
      { error: '파일 삭제 중 오류가 발생했습니다' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// 전역 폴더 생성
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const { folderName, parentId } = await request.json();

    if (!folderName) {
      return NextResponse.json({ error: '폴더 이름이 필요합니다' }, { status: 400 });
    }

    let driveResult;
    try {
      // Google Drive에 폴더 생성 시도
      driveResult = await createDriveFolder(folderName, parentId);
    } catch (error) {
      console.error('Google Drive 폴더 생성 실패:', error);
      // Google Drive 실패 시 로컬에서만 생성
      driveResult = {
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: folderName
      };
    }

    // 전역 파일로 저장 (projectId는 null)
    let firstProject = await prisma.project.findFirst();
    
    // 전역 파일이므로 프로젝트 없이 저장
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

    // 데이터베이스에 폴더 정보 저장 (전역 파일)
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
    console.error('폴더 생성 오류:', error);
    return NextResponse.json(
      { error: '폴더 생성 중 오류가 발생했습니다' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// 파일/폴더 이름 변경
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const { fileId, newName } = await request.json();

    if (!fileId || !newName) {
      return NextResponse.json({ error: '파일 ID와 새 이름이 필요합니다' }, { status: 400 });
    }

    // 파일이 존재하는지 확인
    const projectFile = await prisma.projectFile.findFirst({
      where: {
        OR: [
          { googleFileId: fileId },
          { id: fileId }
        ]
      }
    });

    if (!projectFile) {
      return NextResponse.json({ error: '파일을 찾을 수 없습니다' }, { status: 404 });
    }

    try {
      // Google Drive에서 이름 변경 시도
      if (projectFile.googleFileId) {
        await updateDriveFileName(projectFile.googleFileId, newName);
      }
    } catch (error) {
      console.error('Google Drive 이름 변경 실패:', error);
      // Google Drive 실패해도 계속 진행
    }

    // 데이터베이스에서 이름 업데이트
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
    console.error('파일 이름 변경 오류:', error);
    return NextResponse.json(
      { error: '파일 이름 변경 중 오류가 발생했습니다' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
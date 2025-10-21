import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { downloadFileFromDrive } from '@/lib/google-api';
import { PrismaClient } from '@prisma/client';



export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const fileId = params.id;

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

    // 폴더는 다운로드할 수 없음
    if (projectFile.mimeType === 'application/vnd.google-apps.folder') {
      return NextResponse.json({ error: '폴더는 다운로드할 수 없습니다' }, { status: 400 });
    }

    // 파일명을 쿼리 파라미터에서 가져오거나 데이터베이스 파일명 사용
    const url = new URL(request.url);
    const fileName = url.searchParams.get('name') || projectFile.name;

    // Google Drive에서 파일 다운로드
    const googleFileId = projectFile.googleFileId || fileId;
    const fileData = await downloadFileFromDrive(googleFileId);

    // 파일 데이터를 응답으로 반환
    return new NextResponse(fileData as any, {
      headers: {
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Type': projectFile.mimeType || 'application/octet-stream',
      },
    });

  } catch (error) {
    console.error('파일 다운로드 오류:', error);
    return NextResponse.json(
      { error: '파일 다운로드 중 오류가 발생했습니다' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
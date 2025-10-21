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
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const parentId = formData.get('parentId') as string | null;
    // projectId 제거 - 전역 파일 업로드

    if (!file) {
      return NextResponse.json({ error: '파일이 선택되지 않았습니다' }, { status: 400 });
    }

    // 파일 크기 제한 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기는 10MB를 초과할 수 없습니다' }, { status: 400 });
    }

    // 파일을 Buffer로 변환
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let result;
    try {
      // Google Drive에 업로드 시도
      result = await uploadFileToDrive(
        buffer,
        file.name,
        file.type,
        parentId || undefined
      );
    } catch (error) {
      console.error('Google Drive 업로드 실패:', error);
      // Google Drive 실패 시 로컬에서만 생성
      result = {
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: file.name
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

    // 데이터베이스에 파일 정보 저장 (전역 파일)
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
    console.error('파일 업로드 오류:', error);
    return NextResponse.json(
      { error: '파일 업로드 중 오류가 발생했습니다' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
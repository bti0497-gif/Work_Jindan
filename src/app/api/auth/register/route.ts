import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { validatePassword } from '@/lib/password-validation';

const prisma = new PrismaClient();



export async function POST(request: NextRequest) {
  try {
    const { email, password, name, phone, position } = await request.json();

    // 입력 검증
    if (!email || !password || !name) {
      return NextResponse.json(
        { message: '이메일, 비밀번호, 이름은 필수 항목입니다.' },
        { status: 400 }
      );
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { message: '올바른 이메일 형식이 아닙니다.' },
        { status: 400 }
      );
    }

    // 이름 길이 검증
    if (name.trim().length < 2 || name.trim().length > 20) {
      return NextResponse.json(
        { message: '이름은 2자 이상 20자 이하로 입력해주세요.' },
        { status: 400 }
      );
    }

    // 전화번호 형식 검증 (입력된 경우)
    if (phone && phone.trim()) {
      const phoneRegex = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/;
      if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
        return NextResponse.json(
          { message: '올바른 전화번호 형식이 아닙니다. (예: 010-1234-5678)' },
          { status: 400 }
        );
      }
    }

    // 직책 길이 검증 (입력된 경우)
    if (position && position.trim().length > 50) {
      return NextResponse.json(
        { message: '직책은 50자 이하로 입력해주세요.' },
        { status: 400 }
      );
    }

    // 비밀번호 강도 검증
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { 
          message: '비밀번호가 요구사항을 충족하지 않습니다.',
          errors: passwordValidation.errors
        },
        { status: 400 }
      );
    }

    // 이메일 중복 검사
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json(
        { message: '이미 사용 중인 이메일입니다.' },
        { status: 400 }
      );
    }

    // 비밀번호 암호화
    const hashedPassword = await bcrypt.hash(password, 12);

    // 사용자 생성
    const user = await (prisma.user as any).create({
      data: {
        email,
        name: name.trim(),
        phone: phone?.trim() || null,
        position: position?.trim() || null,
        password: hashedPassword,
      },
    });

    // 비밀번호를 제외한 사용자 정보 반환
    const { password: _, ...userWithoutPassword } = user;

    return NextResponse.json(
      { 
        message: '회원가입이 완료되었습니다.',
        user: userWithoutPassword 
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
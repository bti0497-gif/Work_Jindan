import { NextRequest, NextResponse } from 'next/server';
import { validatePassword } from '@/lib/password-validation';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const { email, password, name, phone, position, username, address, addressDetail } = await request.json();

    // 입력 검증
    if (!email || !password || !name || !username) {
      return NextResponse.json(
        { message: '아이디, 이메일, 비밀번호, 이름은 필수 항목입니다.' },
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

    // 비밀번호 유효성 검사
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { message: passwordValidation.errors.join(', ') },
        { status: 400 }
      );
    }

    // 아이디 중복 검사 (Firestore Admin SDK)
    const usersRef = adminDb.collection('users');
    const snapshot = await usersRef.where('username', '==', username).get();
    
    if (!snapshot.empty) {
      return NextResponse.json(
        { message: '이미 사용 중인 아이디입니다.' },
        { status: 400 }
      );
    }

    // Firebase Authentication에 사용자 생성 (Admin SDK)
    const userRecord = await adminAuth.createUser({
      email: email,
      password: password,
      displayName: name,
    });

    // Firestore에 사용자 정보 저장 (Admin SDK)
    await usersRef.doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: email,
      username: username, // 아이디 저장
      name: name,
      phone: phone || '',
      position: position || '',
      address: address || '',
      addressDetail: addressDetail || '',
      userLevel: 2, // 기본값: 일반 사용자
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true
    });

    return NextResponse.json(
      { message: '회원가입이 완료되었습니다.', userId: userRecord.uid },
      { status: 201 }
    );

  } catch (error: any) {
    console.error('회원가입 오류:', error);
    return NextResponse.json(
      { message: '회원가입 중 오류가 발생했습니다.', error: error.message },
      { status: 500 }
    );
  }
}

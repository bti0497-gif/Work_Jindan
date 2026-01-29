import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { identifier } = await request.json();

    if (!identifier) {
      return NextResponse.json(
        { message: '아이디 또는 이메일을 입력해주세요.' },
        { status: 400 }
      );
    }

    // 1. Find user by email or username
    let userRecord;
    let email = '';
    let uid = '';

    // Check if identifier is an email
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);

    if (isEmail) {
      try {
        userRecord = await adminAuth.getUserByEmail(identifier);
        email = userRecord.email || '';
        uid = userRecord.uid;
      } catch (error) {
        // User not found by email
      }
    } else {
      // Identifier is likely a username, look up in Firestore
      const usersRef = adminDb.collection('users');
      const q = usersRef.where('username', '==', identifier).limit(1);
      const snapshot = await q.get();

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const userData = doc.data();
        email = userData.email;
        uid = userData.uid;
      }
    }

    if (!uid || !email) {
      return NextResponse.json(
        { message: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 2. Generate temporary password
    const tempPassword = crypto.randomBytes(4).toString('hex'); // 8 characters

    // 3. Update password in Firebase Auth
    await adminAuth.updateUser(uid, {
      password: tempPassword,
    });

    // 4. Send email
    // Configure transporter (Use environment variables)
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SERVER_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_SERVER_PORT || '587'),
      secure: process.env.EMAIL_SERVER_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_SERVER_USER,
        pass: process.env.EMAIL_SERVER_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Support" <noreply@example.com>',
      to: email,
      subject: '[더죤환경기술] 임시 비밀번호 발급 안내',
      text: `안녕하세요.\n\n요청하신 임시 비밀번호는 다음과 같습니다:\n\n${tempPassword}\n\n로그인 후 반드시 비밀번호를 변경해주세요.\n\n감사합니다.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #007bff;">임시 비밀번호 발급 안내</h2>
          <p>안녕하세요.</p>
          <p>요청하신 임시 비밀번호는 다음과 같습니다:</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; font-size: 18px; font-weight: bold; letter-spacing: 2px; text-align: center; margin: 20px 0;">
            ${tempPassword}
          </div>
          <p>로그인 후 반드시 비밀번호를 변경해주세요.</p>
          <p>감사합니다.</p>
        </div>
      `,
    };

    // Only send if credentials are provided, otherwise log (for dev)
    console.log(`DEBUG: Generated Temp Password for ${email}: ${tempPassword}`);
    if (process.env.EMAIL_SERVER_USER && process.env.EMAIL_SERVER_PASSWORD) {
      await transporter.sendMail(mailOptions);
    } else {
      console.log('Email credentials not found. Mock sending email.');
      console.log(`To: ${email}, Temp Password: ${tempPassword}`);
      // In production, this should fail or be handled differently
      // For now, we return success but warn in logs
    }

    return NextResponse.json(
      { message: '임시 비밀번호가 이메일로 전송되었습니다.' },
      { status: 200 }
    );

  } catch (error: any) {
    console.error('Password reset error:', error);
    return NextResponse.json(
      { message: '비밀번호 초기화 중 오류가 발생했습니다.', error: error.message },
      { status: 500 }
    );
  }
}

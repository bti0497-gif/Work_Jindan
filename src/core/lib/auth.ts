import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { adminDb } from '@/lib/firebase-admin';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'text' }, // type changed to text to allow username
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        let emailToUse = credentials.email;

        // 이메일 형식이 아닌 경우 아이디(username)로 간주하고 이메일 조회
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(credentials.email)) {
          try {
            // Admin SDK를 사용하여 사용자 조회 (권한 문제 해결)
            const usersRef = adminDb.collection('users');
            const snapshot = await usersRef.where('username', '==', credentials.email).limit(1).get();

            if (!snapshot.empty) {
              const userDoc = snapshot.docs[0];
              emailToUse = userDoc.data().email;
            } else {
              // 아이디를 찾을 수 없음
              return null;
            }
          } catch (error) {
            console.error('Username lookup error:', error);
            return null;
          }
        }

        try {
          console.log(`Attempting login for: ${emailToUse}`);
          // Firebase Authentication으로 로그인 (Client SDK 사용 - 비밀번호 검증용)
          const userCredential = await signInWithEmailAndPassword(
            auth, 
            emailToUse, 
            credentials.password
          );
          console.log('Login successful for:', emailToUse);
          
          const firebaseUser = userCredential.user;
          
          // Firestore에서 사용자 정보 가져오기 (Admin SDK 사용 - 권한 문제 해결)
          const userDoc = await adminDb.collection('users').doc(firebaseUser.uid).get();
          
          if (!userDoc.exists) {
            console.log('User document not found in Firestore');
            return null;
          }
          
          const userData = userDoc.data();

          return {
            id: firebaseUser.uid,
            email: firebaseUser.email,
            name: userData?.name,
            image: userData?.avatar || null,
            userLevel: userData?.userLevel,
            phone: userData?.phone,
            position: userData?.position,
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      }
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, account, user }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      if (user) {
        token.id = user.id;
        token.userLevel = (user as any).userLevel;
        token.phone = (user as any).phone;
        token.position = (user as any).position;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      if (token.id) {
        session.user.id = token.id as string;
        (session.user as any).userLevel = token.userLevel;
        (session.user as any).phone = token.phone;
        (session.user as any).position = token.position;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
};

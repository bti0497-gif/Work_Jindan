import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.error('Firebase Admin initialization error', error);
  }
}

console.log('Admin Init Check:', {
  apps: admin.apps.length,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  hasEmail: !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  hasKey: !!process.env.FIREBASE_ADMIN_PRIVATE_KEY
});

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();

import { google } from 'googleapis';
import prisma from '@/lib/prisma';

// Helper to get authenticated client (System Level)
// Requires GOOGLE_REFRESH_TOKEN in .env for offline access without user session
async function getSystemDriveClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN; 

  if (!clientId || !clientSecret || !refreshToken) {
    // Fallback: Check if we are in Electron and can read local tokens? 
    // Usually environment variables are better for server-side logic.
    // We log a warning but don't crash.
    console.warn('Google API credentials (CLIENT_ID, SECRET, REFRESH_TOKEN) missing. Skipping Drive Sync.');
    return null;
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  return google.drive({ version: 'v3', auth });
}

const DB_FOLDER_NAME = 'Work_Jindan';

async function ensureDatabaseFolder(drive: any) {
  try {
    // 1. 환경 변수에 폴더 ID가 설정되어 있으면 우선적으로 사용
    const envFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (envFolderId) {
      try {
        const res = await drive.files.get({
          fileId: envFolderId,
          fields: 'id, name, trashed',
        });
        if (!res.data.trashed) {
          return res.data.id;
        }
      } catch (e) {
        console.warn('GOOGLE_DRIVE_FOLDER_ID is invalid or inaccessible. Falling back to name search.');
      }
    }

    // 2. 이름으로 폴더 검색
    const res = await drive.files.list({
      q: `name = '${DB_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
    });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id;
    }

    // 3. 없으면 새로 생성
    const fileMetadata = {
      name: DB_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    };
    const folder = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id',
    });
    return folder.data.id;
  } catch (error) {
    console.error('Error ensuring database folder:', error);
    throw error;
  }
}

async function syncJsonFile(drive: any, folderId: string, fileName: string, data: any) {
  try {
    const jsonContent = JSON.stringify(data, null, 2);
    
    // Check if file exists
    const res = await drive.files.list({
      q: `name = '${fileName}' and '${folderId}' in parents and trashed = false`,
      fields: 'files(id, name)',
    });

    const file = res.data.files?.[0];

    const media = {
      mimeType: 'application/json',
      body: jsonContent,
    };

    if (file) {
      // Update
      await drive.files.update({
        fileId: file.id,
        media: media,
      });
      console.log(`Updated ${fileName} on Drive.`);
    } else {
      // Create
      await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId],
        },
        media: media,
      });
      console.log(`Created ${fileName} on Drive.`);
    }
  } catch (error) {
    console.error(`Error syncing file ${fileName}:`, error);
  }
}

export async function syncUsersToDrive() {
  try {
    const drive = await getSystemDriveClient();
    if (!drive) return;

    // Get all users from Prisma
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        position: true,
        userLevel: true,
        createdAt: true
      }
    });

    const folderId = await ensureDatabaseFolder(drive);
    await syncJsonFile(drive, folderId, 'users.json', users);

  } catch (error) {
    console.error('Failed to sync users to Drive:', error);
  }
}

export async function syncPostsToDrive() {
  try {
    const drive = await getSystemDriveClient();
    if (!drive) return;

    const posts = await prisma.post.findMany({
      include: {
        author: {
          select: { name: true, email: true }
        }
      }
    });

    const folderId = await ensureDatabaseFolder(drive);
    await syncJsonFile(drive, folderId, 'posts.json', posts);

  } catch (error) {
    console.error('Failed to sync posts to Drive:', error);
  }
}

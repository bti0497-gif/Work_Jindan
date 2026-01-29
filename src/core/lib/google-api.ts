import { google } from 'googleapis';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { Readable } from 'stream';

// 구글 API 연결 상태 확인
export async function checkGoogleConnection() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.accessToken) {
      return { connected: false, error: 'No access token available' };
    }

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return { connected: false, error: 'Google API credentials not configured' };
    }

    // 간단한 API 호출로 연결 테스트
    const drive = await getGoogleDriveClient();
    await drive.about.get({ fields: 'user' });
    
    return { connected: true, error: null };
  } catch (error) {
    return { connected: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getGoogleDriveClient() {
  const session = await getServerSession(authOptions);
  
  if (!session?.accessToken) {
    throw new Error('No access token available. Please authenticate with Google.');
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Google API credentials not configured');
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  auth.setCredentials({
    access_token: session.accessToken,
  });

  return google.drive({ version: 'v3', auth });
}

export async function getGoogleCalendarClient() {
  const session = await getServerSession(authOptions);
  
  if (!session?.accessToken) {
    throw new Error('No access token available. Please authenticate with Google.');
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Google API credentials not configured');
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  auth.setCredentials({
    access_token: session.accessToken,
  });

  return google.calendar({ version: 'v3', auth });
}

export async function listDriveFiles() {
  try {
    const drive = await getGoogleDriveClient();
    
    const response = await drive.files.list({
      pageSize: 20,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size)',
      orderBy: 'modifiedTime desc',
    });

    return response.data.files || [];
  } catch (error) {
    console.error('Failed to list drive files:', error);
    throw new Error('Failed to access Google Drive');
  }
}

export async function createDriveFolder(name: string, parentId?: string) {
  try {
    const drive = await getGoogleDriveClient();
    
    const fileMetadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id, name',
    });

    return response.data;
  } catch (error) {
    console.error('Failed to create drive folder:', error);
    throw new Error('Failed to create folder in Google Drive');
  }
}

export async function uploadFileToDrive(
  file: Buffer,
  fileName: string,
  mimeType: string,
  parentId?: string
) {
  try {
    const drive = await getGoogleDriveClient();
    
    const fileMetadata = {
      name: fileName,
      parents: parentId ? [parentId] : undefined,
    };

    const media = {
      mimeType,
      body: Readable.from(file),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, name, size',
    });

    return response.data;
  } catch (error) {
    console.error('Failed to upload file to drive:', error);
    throw new Error('Failed to upload file to Google Drive');
  }
}

export async function deleteFileFromDrive(fileId: string) {
  try {
    const drive = await getGoogleDriveClient();
    
    await drive.files.delete({
      fileId,
    });

    return { success: true, fileId };
  } catch (error) {
    console.error('Failed to delete file from drive:', error);
    throw new Error('Failed to delete file from Google Drive');
  }
}

export async function downloadFileFromDrive(fileId: string) {
  try {
    const drive = await getGoogleDriveClient();
    
    const response = await drive.files.get({
      fileId,
      alt: 'media',
    });

    return response.data;
  } catch (error) {
    console.error('Failed to download file from drive:', error);
    throw new Error('Failed to download file from Google Drive');
  }
}

export async function listCalendarEvents() {
  try {
    const calendar = await getGoogleCalendarClient();
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 20,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return response.data.items || [];
  } catch (error) {
    console.error('Failed to list calendar events:', error);
    throw new Error('Failed to access Google Calendar');
  }
}

export async function createCalendarEvent(event: {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  attendees?: string[];
}) {
  try {
    const calendar = await getGoogleCalendarClient();
    
    const eventResource = {
      summary: event.summary,
      description: event.description,
      start: {
        dateTime: event.startDateTime,
        timeZone: 'Asia/Seoul',
      },
      end: {
        dateTime: event.endDateTime,
        timeZone: 'Asia/Seoul',
      },
      attendees: event.attendees?.map(email => ({ email })),
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: eventResource,
    });

    return response.data;
  } catch (error) {
    console.error('Failed to create calendar event:', error);
    throw new Error('Failed to create Google Calendar event');
  }
}

export async function updateDriveFileName(fileId: string, newName: string) {
  try {
    const drive = await getGoogleDriveClient();
    
    const response = await drive.files.update({
      fileId,
      requestBody: {
        name: newName,
      },
    });

    return response.data;
  } catch (error) {
    console.error('Failed to update drive file name:', error);
    throw new Error('Failed to update file name in Google Drive');
  }
}
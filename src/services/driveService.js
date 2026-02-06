/**
 * Google Drive API v3 연동 서비스
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = import.meta.env.VITE_GOOGLE_REFRESH_TOKEN;
const FOLDER_ID = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID;

let accessToken = '';

/**
 * 리프레시 토큰을 사용하여 새로운 액세스 토큰을 가져옵니다.
 */
export const getAccessToken = async () => {
    console.log('Refreshing Google Access Token...');
    try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                refresh_token: REFRESH_TOKEN,
                grant_type: 'refresh_token',
            }),
        });

        const data = await response.json();
        if (data.access_token) {
            accessToken = data.access_token;
            console.log('Access Token Refreshed Successfully');
            return accessToken;
        } else {
            console.error('Failed to refresh token API Response:', data);
            throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
        }
    } catch (error) {
        console.error('Error fetching access token:', error);
        throw error;
    }
};

/**
 * 특정 폴더 내의 파일 리스트를 가져옵니다.
 * @param {string} folderId - 조회할 폴더의 ID (생략 시 기본 폴더 ID 사용)
 */
export const getFiles = async (folderId = FOLDER_ID) => {
    if (!accessToken) {
        await getAccessToken();
    }

    try {
        // q 파라미터: 특정 폴더 내의 삭제되지 않은 파일만 조회
        const q = `'${folderId}' in parents and trashed = false`;
        console.log(`Fetching files from folder: ${folderId}`);

        // 공유 드라이브(Shared Drive) 지원을 위해 supportsAllDrives, includeItemsFromAllDrives 추가
        const url = new URL('https://www.googleapis.com/drive/v3/files');
        url.searchParams.append('q', q);
        url.searchParams.append('fields', 'files(id, name, size, modifiedTime, owners, mimeType, webContentLink)');
        url.searchParams.append('pageSize', '50');
        url.searchParams.append('orderBy', 'modifiedTime desc');
        url.searchParams.append('supportsAllDrives', 'true');
        url.searchParams.append('includeItemsFromAllDrives', 'true');

        const response = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (response.status === 401) {
            console.warn('Access token expired, retrying after refresh...');
            await getAccessToken();
            return getFiles(folderId);
        }

        const data = await response.json();

        if (data.error) {
            console.error('Drive API Error:', data.error);
            throw new Error(data.error.message);
        }

        console.log(`Successfully fetched ${data.files?.length || 0} files.`);

        // 디버깅: 만약 파일이 0개라면, 토큰이 볼 수 있는 모든 파일을 출력해봅니다.
        if (!data.files || data.files.length === 0) {
            console.warn('No files found in designated folder. Running debug check...');
            // getAllFilesDebug(); // 필수는 아니므로 주석 처리 가능
        }

        return data.files || [];
    } catch (error) {
        console.error('Error in getFiles service:', error);
        throw error;
    }
};

/**
 * [DEBUG] 토큰이 접근 가능한 모든 파일을 조회하여 권한 및 폴더 구조를 파악합니다.
 */
export const getAllFilesDebug = async () => {
    if (!accessToken) await getAccessToken();
    try {
        console.log('--- DEBUG: Listing ALL accessible files ---');
        const url = new URL('https://www.googleapis.com/drive/v3/files');
        url.searchParams.append('pageSize', '20');
        url.searchParams.append('fields', 'files(id, name, parents, mimeType)');
        url.searchParams.append('supportsAllDrives', 'true');
        url.searchParams.append('includeItemsFromAllDrives', 'true');

        const response = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await response.json();
        console.log('Total files visible to this token:', data.files?.length);
        console.table(data.files?.map(f => ({ name: f.name, id: f.id, parent: f.parents?.[0], type: f.mimeType })));
        console.log('--- DEBUG END ---');
    } catch (err) {
        console.error('Debug fetch failed:', err);
    }
};

/**
 * 파일을 지정된 폴더로 업로드합니다.
 */
export const uploadFile = async (file, folderId = FOLDER_ID, customName = null) => {
    if (!accessToken) {
        await getAccessToken();
    }

    const fileName = customName || file.name;
    console.log(`Starting upload for file: ${fileName} to folder: ${folderId}`);

    const metadata = {
        name: fileName,
        parents: [folderId]
    };

    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', file);

    try {
        // 업로드 시에도 공유 드라이브 지원 파라미터 추가
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            body: formData,
        });

        if (response.status === 401) {
            await getAccessToken();
            return uploadFile(file, folderId);
        }

        const data = await response.json();
        if (data.error) {
            console.error('Upload API Error:', data.error);
            throw new Error(data.error.message);
        }

        console.log('Upload successful:', data);
        return data;
    } catch (error) {
        console.error('Error in uploadFile service:', error);
        throw error;
    }
};

/**
 * 새 폴더를 생성합니다.
 */
export const createFolder = async (folderName, folderId = FOLDER_ID) => {
    if (!accessToken) await getAccessToken();

    const metadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [folderId]
    };

    try {
        const response = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(metadata),
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data;
    } catch (error) {
        console.error('Error creating folder:', error);
        throw error;
    }
};

/**
 * 파일을 삭제(휴지통 이동)합니다.
 */
export const deleteFile = async (fileId) => {
    if (!accessToken) await getAccessToken();

    try {
        // 실제 삭제 대신 trashed 속성을 true로 변경하는 업데이트 권장
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ trashed: true }),
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data;
    } catch (error) {
        console.error('Error deleting file:', error);
        throw error;
    }
};

/**
 * 파일의 위치를 이동시킵니다.
 */
export const moveFile = async (fileId, currentParentId, newParentId) => {
    if (!accessToken) await getAccessToken();

    try {
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?removeParents=${currentParentId}&addParents=${newParentId}&supportsAllDrives=true`;
        const response = await fetch(url, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data;
    } catch (error) {
        console.error('Error moving file:', error);
        throw error;
    }
};

/**
 * 파일 또는 폴더의 이름을 변경합니다.
 */
export const renameFile = async (fileId, newName) => {
    if (!accessToken) await getAccessToken();

    try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: newName }),
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data;
    } catch (error) {
        console.error('Error renaming file:', error);
        throw error;
    }
};

/**
 * 파일 다운로드 URL을 생성하거나 파일을 가져옵니다.
 */
export const downloadFile = async (fileId, fileName) => {
    if (!accessToken) await getAccessToken();

    try {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) throw new Error('Download failed');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error downloading file:', error);
        alert('파일을 다운로드할 수 없습니다. (권한 또는 파일 형식 문제)');
    }
};

/**
 * 파일 사이즈를 읽기 좋은 형식으로 변환합니다.
 */
export const formatFileSize = (bytes) => {
    if (!bytes || bytes === '0' || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

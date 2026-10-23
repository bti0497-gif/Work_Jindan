import { loadEnv } from 'vite';

export const loadLegacyMembers = async () => {
    const env = loadEnv('production', process.cwd(), '');
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', body: new URLSearchParams({
            client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
            refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token',
        }),
    });
    const auth = await response.json();
    if (!response.ok || !auth.access_token) throw new Error('Could not authenticate to the legacy Drive backup.');
    const headers = { Authorization: `Bearer ${auth.access_token}` };
    const files = async parent => {
        const result = [];
        let pageToken;
        do {
            const url = new URL('https://www.googleapis.com/drive/v3/files');
            url.search = new URLSearchParams({
                q: `'${parent}' in parents and trashed = false`, fields: 'files(id,name,mimeType,modifiedTime),nextPageToken',
                pageSize: '1000', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
                ...(pageToken ? { pageToken } : {}),
            });
            const response = await fetch(url, { headers });
            const data = await response.json();
            if (!response.ok) throw new Error('Could not list the legacy Drive backup.');
            result.push(...(data.files || [])); pageToken = data.nextPageToken;
        } while (pageToken);
        return result;
    };
    const content = async file => {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`, { headers });
        if (!response.ok) throw new Error('Could not read the legacy member backup.');
        return response.json();
    };
    const root = await files(env.VITE_GOOGLE_DRIVE_FOLDER_ID || env.GOOGLE_DRIVE_FOLDER_ID);
    const system = root.find(file => file.name.toLowerCase() === '.system');
    if (!system) throw new Error('Legacy system folder not found.');
    const json = (await files(system.id)).find(file => file.name.toLowerCase() === 'json');
    if (!json) throw new Error('Legacy JSON folder not found.');
    const logs = (await files(json.id)).filter(file => file.name.startsWith('회원관리_'))
        .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
    const newer = [];
    let snapshot;
    for (const file of logs) {
        const data = await content(file);
        if (Array.isArray(data)) { snapshot = data; break; }
        newer.unshift(data);
    }
    if (!snapshot) throw new Error('A complete legacy member snapshot was not found.');
    const members = new Map(snapshot.map(member => [member.person_id, member]));
    for (const member of newer) if (member.person_id) members.set(member.person_id, member);
    return [...members.values()];
};

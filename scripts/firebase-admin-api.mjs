import { execFileSync } from 'node:child_process';

export const project = 'work-jindan';
export const adminApi = () => {
    const token = (process.platform === 'win32'
        ? execFileSync('powershell.exe', ['-NoProfile', '-Command', 'gcloud auth print-access-token'], { encoding: 'utf8' })
        : execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' })).trim();
    return async (url, method = 'GET', body) => {
        const response = await fetch(url, {
            method,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': project },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(`${method} ${new URL(url).pathname}: ${data.error?.message || response.status}`);
        return data;
    };
};

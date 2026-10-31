const fs = require('node:fs');
const path = require('node:path');

// Main process only. Refresh credentials stay in Windows-encrypted local settings.
function createDriveAuth({ userDataPath, safeStorage, envFile, env = process.env, fetchImpl = fetch, now = Date.now }) {
    const file = path.join(userDataPath, 'drive-connection.json');
    let token = '', expiresAt = 0, pending;
    const credentials = () => {
        if (fs.existsSync(file)) {
            if (!safeStorage?.isEncryptionAvailable()) throw new Error('이 PC의 드라이브 연결 정보를 해독할 수 없습니다.');
            try {
                const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
                return JSON.parse(safeStorage.decryptString(Buffer.from(saved.encryptedCredentials, 'base64')));
            } catch { throw new Error('저장된 드라이브 연결 정보를 확인하세요.'); }
        }
        const local = {};
        if (envFile && fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
            const match = /^\s*(GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|GOOGLE_REFRESH_TOKEN)\s*=\s*(.*?)\s*$/.exec(line);
            if (match) local[match[1]] = /^(["']).*\1$/.test(match[2]) ? match[2].slice(1,-1) : match[2].replace(/\s+#.*$/, '').trim();
        }
        return { clientId: env.GOOGLE_CLIENT_ID || local.GOOGLE_CLIENT_ID || '', clientSecret: env.GOOGLE_CLIENT_SECRET || local.GOOGLE_CLIENT_SECRET || '', refreshToken: env.GOOGLE_REFRESH_TOKEN || local.GOOGLE_REFRESH_TOKEN || '' };
    };
    const valid = config => config && ['clientId','clientSecret','refreshToken'].every(key => typeof config[key] === 'string' && config[key].trim() && config[key].length < 16000);
    const status = () => { const config = credentials(); return { configured: !!valid(config), storage: fs.existsSync(file) ? 'encrypted-local' : valid(config) ? 'environment' : 'none' }; };
    const configure = config => {
        if (!valid(config)) throw new Error('드라이브 연결 설정의 필수 값이 없습니다.');
        if (!safeStorage?.isEncryptionAvailable()) throw new Error('이 PC에서 연결 정보를 안전하게 저장할 수 없습니다.');
        const value = JSON.stringify({ clientId: config.clientId.trim(), clientSecret: config.clientSecret.trim(), refreshToken: config.refreshToken.trim() });
        const encryptedCredentials = safeStorage.encryptString(value).toString('base64');
        fs.mkdirSync(userDataPath, { recursive: true });
        fs.writeFileSync(`${file}.tmp`, JSON.stringify({ version: 1, encryptedCredentials })); fs.renameSync(`${file}.tmp`, file);
        token = ''; expiresAt = 0;
        return status();
    };
    const getToken = ({ force = false } = {}) => {
        if (typeof force !== 'boolean') return Promise.reject(new Error('드라이브 인증 요청 형식이 올바르지 않습니다.'));
        if (pending) return pending;
        if (!force && token && now() < expiresAt - 60000) return Promise.resolve(token);
        pending = (async () => {
            const config = credentials();
            if (!valid(config)) throw new Error('드라이브 인증 연결이 설정되지 않았습니다. 기존 연결 설정을 복구하세요.');
            let response;
            try {
                response = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken, grant_type: 'refresh_token' }), signal: AbortSignal.timeout(20000) });
            } catch { throw new Error('Google Drive 인증 서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.'); }
            const data = await response.json().catch(() => ({}));
            if (!response.ok || typeof data.access_token !== 'string' || !data.access_token) {
                token = ''; expiresAt = 0;
                throw new Error(data.error === 'invalid_grant' ? '기존 드라이브 인증이 만료되었거나 취소되었습니다. 드라이브 재연결이 필요합니다.' : `Google Drive 인증에 실패했습니다 (${response.status}). 연결 설정을 확인하세요.`);
            }
            token = data.access_token; expiresAt = now() + Math.max(0, Number(data.expires_in) || 0) * 1000;
            return token;
        })().finally(() => { pending = null; });
        return pending;
    };
    return { configure, status, getToken };
}
module.exports = { createDriveAuth };

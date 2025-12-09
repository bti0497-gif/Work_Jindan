const { google } = require('googleapis');
const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs').promises;

class GoogleAuthService {
    constructor() {
        this.oauth2Client = null;
        this.credentials = null;
        this.tokens = null;
    }

    // Google OAuth 인증 서비스 초기화
    async initialize() {
        try {
            // credentials.json 파일 로드
            const credentialsPath = path.join(
                require('electron').app.getPath('userData'), 
                'google-credentials.json'
            );
            
            const credentialsData = await fs.readFile(credentialsPath, 'utf8');
            this.credentials = JSON.parse(credentialsData);
            
            const { client_secret, client_id, redirect_uris } = this.credentials.installed;
            
            // OAuth2 클라이언트 생성
            this.oauth2Client = new google.auth.OAuth2(
                client_id,
                client_secret,
                redirect_uris[0] // http://localhost
            );

            // 저장된 토큰 확인
            const tokensPath = path.join(
                require('electron').app.getPath('userData'),
                'google-tokens.json'
            );

            try {
                const tokensData = await fs.readFile(tokensPath, 'utf8');
                this.tokens = JSON.parse(tokensData);
                this.oauth2Client.setCredentials(this.tokens);
                
                // 토큰 유효성 검사
                await this.validateTokens();
                return true;
            } catch (error) {
                console.log('저장된 토큰이 없거나 유효하지 않습니다. 새로운 인증이 필요합니다.');
                return false;
            }
        } catch (error) {
            console.error('Google Auth 초기화 실패:', error);
            throw error;
        }
    }

    // 토큰 유효성 검사
    async validateTokens() {
        try {
            // 간단한 API 호출로 토큰 유효성 확인
            const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
            await drive.about.get({ fields: 'user' });
            console.log('Google 토큰이 유효합니다.');
            return true;
        } catch (error) {
            console.log('토큰이 만료되었거나 유효하지 않습니다:', error.message);
            // 토큰 갱신 시도
            return await this.refreshTokens();
        }
    }

    // 토큰 갱신
    async refreshTokens() {
        try {
            const { credentials } = await this.oauth2Client.refreshAccessToken();
            this.tokens = credentials;
            await this.saveTokens();
            console.log('토큰이 갱신되었습니다.');
            return true;
        } catch (error) {
            console.error('토큰 갱신 실패:', error);
            return false;
        }
    }

    // 새로운 OAuth 인증 시작
    async authenticate() {
        return new Promise((resolve, reject) => {
            // OAuth URL 생성
            const authUrl = this.oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: [
                    'https://www.googleapis.com/auth/drive.file',
                    'https://www.googleapis.com/auth/userinfo.profile',
                    'https://www.googleapis.com/auth/userinfo.email'
                ],
                prompt: 'consent' // 항상 동의 화면 표시
            });

            // 인증 창 생성
            const authWindow = new BrowserWindow({
                width: 500,
                height: 700,
                show: false,
                autoHideMenuBar: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });

            // 인증 URL 로드
            authWindow.loadURL(authUrl);
            authWindow.show();

            // URL 변경 감지 (리다이렉트 확인)
            authWindow.webContents.on('will-redirect', async (event, navigationUrl) => {
                await this.handleAuthCallback(navigationUrl, authWindow, resolve, reject);
            });

            authWindow.webContents.on('did-navigate', async (event, navigationUrl) => {
                await this.handleAuthCallback(navigationUrl, authWindow, resolve, reject);
            });

            // 창 닫힘 이벤트
            authWindow.on('closed', () => {
                reject(new Error('사용자가 인증을 취소했습니다.'));
            });
        });
    }

    // 인증 콜백 처리
    async handleAuthCallback(url, authWindow, resolve, reject) {
        try {
            if (url.includes('localhost') && url.includes('code=')) {
                // 인증 코드 추출
                const urlObj = new URL(url);
                const authCode = urlObj.searchParams.get('code');

                if (authCode) {
                    // 인증 코드로 토큰 교환
                    const { tokens } = await this.oauth2Client.getToken(authCode);
                    this.tokens = tokens;
                    this.oauth2Client.setCredentials(tokens);

                    // 토큰 저장
                    await this.saveTokens();

                    // 인증 창 닫기
                    authWindow.close();

                    console.log('Google 인증이 완료되었습니다.');
                    resolve(tokens);
                }
            } else if (url.includes('error=')) {
                const urlObj = new URL(url);
                const error = urlObj.searchParams.get('error');
                authWindow.close();
                reject(new Error(`인증 오류: ${error}`));
            }
        } catch (error) {
            authWindow.close();
            reject(error);
        }
    }

    // 토큰 저장
    async saveTokens() {
        try {
            const tokensPath = path.join(
                require('electron').app.getPath('userData'),
                'google-tokens.json'
            );
            await fs.writeFile(tokensPath, JSON.stringify(this.tokens, null, 2));
            console.log('토큰이 저장되었습니다.');
        } catch (error) {
            console.error('토큰 저장 실패:', error);
        }
    }

    // 인증된 OAuth 클라이언트 반환
    getAuthenticatedClient() {
        if (!this.oauth2Client || !this.tokens) {
            throw new Error('인증이 완료되지 않았습니다.');
        }
        return this.oauth2Client;
    }

    // 사용자 정보 가져오기
    async getUserInfo() {
        try {
            const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
            const response = await oauth2.userinfo.get();
            return response.data;
        } catch (error) {
            console.error('사용자 정보 가져오기 실패:', error);
            throw error;
        }
    }

    // 로그아웃 (토큰 삭제)
    async logout() {
        try {
            const tokensPath = path.join(
                require('electron').app.getPath('userData'),
                'google-tokens.json'
            );
            await fs.unlink(tokensPath);
            this.tokens = null;
            this.oauth2Client.setCredentials({});
            console.log('로그아웃이 완료되었습니다.');
        } catch (error) {
            console.error('로그아웃 중 오류:', error);
        }
    }
}

module.exports = GoogleAuthService;
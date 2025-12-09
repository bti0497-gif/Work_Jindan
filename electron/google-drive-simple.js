const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class GoogleDriveDB {
    constructor() {
        this.drive = null;
        this.auth = null;
        this.databaseFolderId = null;
        this.initialized = false;
    }

    // 간단한 Google Drive 초기화
    async initialize() {
        try {
            console.log('=== Google Drive DB 초기화 시작 ===');
            
            // credentials.json 파일 로드
            const credentialsPath = path.join(
                require('electron').app.getPath('userData'), 
                'google-credentials.json'
            );
            
            const credentialsData = await fs.readFile(credentialsPath, 'utf8');
            const credentials = JSON.parse(credentialsData);
            
            const { client_secret, client_id, redirect_uris } = credentials.installed;
            
            // OAuth2 클라이언트 생성
            this.auth = new google.auth.OAuth2(
                client_id,
                client_secret,
                redirect_uris[0]
            );

            // 저장된 토큰 로드
            const tokensPath = path.join(
                require('electron').app.getPath('userData'),
                'google-tokens.json'
            );

            try {
                const tokensData = await fs.readFile(tokensPath, 'utf8');
                const tokens = JSON.parse(tokensData);
                this.auth.setCredentials(tokens);
                
                // Drive API 인스턴스 생성
                this.drive = google.drive({ version: 'v3', auth: this.auth });
                
                // 간단한 연결 테스트
                await this.drive.about.get({ fields: 'user' });
                console.log('Google Drive 연결 성공!');
                
                // 데이터베이스 폴더 확인/생성
                await this.ensureDatabaseFolder();
                
                this.initialized = true;
                console.log('=== Google Drive DB 초기화 완료 ===');
                return true;
                
            } catch (error) {
                console.log('토큰이 없거나 만료됨. 새로운 인증 필요:', error.message);
                return false;
            }
            
        } catch (error) {
            console.error('Google Drive DB 초기화 실패:', error);
            return false;
        }
    }

    // 데이터베이스 폴더 확인/생성
    async ensureDatabaseFolder() {
        try {
            // 기존 폴더 검색
            const response = await this.drive.files.list({
                q: "name='JindanTeam_Database' and mimeType='application/vnd.google-apps.folder'",
                fields: 'files(id, name)'
            });

            if (response.data.files.length > 0) {
                this.databaseFolderId = response.data.files[0].id;
                console.log('기존 데이터베이스 폴더 발견:', this.databaseFolderId);
            } else {
                // 새 폴더 생성
                const folderResponse = await this.drive.files.create({
                    requestBody: {
                        name: 'JindanTeam_Database',
                        mimeType: 'application/vnd.google-apps.folder'
                    }
                });
                this.databaseFolderId = folderResponse.data.id;
                console.log('새 데이터베이스 폴더 생성:', this.databaseFolderId);
                
                // 초기 사용자 파일 생성
                await this.createInitialUserFile();
            }
        } catch (error) {
            console.error('데이터베이스 폴더 설정 실패:', error);
            throw error;
        }
    }

    // 초기 사용자 파일 생성
    async createInitialUserFile() {
        const initialUsers = [];
        await this.saveUsers(initialUsers);
        console.log('초기 사용자 파일 생성 완료');
    }

    // 사용자 데이터 저장
    async saveUsers(users) {
        try {
            const jsonData = JSON.stringify(users, null, 2);
            
            // 기존 파일 찾기
            const existingFile = await this.findFile('users.json');
            
            if (existingFile) {
                // 기존 파일 업데이트
                await this.drive.files.update({
                    fileId: existingFile.id,
                    media: {
                        mimeType: 'application/json',
                        body: jsonData
                    }
                });
                console.log('사용자 데이터 업데이트 완료');
            } else {
                // 새 파일 생성
                await this.drive.files.create({
                    requestBody: {
                        name: 'users.json',
                        parents: [this.databaseFolderId],
                        mimeType: 'application/json'
                    },
                    media: {
                        mimeType: 'application/json',
                        body: jsonData
                    }
                });
                console.log('새 사용자 파일 생성 완료');
            }
        } catch (error) {
            console.error('사용자 데이터 저장 실패:', error);
            throw error;
        }
    }

    // 사용자 데이터 로드
    async loadUsers() {
        try {
            const file = await this.findFile('users.json');
            if (!file) {
                console.log('사용자 파일이 없음. 빈 배열 반환');
                return [];
            }

            const response = await this.drive.files.get({
                fileId: file.id,
                alt: 'media'
            });

            return JSON.parse(response.data);
        } catch (error) {
            console.error('사용자 데이터 로드 실패:', error);
            return [];
        }
    }

    // 파일 찾기
    async findFile(fileName) {
        try {
            const response = await this.drive.files.list({
                q: `name='${fileName}' and parents in '${this.databaseFolderId}'`,
                fields: 'files(id, name)'
            });

            return response.data.files.length > 0 ? response.data.files[0] : null;
        } catch (error) {
            console.error(`파일 검색 실패 (${fileName}):`, error);
            return null;
        }
    }

    // 이메일로 사용자 찾기
    async findUserByEmail(email) {
        const users = await this.loadUsers();
        return users.find(user => user.email === email);
    }

    // 새 사용자 추가
    async addUser(userData) {
        const users = await this.loadUsers();
        const newUser = {
            id: Date.now().toString(),
            createdAt: new Date().toISOString(),
            ...userData
        };
        users.push(newUser);
        await this.saveUsers(users);
        return newUser;
    }
}

module.exports = GoogleDriveDB;
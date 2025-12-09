const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { app, dialog } = require('electron');

class UpdateManager {
    constructor() {
        this.drive = null;
        this.auth = null;
        this.updateFolderId = null;
        this.currentVersion = require('../package.json').version;
    }

    // 업데이트 관리자 초기화
    async initialize(googleCredentials) {
        try {
            console.log('업데이트 관리자 초기화 중...');
            
            // OAuth2 클라이언트 설정
            this.auth = new google.auth.OAuth2(
                googleCredentials.client_id,
                googleCredentials.client_secret,
                googleCredentials.redirect_uri
            );

            // 토큰 설정
            this.auth.setCredentials(googleCredentials.tokens);
            
            // Drive API 인스턴스 생성
            this.drive = google.drive({ version: 'v3', auth: this.auth });

            // 업데이트 폴더 찾기 또는 생성
            await this.ensureUpdateFolder();
            
            console.log('업데이트 관리자 초기화 완료');
            return true;
        } catch (error) {
            console.error('업데이트 관리자 초기화 실패:', error);
            return false;
        }
    }

    // 업데이트 폴더 확인 및 생성
    async ensureUpdateFolder() {
        try {
            // 기존 폴더 검색
            const response = await this.drive.files.list({
                q: "name='JindanTeam_Updates' and mimeType='application/vnd.google-apps.folder'",
                fields: 'files(id, name)'
            });

            if (response.data.files.length > 0) {
                this.updateFolderId = response.data.files[0].id;
                console.log('기존 업데이트 폴더 발견:', this.updateFolderId);
            } else {
                // 새 폴더 생성
                const folderResponse = await this.drive.files.create({
                    requestBody: {
                        name: 'JindanTeam_Updates',
                        mimeType: 'application/vnd.google-apps.folder'
                    }
                });
                this.updateFolderId = folderResponse.data.id;
                console.log('새 업데이트 폴더 생성:', this.updateFolderId);
                
                // 초기 버전 정보 파일 생성
                await this.createInitialVersionFile();
            }
        } catch (error) {
            console.error('업데이트 폴더 설정 실패:', error);
            throw error;
        }
    }

    // 초기 버전 정보 파일 생성
    async createInitialVersionFile() {
        const versionInfo = {
            version: this.currentVersion,
            releaseDate: new Date().toISOString(),
            description: '더죤환경기술(주) 기술진단팀 협업 시스템 초기 버전',
            features: [
                '프로젝트 관리',
                '작업 추적',
                '팀 협업',
                '파일 공유',
                '일정 관리'
            ],
            downloadUrl: null,
            mandatory: false
        };

        await this.saveVersionInfo(versionInfo);
    }

    // 버전 정보 저장
    async saveVersionInfo(versionInfo) {
        try {
            const jsonData = JSON.stringify(versionInfo, null, 2);
            
            // 기존 버전 파일 검색
            const existingFile = await this.findVersionFile();
            
            if (existingFile) {
                // 기존 파일 업데이트
                await this.drive.files.update({
                    fileId: existingFile.id,
                    media: {
                        mimeType: 'application/json',
                        body: jsonData
                    }
                });
                console.log('버전 정보 업데이트 완료');
            } else {
                // 새 파일 생성
                await this.drive.files.create({
                    requestBody: {
                        name: 'version-info.json',
                        parents: [this.updateFolderId],
                        mimeType: 'application/json'
                    },
                    media: {
                        mimeType: 'application/json',
                        body: jsonData
                    }
                });
                console.log('버전 정보 파일 생성 완료');
            }
        } catch (error) {
            console.error('버전 정보 저장 실패:', error);
            throw error;
        }
    }

    // 버전 정보 파일 찾기
    async findVersionFile() {
        try {
            const response = await this.drive.files.list({
                q: `name='version-info.json' and parents in '${this.updateFolderId}'`,
                fields: 'files(id, name)'
            });

            return response.data.files.length > 0 ? response.data.files[0] : null;
        } catch (error) {
            console.error('버전 파일 검색 실패:', error);
            return null;
        }
    }

    // 최신 버전 정보 확인 (버전 파일이 없으면 자동 생성)
    async checkForUpdates() {
        try {
            console.log(`현재 버전: ${this.currentVersion}`);
            
            let versionFile = await this.findVersionFile();
            
            // 버전 파일이 없으면 현재 버전으로 초기 생성
            if (!versionFile) {
                console.log('버전 정보 파일이 없습니다. 현재 버전으로 초기 파일을 생성합니다.');
                await this.createInitialVersionFile();
                return { hasUpdate: false, message: '초기 버전 파일 생성됨' };
            }

            // 버전 정보 다운로드
            const response = await this.drive.files.get({
                fileId: versionFile.id,
                alt: 'media'
            });

            const latestVersionInfo = JSON.parse(response.data);
            console.log(`최신 버전: ${latestVersionInfo.version}`);

            // 버전 비교
            const hasUpdate = this.compareVersions(this.currentVersion, latestVersionInfo.version) < 0;
            
            return {
                hasUpdate,
                currentVersion: this.currentVersion,
                latestVersion: latestVersionInfo.version,
                versionInfo: latestVersionInfo
            };
        } catch (error) {
            console.error('업데이트 확인 실패:', error);
            return { hasUpdate: false, error: error.message };
        }
    }

    // 버전 비교 함수 (semantic versioning)
    compareVersions(version1, version2) {
        const v1Parts = version1.split('.').map(Number);
        const v2Parts = version2.split('.').map(Number);
        
        for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
            const v1Part = v1Parts[i] || 0;
            const v2Part = v2Parts[i] || 0;
            
            if (v1Part < v2Part) return -1;
            if (v1Part > v2Part) return 1;
        }
        
        return 0;
    }

    // 업데이트 다이얼로그 표시
    async showUpdateDialog(updateInfo) {
        const { latestVersion, versionInfo } = updateInfo;
        
        const features = versionInfo.features 
            ? versionInfo.features.map(f => `• ${f}`).join('\n')
            : '• 성능 개선 및 버그 수정';

        const result = await dialog.showMessageBox(null, {
            type: 'info',
            title: '새 버전 업데이트',
            message: `새로운 버전이 있습니다! (v${latestVersion})`,
            detail: this.getUpdateMessage(versionInfo),
            buttons: ['지금 업데이트', '나중에', '이 버전 건너뛰기'],
            defaultId: 0,
            cancelId: 1
        });

        return result.response;
    }

    // 업데이트 파일 다운로드
    async downloadUpdate(versionInfo) {
        try {
            if (!versionInfo.downloadUrl) {
                throw new Error('다운로드 URL이 없습니다.');
            }

            console.log('업데이트 다운로드 시작...');
            
            // 임시 다운로드 폴더
            const tempDir = path.join(app.getPath('temp'), 'jindan-update');
            await fs.mkdir(tempDir, { recursive: true });
            
            const downloadPath = path.join(tempDir, `jindan-update-${versionInfo.version}.exe`);
            
            // 파일 다운로드
            await this.downloadFile(versionInfo.downloadUrl, downloadPath);
            
            console.log('업데이트 다운로드 완료:', downloadPath);
            return downloadPath;
        } catch (error) {
            console.error('업데이트 다운로드 실패:', error);
            throw error;
        }
    }

    // 파일 다운로드 헬퍼
    downloadFile(url, dest) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(dest);
            https.get(url, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', (err) => {
                fs.unlink(dest);
                reject(err);
            });
        });
    }

    // 업데이트 설치
    async installUpdate(updateFilePath) {
        try {
            console.log('업데이트 설치 시작...');
            
            // 설치 확인 다이얼로그
            const result = await dialog.showMessageBox(null, {
                type: 'warning',
                title: '업데이트 설치',
                message: '업데이트를 설치하시겠습니까?',
                detail: '애플리케이션이 종료되고 새 버전이 설치됩니다.\n설치 후 자동으로 재시작됩니다.',
                buttons: ['설치', '취소'],
                defaultId: 0,
                cancelId: 1
            });

            if (result.response === 0) {
                // 업데이트 실행
                const { spawn } = require('child_process');
                spawn(updateFilePath, [], { detached: true, stdio: 'ignore' });
                
                // 현재 앱 종료
                app.quit();
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('업데이트 설치 실패:', error);
            throw error;
        }
    }

    // 건너뛴 버전 저장
    async saveSkippedVersion(version) {
        try {
            const configPath = path.join(app.getPath('userData'), 'update-config.json');
            const config = { skippedVersion: version };
            await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        } catch (error) {
            console.error('건너뛴 버전 저장 실패:', error);
        }
    }

    // 건너뛴 버전 확인
    async getSkippedVersion() {
        try {
            const configPath = path.join(app.getPath('userData'), 'update-config.json');
            const configData = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(configData);
            return config.skippedVersion || null;
        } catch (error) {
            return null;
        }
    }

    // 전체 업데이트 프로세스 실행
    async checkAndPromptUpdate() {
        try {
            console.log('업데이트 확인 중...');
            
            const updateInfo = await this.checkForUpdates();
            
            if (!updateInfo.hasUpdate) {
                console.log('최신 버전을 사용 중입니다.');
                return false;
            }

            // 건너뛴 버전인지 확인
            const skippedVersion = await this.getSkippedVersion();
            if (skippedVersion === updateInfo.latestVersion && !updateInfo.versionInfo.mandatory) {
                console.log('사용자가 이 버전을 건너뛰었습니다.');
                return false;
            }

            // 업데이트 다이얼로그 표시
            const userChoice = await this.showUpdateDialog(updateInfo);
            
            switch (userChoice) {
                case 0: // 지금 업데이트
                    if (updateInfo.versionInfo.downloadUrl) {
                        console.log('업데이트 다운로드 및 설치 시작...');
                        
                        // 업데이트 진행 대화상자 표시
                        const progressDialog = await dialog.showMessageBox(null, {
                            type: 'info',
                            title: '업데이트 진행 중',
                            message: '새 버전을 다운로드하고 설치하는 중입니다...',
                            detail: '잠시만 기다려주세요. 완료 후 앱이 자동으로 재시작됩니다.',
                            buttons: ['확인'],
                            defaultId: 0
                        });
                        
                        try {
                            const updateFile = await this.downloadUpdate(updateInfo.versionInfo);
                            await this.installUpdate(updateFile);
                            
                            // 설치 완료 후 재시작
                            console.log('업데이트 설치 완료. 앱을 재시작합니다.');
                            await dialog.showMessageBox(null, {
                                type: 'info',
                                title: '업데이트 완료',
                                message: '업데이트가 성공적으로 완료되었습니다.',
                                detail: '앱을 재시작합니다.',
                                buttons: ['확인']
                            });
                            
                            // 앱 재시작
                            const { app } = require('electron');
                            app.relaunch();
                            app.exit(0);
                            
                        } catch (error) {
                            console.error('업데이트 설치 실패:', error);
                            await dialog.showMessageBox(null, {
                                type: 'error',
                                title: '업데이트 실패',
                                message: '업데이트 설치 중 오류가 발생했습니다.',
                                detail: error.message,
                                buttons: ['확인']
                            });
                        }
                        
                    } else {
                        // 다운로드 URL이 없는 경우 수동 업데이트 안내
                        await dialog.showMessageBox(null, {
                            type: 'info',
                            title: '수동 업데이트',
                            message: '업데이트 파일을 수동으로 다운로드해야 합니다.',
                            detail: '관리자에게 최신 버전 파일을 요청하거나, Google Drive에서 직접 다운로드하세요.',
                            buttons: ['확인']
                        });
                    }
                    return true;
                    
                case 1: // 나중에
                    console.log('사용자가 업데이트를 연기했습니다.');
                    return false;
                    
                case 2: // 건너뛰기
                    await this.saveSkippedVersion(updateInfo.latestVersion);
                    console.log('사용자가 이 버전을 건너뛰었습니다.');
                    return false;
                    
                default:
                    return false;
            }
        } catch (error) {
            console.error('업데이트 프로세스 오류:', error);
            return false;
        }
    }

    // 업데이트 메시지 생성 (공정관리 기능 출시 예고 포함)
    getUpdateMessage(versionInfo) {
        const features = versionInfo.features 
            ? versionInfo.features.map(f => `• ${f}`).join('\n')
            : '• 성능 개선 및 버그 수정';

        let specialMessage = '';
        
        // 공정관리 기능 출시 예고
        if (versionInfo.version?.startsWith('1.1')) {
            specialMessage = '\n🎉 드디어 공정관리 시스템이 출시됩니다!\n' +
                           '📊 Gantt 차트, 🔄 작업 의존성, 📈 진척률 모니터링 기능이 추가됩니다.\n\n';
        }

        return `현재 버전: v${this.currentVersion}\n최신 버전: v${versionInfo.version}\n\n` +
               specialMessage +
               `📋 새로운 기능:\n${features}\n\n` +
               `📅 릴리스 날짜: ${new Date(versionInfo.releaseDate).toLocaleDateString('ko-KR')}\n\n` +
               `${versionInfo.mandatory ? '⚠️ 필수 업데이트입니다.' : '💡 선택적 업데이트입니다.'}`;
    }
}

module.exports = UpdateManager;
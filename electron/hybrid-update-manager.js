const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { app, dialog } = require('electron');
const BackupManager = require('./backup-manager');
const PartialUpdateManager = require('./partial-update-manager');
const UpdateManager = require('./update-manager');

class HybridUpdateManager extends UpdateManager {
    constructor() {
        super();
        this.backupManager = new BackupManager();
        this.partialUpdateManager = null; // 초기화 후 설정
        this.currentVersion = require('../package.json').version;
        
        // 업데이트 전략 상수
        this.UPDATE_TYPES = {
            HOTFIX: 'hotfix',        // 버그 수정
            COMPONENT: 'component',   // 컴포넌트 추가
            FEATURE: 'feature',      // 새 기능
            MAJOR: 'major'           // 주요 변경
        };
        
        // 핵심 시스템 파일 (변경 시 전체 업데이트 필요)
        this.CORE_FILES = [
            'electron/main.js',
            'electron/preload.js',
            'electron/hybrid-auth-service.js',
            'package.json'
        ];
    }

    // 기존 initialize 메서드 확장
    async initialize(googleCredentials) {
        try {
            console.log('하이브리드 업데이트 관리자 초기화 중...');
            
            // 부모 클래스 초기화
            const result = await super.initialize(googleCredentials);
            
            if (result) {
                // 부분 업데이트 매니저 초기화
                this.partialUpdateManager = new PartialUpdateManager(this.drive);
            }
            
            console.log('하이브리드 업데이트 관리자 초기화 완료');
            return result;
        } catch (error) {
            console.error('하이브리드 업데이트 관리자 초기화 실패:', error);
            return false;
        }
    }

    // 업데이트 폴더 확인 및 생성
    async ensureUpdateFolder() {
        try {
            const response = await this.drive.files.list({
                q: "name='JindanTeam_Updates' and mimeType='application/vnd.google-apps.folder'",
                fields: 'files(id, name)'
            });

            if (response.data.files.length > 0) {
                this.updateFolderId = response.data.files[0].id;
                console.log('기존 업데이트 폴더 발견:', this.updateFolderId);
            } else {
                const folderResponse = await this.drive.files.create({
                    requestBody: {
                        name: 'JindanTeam_Updates',
                        mimeType: 'application/vnd.google-apps.folder'
                    }
                });
                this.updateFolderId = folderResponse.data.id;
                console.log('새 업데이트 폴더 생성:', this.updateFolderId);
                await this.createInitialVersionFile();
            }
        } catch (error) {
            console.error('업데이트 폴더 설정 실패:', error);
            throw error;
        }
    }

    // 스마트 업데이트 전략 판단 (개선된 버전)
    determineUpdateStrategy(versionInfo) {
        console.log('업데이트 전략 분석 중...');
        
        // 1. 명시적 전략이 있는 경우
        if (versionInfo.updateStrategy) {
            console.log('명시적 전략 사용:', versionInfo.updateStrategy);
            return versionInfo.updateStrategy;
        }
        
        // 2. 부분 업데이트 시스템이 없으면 전체 업데이트
        if (!this.partialUpdateManager) {
            console.log('부분 업데이트 시스템 없음 → 전체 업데이트');
            return 'full';
        }
        
        // 3. 부분 업데이트 실행 가능성 평가
        const feasibility = this.partialUpdateManager.evaluatePartialUpdateFeasibility(versionInfo);
        
        if (!feasibility.canPartialUpdate) {
            console.log(`부분 업데이트 불가능: ${feasibility.reason} → 전체 업데이트`);
            return 'full';
        }
        
        // 4. 리스크 레벨에 따른 권장사항
        if (feasibility.riskLevel === 'low') {
            console.log('저위험 변경 감지 → 부분 업데이트 권장');
            return 'partial';
        } else if (feasibility.riskLevel === 'medium') {
            console.log('중위험 변경 감지 → 사용자 선택 권장');
            return 'choice'; // 사용자에게 선택권 제공
        }
        
        // 5. 기본값: 전체 업데이트
        console.log('안전한 변경이지만 전체 업데이트 권장');
        return 'full';
    }

    // 사용자에게 업데이트 방식 선택 제공 (개선된 버전)
    async promptUpdateChoice(versionInfo, recommendedStrategy) {
        // 부분 업데이트 실행 가능성 평가
        const feasibility = this.partialUpdateManager ? 
            this.partialUpdateManager.evaluatePartialUpdateFeasibility(versionInfo) : 
            { canPartialUpdate: false, estimatedTime: 0, estimatedSize: 0 };
        
        const isPartialRecommended = recommendedStrategy === 'partial';
        const isChoiceRecommended = recommendedStrategy === 'choice';
        
        // 부분 업데이트 정보
        const partialInfo = feasibility.canPartialUpdate
            ? `⚡ 빠른 업데이트 (${feasibility.estimatedSize.toFixed(1)}MB, ${feasibility.estimatedTime}초)`
            : `⚡ 빠른 업데이트 (사용 불가)`;
            
        const fullInfo = `🔒 안전한 업데이트 (전체 재설치, 200MB, 5분)`;

        // 권장사항 메시지
        let recommendation = '';
        if (isPartialRecommended) {
            recommendation = '� 빠른 업데이트를 권장합니다.';
        } else if (isChoiceRecommended) {
            recommendation = '� 선호하는 방식을 선택하세요.';
        } else {
            recommendation = '💡 안전한 업데이트를 권장합니다.';
        }

        const message = `🎉 새로운 버전이 있습니다! (v${versionInfo.version})\n\n` +
                       `📋 새로운 기능:\n${versionInfo.features?.map(f => `• ${f}`).join('\n') || '• 성능 개선'}\n\n` +
                       `업데이트 방식을 선택하세요:`;

        const detail = `${partialInfo}\n${fullInfo}\n\n${recommendation}`;

        // 버튼 활성화 상태 결정
        const buttons = [];
        if (feasibility.canPartialUpdate) {
            buttons.push('⚡ 빠른 업데이트');
        }
        buttons.push('� 안전한 업데이트', '나중에', '건너뛰기');

        const defaultButton = isPartialRecommended && feasibility.canPartialUpdate ? 0 : 
                             feasibility.canPartialUpdate ? 1 : 0;

        const result = await dialog.showMessageBox(null, {
            type: 'info',
            title: '하이브리드 업데이트 시스템',
            message: message,
            detail: detail,
            buttons: buttons,
            defaultId: defaultButton,
            cancelId: buttons.length - 2 // '나중에' 버튼
        });

        // 결과 해석
        let strategy = null;
        if (result.response === 0 && feasibility.canPartialUpdate) {
            strategy = 'partial';
        } else if ((result.response === 0 && !feasibility.canPartialUpdate) || 
                   (result.response === 1 && feasibility.canPartialUpdate)) {
            strategy = 'full';
        }
        // 나중에/건너뛰기는 strategy가 null로 유지됨

        return {
            choice: result.response,
            strategy: strategy,
            isSkip: result.response === buttons.length - 1 // 마지막 버튼이 '건너뛰기'
        };
    }

    // 로컬 버전 정보 업데이트
    async updateLocalVersion(newVersion) {
        try {
            const packagePath = path.join(process.cwd(), 'package.json');
            const packageData = JSON.parse(await fs.readFile(packagePath, 'utf8'));
            
            packageData.version = newVersion;
            await fs.writeFile(packagePath, JSON.stringify(packageData, null, 2));
            
            this.currentVersion = newVersion;
            console.log(`로컬 버전 업데이트 완료: ${newVersion}`);
            
        } catch (error) {
            console.error('로컬 버전 업데이트 실패:', error);
            throw error;
        }
    }

    // 백업 상태 확인
    async getBackupStatus() {
        return await this.backupManager.getBackupStatus();
    }

    // 수동 백업 생성
    async createManualBackup() {
        return await this.backupManager.createBackup();
    }

    // 하이브리드 업데이트 시스템 상태 보고
    async getSystemStatus() {
        try {
            const backupStatus = await this.getBackupStatus();
            const hasPartialUpdate = !!this.partialUpdateManager;
            
            return {
                currentVersion: this.currentVersion,
                hasPartialUpdate,
                backupStatus,
                isInitialized: !!this.drive,
                updateFolderId: this.updateFolderId
            };
        } catch (error) {
            console.error('시스템 상태 확인 실패:', error);
            return null;
        }
    }

    // 부분 업데이트 실행 (개선된 버전)
    async executePartialUpdate(versionInfo) {
        try {
            console.log('=== 부분 업데이트 시작 ===');
            
            // 진행 상황 모니터 생성
            const progressMonitor = this.partialUpdateManager.createProgressMonitor();
            
            // 1. 시스템 백업 생성
            console.log('시스템 백업 생성 중...');
            await this.backupManager.createBackup();
            
            // 2. 변경된 파일 검증
            const validation = this.partialUpdateManager.validateChangedFiles(versionInfo.changedFiles);
            if (!validation.canPartialUpdate) {
                throw new Error(`부분 업데이트 불가능: 위험한 파일 포함 (${validation.unsafeFiles.join(', ')})`);
            }
            
            progressMonitor.setTotal(validation.safeFiles.length);
            
            // 3. 변경된 파일 다운로드
            console.log(`${validation.safeFiles.length}개 파일 다운로드 중...`);
            const downloadedFiles = await this.partialUpdateManager.downloadChangedFiles(
                validation.safeFiles, 
                this.updateFolderId
            );
            
            // 4. 파일 무결성 검증
            if (versionInfo.checksums) {
                console.log('파일 무결성 검증 중...');
                await this.partialUpdateManager.verifyFileIntegrity(downloadedFiles, versionInfo.checksums);
            }
            
            // 5. 파일 교체 (원자적 업데이트)
            console.log('파일 교체 중...');
            await this.partialUpdateManager.replaceFiles(downloadedFiles);
            
            // 6. 버전 정보 업데이트
            await this.updateLocalVersion(versionInfo.version);
            
            // 7. 임시 파일 정리
            await this.partialUpdateManager.cleanTempDir();
            
            console.log('=== 부분 업데이트 완료 ===');
            return true;
            
        } catch (error) {
            console.error('부분 업데이트 실패:', error);
            
            // 실패 시 백업 복원
            try {
                console.log('백업에서 복원 중...');
                await this.backupManager.restoreBackup();
                console.log('백업 복원 완료');
            } catch (restoreError) {
                console.error('백업 복원도 실패:', restoreError);
            }
            
            throw error;
        }
    }

    // 전체 업데이트 실행 (기존 방식)
    async executeFullUpdate(versionInfo) {
        console.log('=== 전체 업데이트 시작 ===');
        
        if (versionInfo.downloadUrl) {
            const updateFile = await this.downloadUpdate(versionInfo);
            await this.installUpdate(updateFile);
        } else {
            await dialog.showMessageBox(null, {
                type: 'info',
                title: '수동 업데이트',
                message: '전체 업데이트 파일을 수동으로 설치해야 합니다.',
                detail: '관리자에게 최신 EXE 파일을 요청하거나, Google Drive에서 직접 다운로드하세요.',
                buttons: ['확인']
            });
        }
        
        console.log('=== 전체 업데이트 완료 ===');
    }

    // 메인 하이브리드 업데이트 프로세스
    async checkAndPromptHybridUpdate() {
        try {
            console.log('하이브리드 업데이트 확인 중...');
            
            const updateInfo = await this.checkForUpdates();
            
            if (!updateInfo.hasUpdate) {
                console.log('최신 버전을 사용 중입니다.');
                return false;
            }

            // 건너뛴 버전 확인
            const skippedVersion = await this.getSkippedVersion();
            if (skippedVersion === updateInfo.latestVersion && !updateInfo.versionInfo.mandatory) {
                console.log('사용자가 이 버전을 건너뛰었습니다.');
                return false;
            }

            // 스마트 전략 판단
            const recommendedStrategy = this.determineUpdateStrategy(updateInfo.versionInfo);
            
            // 사용자 선택 받기
            const userChoice = await this.promptUpdateChoice(updateInfo.versionInfo, recommendedStrategy);
            
            if (!userChoice.strategy) {
                if (userChoice.isSkip) { // 건너뛰기
                    await this.saveSkippedVersion(updateInfo.latestVersion);
                }
                return false;
            }

            // 선택된 전략으로 업데이트 실행
            try {
                if (userChoice.strategy === 'partial') {
                    await this.executePartialUpdate(updateInfo.versionInfo);
                } else {
                    await this.executeFullUpdate(updateInfo.versionInfo);
                }
                
                // 성공 시 재시작
                await dialog.showMessageBox(null, {
                    type: 'info',
                    title: '업데이트 완료',
                    message: '업데이트가 성공적으로 완료되었습니다!',
                    detail: '앱을 재시작합니다.',
                    buttons: ['확인']
                });
                
                app.relaunch();
                app.exit(0);
                return true;
                
            } catch (updateError) {
                console.error('업데이트 실행 실패:', updateError);
                
                // 부분 업데이트 실패 시 전체 업데이트로 폴백
                if (userChoice.strategy === 'partial') {
                    const fallbackChoice = await dialog.showMessageBox(null, {
                        type: 'warning',
                        title: '부분 업데이트 실패',
                        message: '빠른 업데이트에 실패했습니다.',
                        detail: '안전한 전체 업데이트로 전환하시겠습니까?',
                        buttons: ['전체 업데이트', '나중에'],
                        defaultId: 0
                    });
                    
                    if (fallbackChoice.response === 0) {
                        await this.executeFullUpdate(updateInfo.versionInfo);
                        app.relaunch();
                        app.exit(0);
                        return true;
                    }
                }
                
                return false;
            }

        } catch (error) {
            console.error('하이브리드 업데이트 프로세스 오류:', error);
            return false;
        }
    }

    // 기존 UpdateManager의 다른 메서드들을 상속하고 필요한 추가 메서드들은 위에 구현됨
}

module.exports = HybridUpdateManager;
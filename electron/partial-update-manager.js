const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const https = require('https');

class PartialUpdateManager {
    constructor(driveInstance) {
        this.drive = driveInstance;
        this.tempUpdateDir = path.join(process.cwd(), '.temp-update');
        
        // 안전한 부분 업데이트 가능 파일 패턴
        this.SAFE_PATTERNS = [
            /^src\/components\/.*\.tsx?$/,
            /^src\/app\/.*\.tsx?$/,
            /^src\/lib\/.*\.ts$/,
            /^src\/hooks\/.*\.ts$/,
            /^src\/types\/.*\.ts$/,
            /^src\/styles\/.*\.css$/,
            /^public\/.*$/
        ];
        
        // 위험한 파일 패턴 (부분 업데이트 금지)
        this.DANGEROUS_PATTERNS = [
            /^electron\/main\.js$/,
            /^electron\/preload\.js$/,
            /^package\.json$/,
            /^next\.config\./,
            /^tsconfig\.json$/,
            /^\.env/
        ];
    }

    // 임시 업데이트 디렉토리 초기화
    async ensureTempDir() {
        try {
            await fs.access(this.tempUpdateDir);
            // 기존 임시 파일 정리
            await this.cleanTempDir();
        } catch {
            await fs.mkdir(this.tempUpdateDir, { recursive: true });
        }
    }

    // 임시 디렉토리 정리
    async cleanTempDir() {
        try {
            const files = await fs.readdir(this.tempUpdateDir);
            await Promise.all(files.map(file => 
                fs.unlink(path.join(this.tempUpdateDir, file)).catch(() => {})
            ));
        } catch (error) {
            console.warn('임시 디렉토리 정리 실패:', error);
        }
    }

    // 파일이 부분 업데이트에 안전한지 확인
    isSafeForPartialUpdate(filePath) {
        // 위험한 패턴 확인
        if (this.DANGEROUS_PATTERNS.some(pattern => pattern.test(filePath))) {
            console.log(`위험한 파일: ${filePath}`);
            return false;
        }
        
        // 안전한 패턴 확인
        if (this.SAFE_PATTERNS.some(pattern => pattern.test(filePath))) {
            console.log(`안전한 파일: ${filePath}`);
            return true;
        }
        
        console.log(`불명확한 파일: ${filePath} - 안전하지 않음으로 처리`);
        return false;
    }

    // 변경된 파일 목록 검증
    validateChangedFiles(changedFiles) {
        const safeFiles = [];
        const unsafeFiles = [];
        
        for (const file of changedFiles) {
            if (this.isSafeForPartialUpdate(file)) {
                safeFiles.push(file);
            } else {
                unsafeFiles.push(file);
            }
        }
        
        return {
            safeFiles,
            unsafeFiles,
            canPartialUpdate: unsafeFiles.length === 0
        };
    }

    // Google Drive에서 파일 다운로드
    async downloadFileFromDrive(fileId, fileName) {
        try {
            console.log(`파일 다운로드 중: ${fileName}`);
            
            const response = await this.drive.files.get({
                fileId: fileId,
                alt: 'media'
            }, { responseType: 'stream' });

            const filePath = path.join(this.tempUpdateDir, fileName);
            const writer = require('fs').createWriteStream(filePath);

            return new Promise((resolve, reject) => {
                response.data.pipe(writer);
                
                writer.on('finish', () => {
                    console.log(`다운로드 완료: ${fileName}`);
                    resolve(filePath);
                });
                
                writer.on('error', reject);
            });
            
        } catch (error) {
            console.error(`파일 다운로드 실패: ${fileName}`, error);
            throw error;
        }
    }

    // 여러 파일 병렬 다운로드
    async downloadChangedFiles(fileList, folderId) {
        try {
            await this.ensureTempDir();
            
            console.log(`${fileList.length}개 파일 다운로드 시작...`);
            
            // Google Drive에서 파일 목록 조회
            const driveFiles = await this.getDriveFileList(folderId);
            
            // 다운로드할 파일 매핑
            const downloadTasks = fileList.map(async (fileName) => {
                const driveFile = driveFiles.find(f => f.name === fileName);
                
                if (!driveFile) {
                    console.warn(`Drive에서 파일을 찾을 수 없음: ${fileName}`);
                    return null;
                }
                
                const localPath = await this.downloadFileFromDrive(driveFile.id, fileName);
                return {
                    fileName,
                    localPath,
                    driveId: driveFile.id
                };
            });
            
            // 병렬 다운로드 실행
            const results = await Promise.allSettled(downloadTasks);
            
            // 성공한 다운로드만 반환
            const downloadedFiles = results
                .filter(result => result.status === 'fulfilled' && result.value)
                .map(result => result.value);
                
            console.log(`${downloadedFiles.length}개 파일 다운로드 완료`);
            return downloadedFiles;
            
        } catch (error) {
            console.error('파일 다운로드 프로세스 실패:', error);
            throw error;
        }
    }

    // Google Drive 파일 목록 조회
    async getDriveFileList(folderId) {
        try {
            const response = await this.drive.files.list({
                q: `'${folderId}' in parents`,
                fields: 'files(id, name, size, modifiedTime)'
            });
            
            return response.data.files || [];
        } catch (error) {
            console.error('Drive 파일 목록 조회 실패:', error);
            throw error;
        }
    }

    // 파일 체크섬 계산
    async calculateChecksum(filePath) {
        try {
            const fileBuffer = await fs.readFile(filePath);
            const hash = crypto.createHash('sha256');
            hash.update(fileBuffer);
            return hash.digest('hex');
        } catch (error) {
            console.error(`체크섬 계산 실패: ${filePath}`, error);
            throw error;
        }
    }

    // 파일 무결성 검증
    async verifyFileIntegrity(downloadedFiles, expectedChecksums) {
        try {
            console.log('파일 무결성 검증 중...');
            
            for (const file of downloadedFiles) {
                const actualChecksum = await this.calculateChecksum(file.localPath);
                const expectedChecksum = expectedChecksums[file.fileName];
                
                if (expectedChecksum && actualChecksum !== expectedChecksum) {
                    throw new Error(`무결성 검증 실패: ${file.fileName}`);
                }
                
                console.log(`✓ ${file.fileName} 검증 완료`);
            }
            
            console.log('모든 파일 무결성 검증 완료');
            return true;
            
        } catch (error) {
            console.error('파일 무결성 검증 실패:', error);
            throw error;
        }
    }

    // 파일 교체 (원자적 업데이트)
    async replaceFiles(downloadedFiles) {
        try {
            console.log('파일 교체 시작...');
            
            const replaceOperations = [];
            
            for (const file of downloadedFiles) {
                const targetPath = path.join(process.cwd(), file.fileName);
                const backupPath = `${targetPath}.backup`;
                
                replaceOperations.push({
                    fileName: file.fileName,
                    tempPath: file.localPath,
                    targetPath,
                    backupPath
                });
            }
            
            // 1단계: 기존 파일 백업
            for (const op of replaceOperations) {
                try {
                    await fs.access(op.targetPath);
                    await fs.copyFile(op.targetPath, op.backupPath);
                    console.log(`백업 생성: ${op.fileName}`);
                } catch {
                    // 원본 파일이 없으면 새 파일임
                    console.log(`새 파일: ${op.fileName}`);
                }
            }
            
            // 2단계: 새 파일로 교체
            for (const op of replaceOperations) {
                // 대상 디렉토리 생성
                const targetDir = path.dirname(op.targetPath);
                await fs.mkdir(targetDir, { recursive: true });
                
                // 파일 교체
                await fs.copyFile(op.tempPath, op.targetPath);
                console.log(`교체 완료: ${op.fileName}`);
            }
            
            // 3단계: 백업 파일 정리
            for (const op of replaceOperations) {
                try {
                    await fs.unlink(op.backupPath);
                } catch {
                    // 백업 파일이 없으면 무시
                }
            }
            
            console.log('모든 파일 교체 완료');
            return true;
            
        } catch (error) {
            console.error('파일 교체 실패:', error);
            
            // 실패 시 백업에서 복원
            await this.restoreFromBackup(replaceOperations);
            throw error;
        }
    }

    // 백업에서 복원
    async restoreFromBackup(operations) {
        try {
            console.log('백업에서 복원 중...');
            
            for (const op of operations) {
                try {
                    await fs.access(op.backupPath);
                    await fs.copyFile(op.backupPath, op.targetPath);
                    await fs.unlink(op.backupPath);
                    console.log(`복원 완료: ${op.fileName}`);
                } catch (error) {
                    console.warn(`복원 실패: ${op.fileName}`, error.message);
                }
            }
            
        } catch (error) {
            console.error('백업 복원 중 오류:', error);
        }
    }

    // 부분 업데이트 실행 가능성 평가
    evaluatePartialUpdateFeasibility(versionInfo) {
        const analysis = {
            canPartialUpdate: false,
            reason: '',
            riskLevel: 'unknown',
            estimatedTime: 0,
            estimatedSize: 0
        };
        
        // 변경 파일이 없으면 업데이트 불필요
        if (!versionInfo.changedFiles || versionInfo.changedFiles.length === 0) {
            analysis.reason = '변경된 파일이 없습니다';
            return analysis;
        }
        
        // 파일 안전성 검증
        const validation = this.validateChangedFiles(versionInfo.changedFiles);
        
        if (!validation.canPartialUpdate) {
            analysis.reason = `위험한 파일 포함 (${validation.unsafeFiles.length}개)`;
            analysis.riskLevel = 'high';
            return analysis;
        }
        
        // 파일 개수에 따른 리스크 평가
        const fileCount = validation.safeFiles.length;
        if (fileCount > 20) {
            analysis.reason = `변경 파일이 너무 많음 (${fileCount}개)`;
            analysis.riskLevel = 'medium';
            return analysis;
        }
        
        // 부분 업데이트 가능
        analysis.canPartialUpdate = true;
        analysis.riskLevel = fileCount > 10 ? 'medium' : 'low';
        analysis.estimatedTime = Math.max(fileCount * 2, 10); // 초
        analysis.estimatedSize = fileCount * 0.5; // MB 추정
        analysis.reason = `안전한 파일만 변경됨 (${fileCount}개)`;
        
        return analysis;
    }

    // 부분 업데이트 진행 상황 모니터링
    createProgressMonitor() {
        return {
            total: 0,
            completed: 0,
            current: '',
            
            setTotal(count) {
                this.total = count;
            },
            
            update(fileName) {
                this.completed++;
                this.current = fileName;
                const progress = Math.round((this.completed / this.total) * 100);
                console.log(`진행률: ${progress}% (${this.completed}/${this.total}) - ${fileName}`);
            },
            
            getProgress() {
                return {
                    percentage: Math.round((this.completed / this.total) * 100),
                    completed: this.completed,
                    total: this.total,
                    current: this.current
                };
            }
        };
    }
}

module.exports = PartialUpdateManager;
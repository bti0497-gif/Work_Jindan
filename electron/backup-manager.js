const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const extract = require('extract-zip');
const crypto = require('crypto');

class BackupManager {
    constructor() {
        this.backupDir = path.join(process.cwd(), '.backup');
        this.maxBackups = 3; // 최대 백업 개수
    }

    // 백업 폴더 초기화
    async ensureBackupDir() {
        try {
            await fs.access(this.backupDir);
        } catch {
            await fs.mkdir(this.backupDir, { recursive: true });
        }
    }

    // 현재 상태 백업 생성
    async createBackup() {
        try {
            console.log('시스템 백업 생성 중...');
            
            await this.ensureBackupDir();
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `backup_${timestamp}.zip`;
            const backupPath = path.join(this.backupDir, backupName);
            
            // 백업할 디렉토리 목록
            const dirsToBackup = [
                'electron',
                'src/components',
                'src/app',
                'package.json'
            ];
            
            await this.createZipBackup(dirsToBackup, backupPath);
            
            // 백업 메타데이터 저장
            await this.saveBackupMetadata(backupName, {
                timestamp: new Date().toISOString(),
                version: require('../package.json').version,
                size: (await fs.stat(backupPath)).size
            });
            
            // 오래된 백업 정리
            await this.cleanOldBackups();
            
            console.log(`백업 생성 완료: ${backupName}`);
            return backupPath;
            
        } catch (error) {
            console.error('백업 생성 실패:', error);
            throw error;
        }
    }

    // ZIP 백업 생성
    async createZipBackup(paths, outputPath) {
        return new Promise((resolve, reject) => {
            const output = require('fs').createWriteStream(outputPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            
            output.on('close', () => {
                console.log(`백업 크기: ${(archive.pointer() / 1024 / 1024).toFixed(2)}MB`);
                resolve();
            });
            
            archive.on('error', (err) => reject(err));
            archive.pipe(output);
            
            // 각 경로를 백업에 추가
            for (const relPath of paths) {
                const fullPath = path.join(process.cwd(), relPath);
                
                try {
                    if (require('fs').lstatSync(fullPath).isDirectory()) {
                        archive.directory(fullPath, relPath);
                    } else {
                        archive.file(fullPath, { name: relPath });
                    }
                } catch (err) {
                    console.warn(`백업 건너뛰기: ${relPath} (${err.message})`);
                }
            }
            
            archive.finalize();
        });
    }

    // 백업 복원
    async restoreBackup(backupName = null) {
        try {
            console.log('백업 복원 시작...');
            
            // 가장 최근 백업 찾기
            if (!backupName) {
                const backups = await this.listBackups();
                if (backups.length === 0) {
                    throw new Error('복원할 백업이 없습니다.');
                }
                backupName = backups[0].name; // 가장 최근 백업
            }
            
            const backupPath = path.join(this.backupDir, backupName);
            const tempRestoreDir = path.join(this.backupDir, 'temp_restore');
            
            // 백업 존재 확인
            await fs.access(backupPath);
            
            // 임시 복원 디렉토리 생성
            await fs.mkdir(tempRestoreDir, { recursive: true });
            
            // 백업 압축 해제
            await extract(backupPath, { dir: tempRestoreDir });
            
            // 파일 복원 (덮어쓰기)
            await this.copyFiles(tempRestoreDir, process.cwd());
            
            // 임시 디렉토리 정리
            await this.removeDirectory(tempRestoreDir);
            
            console.log(`백업 복원 완료: ${backupName}`);
            return true;
            
        } catch (error) {
            console.error('백업 복원 실패:', error);
            throw error;
        }
    }

    // 파일 복사 (재귀적)
    async copyFiles(sourceDir, targetDir) {
        const entries = await fs.readdir(sourceDir, { withFileTypes: true });
        
        for (const entry of entries) {
            const sourcePath = path.join(sourceDir, entry.name);
            const targetPath = path.join(targetDir, entry.name);
            
            if (entry.isDirectory()) {
                await fs.mkdir(targetPath, { recursive: true });
                await this.copyFiles(sourcePath, targetPath);
            } else {
                await fs.copyFile(sourcePath, targetPath);
            }
        }
    }

    // 디렉토리 제거 (재귀적)
    async removeDirectory(dirPath) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    await this.removeDirectory(fullPath);
                } else {
                    await fs.unlink(fullPath);
                }
            }
            
            await fs.rmdir(dirPath);
        } catch (error) {
            console.warn(`디렉토리 제거 실패: ${dirPath}`, error.message);
        }
    }

    // 백업 메타데이터 저장
    async saveBackupMetadata(backupName, metadata) {
        const metadataPath = path.join(this.backupDir, 'metadata.json');
        
        let allMetadata = {};
        try {
            const existing = await fs.readFile(metadataPath, 'utf8');
            allMetadata = JSON.parse(existing);
        } catch {
            // 파일이 없으면 새로 생성
        }
        
        allMetadata[backupName] = metadata;
        await fs.writeFile(metadataPath, JSON.stringify(allMetadata, null, 2));
    }

    // 백업 목록 조회
    async listBackups() {
        try {
            await this.ensureBackupDir();
            
            const files = await fs.readdir(this.backupDir);
            const backups = files.filter(f => f.endsWith('.zip'));
            
            // 메타데이터 로드
            let metadata = {};
            try {
                const metadataPath = path.join(this.backupDir, 'metadata.json');
                const metadataContent = await fs.readFile(metadataPath, 'utf8');
                metadata = JSON.parse(metadataContent);
            } catch {
                // 메타데이터가 없으면 빈 객체
            }
            
            // 백업 정보 조합
            const backupInfo = await Promise.all(backups.map(async (name) => {
                const filePath = path.join(this.backupDir, name);
                const stats = await fs.stat(filePath);
                
                return {
                    name,
                    path: filePath,
                    size: stats.size,
                    created: stats.birthtime,
                    metadata: metadata[name] || {}
                };
            }));
            
            // 생성 시간 기준 정렬 (최신순)
            return backupInfo.sort((a, b) => b.created - a.created);
            
        } catch (error) {
            console.error('백업 목록 조회 실패:', error);
            return [];
        }
    }

    // 오래된 백업 정리
    async cleanOldBackups() {
        try {
            const backups = await this.listBackups();
            
            if (backups.length <= this.maxBackups) {
                return; // 정리할 필요 없음
            }
            
            // 오래된 백업 삭제
            const toDelete = backups.slice(this.maxBackups);
            for (const backup of toDelete) {
                await fs.unlink(backup.path);
                console.log(`오래된 백업 삭제: ${backup.name}`);
            }
            
            // 메타데이터도 정리
            await this.cleanBackupMetadata(backups.slice(0, this.maxBackups));
            
        } catch (error) {
            console.error('백업 정리 실패:', error);
        }
    }

    // 백업 메타데이터 정리
    async cleanBackupMetadata(remainingBackups) {
        try {
            const metadataPath = path.join(this.backupDir, 'metadata.json');
            const cleanMetadata = {};
            
            for (const backup of remainingBackups) {
                const metadataContent = await fs.readFile(metadataPath, 'utf8');
                const allMetadata = JSON.parse(metadataContent);
                
                if (allMetadata[backup.name]) {
                    cleanMetadata[backup.name] = allMetadata[backup.name];
                }
            }
            
            await fs.writeFile(metadataPath, JSON.stringify(cleanMetadata, null, 2));
            
        } catch (error) {
            console.warn('메타데이터 정리 실패:', error);
        }
    }

    // 백업 무결성 검증
    async verifyBackupIntegrity(backupName) {
        try {
            const backupPath = path.join(this.backupDir, backupName);
            const stats = await fs.stat(backupPath);
            
            // 파일 크기 확인
            if (stats.size < 1024) { // 1KB 미만이면 손상된 것으로 간주
                return false;
            }
            
            // ZIP 파일 유효성 검사 (기본적인 헤더 확인)
            const buffer = await fs.readFile(backupPath);
            const isValidZip = buffer[0] === 0x50 && buffer[1] === 0x4B;
            
            return isValidZip;
            
        } catch (error) {
            console.error('백업 무결성 검증 실패:', error);
            return false;
        }
    }

    // 백업 상태 리포트
    async getBackupStatus() {
        try {
            const backups = await this.listBackups();
            const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
            
            return {
                count: backups.length,
                totalSize: Math.round(totalSize / 1024 / 1024 * 100) / 100, // MB
                latest: backups[0] || null,
                oldest: backups[backups.length - 1] || null
            };
        } catch (error) {
            console.error('백업 상태 확인 실패:', error);
            return { count: 0, totalSize: 0, latest: null, oldest: null };
        }
    }
}

module.exports = BackupManager;
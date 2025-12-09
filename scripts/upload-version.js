const UpdateManager = require('../electron/update-manager');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

// 콘솔 입력 인터페이스
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// 프롬프트 함수
function question(text) {
    return new Promise((resolve) => {
        rl.question(text, resolve);
    });
}

// 관리자용 버전 업로드 스크립트
async function uploadNewVersion() {
    console.log('='.repeat(50));
    console.log('더죤환경기술(주) 기술진단팀 - 버전 업로드 도구');
    console.log('='.repeat(50));

    try {
        // 현재 package.json에서 버전 읽기
        const packagePath = path.join(__dirname, '../package.json');
        const packageData = JSON.parse(await fs.readFile(packagePath, 'utf8'));
        const currentVersion = packageData.version;

        console.log(`현재 버전: ${currentVersion}`);
        console.log();

        // 새 버전 정보 입력
        const newVersion = await question('새 버전 번호 (예: 1.0.1): ');
        if (!newVersion.match(/^\d+\.\d+\.\d+$/)) {
            throw new Error('올바른 버전 형식이 아닙니다. (예: 1.0.1)');
        }

        const description = await question('버전 설명: ');
        const featuresInput = await question('새 기능들 (콤마로 구분): ');
        const features = featuresInput.split(',').map(f => f.trim()).filter(f => f.length > 0);
        
        const downloadUrl = await question('다운로드 URL (선택사항): ') || null;
        const mandatoryInput = await question('필수 업데이트인가요? (y/N): ');
        const mandatory = mandatoryInput.toLowerCase() === 'y';

        console.log();
        console.log('입력된 정보:');
        console.log(`- 버전: ${newVersion}`);
        console.log(`- 설명: ${description}`);
        console.log(`- 기능: ${features.join(', ')}`);
        console.log(`- 다운로드 URL: ${downloadUrl || '없음'}`);
        console.log(`- 필수 업데이트: ${mandatory ? '예' : '아니오'}`);
        console.log();

        const confirm = await question('위 정보로 업로드하시겠습니까? (y/N): ');
        if (confirm.toLowerCase() !== 'y') {
            console.log('업로드가 취소되었습니다.');
            return;
        }

        // Google Drive 인증 정보 로드
        console.log('Google Drive 인증 정보 로드 중...');
        const credentialsPath = path.join(process.env.USERPROFILE, 'AppData', 'Roaming', 'team-collaboration', 'google-credentials.json');
        
        let credentials;
        try {
            credentials = JSON.parse(await fs.readFile(credentialsPath, 'utf8'));
        } catch (error) {
            console.error('Google Drive 인증 정보를 찾을 수 없습니다.');
            console.log('먼저 앱을 실행하여 Google Drive 연동을 완료해주세요.');
            return;
        }

        // 업데이트 관리자 초기화
        console.log('업데이트 관리자 초기화 중...');
        const updateManager = new UpdateManager();
        const initialized = await updateManager.initialize(credentials);
        
        if (!initialized) {
            throw new Error('업데이트 관리자 초기화 실패');
        }

        // 새 버전 정보 생성
        const versionInfo = {
            version: newVersion,
            releaseDate: new Date().toISOString(),
            description: description,
            features: features,
            downloadUrl: downloadUrl,
            mandatory: mandatory,
            previousVersion: currentVersion,
            uploadedBy: 'admin',
            uploadDate: new Date().toISOString()
        };

        // Google Drive에 업로드
        console.log('Google Drive에 버전 정보 업로드 중...');
        await updateManager.saveVersionInfo(versionInfo);

        // 로컬 package.json 업데이트 (선택사항)
        const updateLocal = await question('로컬 package.json도 업데이트하시겠습니까? (y/N): ');
        if (updateLocal.toLowerCase() === 'y') {
            packageData.version = newVersion;
            await fs.writeFile(packagePath, JSON.stringify(packageData, null, 2));
            console.log('로컬 package.json 업데이트 완료');
        }

        console.log();
        console.log('✅ 버전 업로드 완료!');
        console.log(`팀원들이 앱을 실행할 때 버전 ${newVersion} 업데이트 알림이 표시됩니다.`);
        
        if (mandatory) {
            console.log('⚠️  필수 업데이트로 설정되었습니다.');
        }

    } catch (error) {
        console.error('❌ 오류 발생:', error.message);
    } finally {
        rl.close();
    }
}

// 스크립트 실행
if (require.main === module) {
    uploadNewVersion();
}

module.exports = { uploadNewVersion };
# 진단 협업 스튜디오 빌드 및 배포 가이드

## 1. 사전 준비 (필수)
패키징을 위해 필요한 라이브러리가 모두 설치되어야 합니다.
터미널에서 아래 명령어가 성공적으로 완료되었는지 확인하세요.

```powershell
npm install
```

## 2. 개발 모드 실행
앱을 패키징하기 전에 로컬에서 작동을 확인합니다.

```powershell
npm run electron:dev
```
- Vite 서버와 Electron 창이 동시에 실행됩니다.
- 기능이 정상 작동하는지 테스트하세요.

## 3. 프로덕션 빌드 (패키징)
Windows용 설치 파일(.exe)을 생성합니다.

```powershell
npm run electron:build
```
- **생성 위치**: `release/` 폴더
- **결과물**: `jindan-studio-setup-<package.json의 version>.exe`
- `latest.yml`과 `.exe.blockmap`은 빌드 도구가 생성한 원본을 설치 파일과 함께 배포합니다. 파일명을 수동으로 바꾸면 자동 업데이트 주소가 맞지 않을 수 있습니다.

## 4. 자동 업데이트 배포 (GitHub Releases)
새 버전을 배포하여 사용자들의 앱을 자동 업데이트하려면 GitHub 토큰 설정이 필요합니다.

1. **GitHub 토큰 발급**:
   - GitHub Settings -> Developer settings -> Personal access tokens
   - `repo` 권한 체크 후 토큰 생성

2. **환경 변수 설정**:
   - 프로젝트 루트에 `.env` 파일 (없으면 생성)
   - `GH_TOKEN=your_token_here` 추가

3. **배포 명령어 실행**:
```powershell
npm run publish
```
- 자동으로 빌드 후 GitHub Releases에 새 버전을 업로드합니다.
- 사용자들은 앱 재시작 시 자동으로 업데이트됩니다.
- 게시 명령은 빌드 결과에 알려진 비밀값이 포함됐는지 검사합니다. `Release blocked`가 표시되면 업로드하지 말고, Google 갱신 토큰과 클라이언트 비밀값 등을 서버 보관 또는 사용자별 로그인 방식으로 전환해야 합니다. 검사 출력에는 비밀값이 표시되지 않습니다.

팀에서 공용 Drive OAuth 연결을 유지한 설치 파일을 배포하기로 명시적으로 결정한 경우에는 다음 검사로 해당 두 종류만 예외 처리할 수 있습니다. 공개 GitHub Release에 올린 설치 파일은 누구나 내려받아 이 값을 추출할 수 있습니다. 기본 게시 명령은 계속 엄격하게 차단하며, 다른 서비스의 비밀키는 이 옵션으로 허용하지 않습니다.

```powershell
node scripts/check-release-secrets.mjs --allow-shared-drive-oauth
```

GitHub CLI로 수동 릴리즈할 때도 설치 파일, 해당 `.exe.blockmap`, 같은 빌드의 `latest.yml` 세 파일을 모두 업로드하고 공개 후 다운로드 주소와 SHA-512를 확인합니다.

## 5. 버전 올리기
버전의 기준은 `package.json` 하나입니다. 상태 표시줄과 대시보드도 이 값을 읽습니다.
이미 배포한 버전보다 높은 버전으로 올릴 때는 다음 명령으로 `package-lock.json`까지 함께 갱신합니다.

```powershell
npm version patch --no-git-tag-version
```

현재 버전이 아직 배포되지 않았다면 불필요하게 다시 올리지 않습니다. 로컬 점검용 빌드는 `npx electron-builder --win --x64 --publish never`로 업로드 없이 만들 수 있습니다.

## 6. 문제 해결
- **아이콘 오류**: `build/icon.ico` 파일이 올바른지 확인하세요.
- **서명 오류**: 코드 서명이 없으므로 Windows SmartScreen 경고가 뜰 수 있습니다. (무시하고 실행 가능)

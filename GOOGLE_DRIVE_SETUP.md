# Google Drive 데이터베이스 설정 가이드# 구글 드라이브 연동 설정 가이드



더죤환경기술(주) 기술진단팀 협업 시스템은 Google Drive를 데이터베이스로 사용합니다.## 📋 개요

더죤환경기술(주) 기술진단팀 협업 플랫폼에서 구글 드라이브와 캘린더를 연동하기 위한 설정 가이드입니다.

## 1. Google Cloud Platform 프로젝트 생성

## 🔧 1. Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속

2. 새 프로젝트 생성 또는 기존 프로젝트 선택### 1-1. 프로젝트 생성

3. "더죤환경기술-기술진단팀-DB" 같은 이름으로 설정1. [Google Cloud Console](https://console.cloud.google.com/) 접속

2. 새 프로젝트 생성 또는 기존 프로젝트 선택

## 2. Google Drive API 활성화3. 프로젝트 이름: `더죤환경기술-기술진단팀` (또는 원하는 이름)



1. Google Cloud Console에서 "API 및 서비스" > "라이브러리" 이동### 1-2. API 활성화

2. "Google Drive API" 검색 후 활성화1. **API 및 서비스** > **라이브러리** 이동

3. "Google Sheets API"도 함께 활성화 (선택사항)2. 다음 API들을 검색하여 활성화:

   - **Google Drive API**

## 3. OAuth 2.0 클라이언트 설정   - **Google Calendar API**



1. "API 및 서비스" > "사용자 인증 정보" 이동### 1-3. OAuth 2.0 클라이언트 ID 생성

2. "사용자 인증 정보 만들기" > "OAuth 클라이언트 ID" 선택1. **API 및 서비스** > **사용자 인증 정보** 이동

3. 애플리케이션 유형: "데스크톱 애플리케이션"2. **+ 사용자 인증 정보 만들기** > **OAuth 클라이언트 ID** 선택

4. 이름: "더죤환경기술 기술진단팀 앱"3. 애플리케이션 유형: **웹 애플리케이션**

5. 생성 후 JSON 파일 다운로드4. 이름: `더죤환경기술 기술진단팀 웹앱`

5. **승인된 JavaScript 원본**: 

## 4. 인증 정보 설정   - `http://localhost:3000` (개발용)

   - `https://your-domain.com` (프로덕션용)

다운로드한 JSON 파일을 다음 위치에 저장:6. **승인된 리디렉션 URI**:

```   - `http://localhost:3000/api/auth/callback/google` (개발용)

%USERPROFILE%\AppData\Roaming\team-collaboration\google-credentials.json   - `https://your-domain.com/api/auth/callback/google` (프로덕션용)

```

### 1-4. 사용자 인증 정보 다운로드

또는 첫 실행시 나타나는 파일 선택 대화상자를 통해 설정 가능합니다.1. 생성된 클라이언트 ID에서 **JSON 다운로드** 클릭

2. 클라이언트 ID와 클라이언트 보안 비밀번호 복사

## 5. Google Drive 폴더 구조

## 🔐 2. 환경 변수 설정

앱 실행시 자동으로 다음 구조가 생성됩니다:

### 2-1. .env.local 파일 생성/수정

``````bash

📁 JindanTeam_Database/# Google API 설정

├── 📄 users.json          # 사용자 정보GOOGLE_CLIENT_ID=your_actual_google_client_id

├── 📄 projects.json       # 프로젝트 정보GOOGLE_CLIENT_SECRET=your_actual_google_client_secret

├── 📄 tasks.json         # 작업 정보GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback/google

├── 📄 posts.json         # 게시글 정보

├── 📄 comments.json      # 댓글 정보# NextAuth 설정

├── 📄 files.json         # 파일 정보NEXTAUTH_URL=http://localhost:3000

├── 📄 schedules.json     # 일정 정보NEXTAUTH_SECRET=your_nextauth_secret_key

├── 📄 milestones.json    # 마일스톤 정보

└── 📄 user_logs.json     # 사용자 로그# 데이터베이스

```DATABASE_URL=file:./dev.db

```

## 6. 보안 고려사항

### 2-2. 프로덕션 환경 변수

- OAuth 인증 정보는 로컬에만 저장됩니다프로덕션 배포 시 다음 환경 변수들을 설정하세요:

- Google Drive의 폴더 및 파일 권한을 적절히 설정하세요```bash

- 팀원들에게는 해당 폴더에 대한 편집 권한을 부여하세요GOOGLE_CLIENT_ID=your_production_google_client_id

GOOGLE_CLIENT_SECRET=your_production_google_client_secret

## 7. 문제 해결GOOGLE_REDIRECT_URI=https://your-domain.com/api/auth/callback/google

NEXTAUTH_URL=https://your-domain.com

### 인증 오류NEXTAUTH_SECRET=your_strong_production_secret

- 브라우저에서 Google 계정 로그인 확인```

- OAuth 클라이언트 ID 설정 재확인

## 🧪 3. 연동 테스트

### 파일 접근 오류

- Google Drive 저장공간 확인 (2TB 충분한지)### 3-1. 로컬 테스트

- 네트워크 연결 상태 확인1. 개발 서버 시작: `npm run dev`

- Google Drive API 할당량 확인2. 브라우저에서 `http://localhost:3000` 접속

3. Google 로그인 시도

### 권한 오류4. 파일 관리 탭에서 구글 드라이브 기능 테스트

- Google Drive 폴더 공유 설정 확인

- OAuth 스코프 권한 확인### 3-2. 연결 상태 확인

애플리케이션에서 구글 API 연결 상태를 확인할 수 있습니다:

## 8. 백업 및 복구- 파일 관리 페이지에서 구글 드라이브 연동 상태 표시

- 오류 발생 시 콘솔에서 상세 에러 메시지 확인

앱은 자동으로 일일 백업을 생성합니다:

- 백업 파일: `backup_YYYY-MM-DD.json`## 🔒 4. 보안 고려사항

- 복구시 해당 파일을 각 JSON 파일로 복원

### 4-1. OAuth 동의 화면 구성

## 지원1. **OAuth 동의 화면** 설정에서 앱 정보 입력

2. **스코프** 설정:

문제가 지속되면 시스템 관리자에게 문의하세요.   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/calendar`

### 4-2. 테스트 사용자 추가
개발 중에는 테스트 사용자를 추가하여 제한된 사용자만 접근 가능하도록 설정

## 🚨 5. 문제 해결

### 5-1. 일반적인 오류들
- **"No access token available"**: 구글 로그인이 필요합니다
- **"Google API credentials not configured"**: 환경 변수를 확인하세요
- **"Failed to access Google Drive"**: API 활성화 및 권한을 확인하세요

### 5-2. 디버깅
1. 브라우저 개발자 도구의 네트워크 탭 확인
2. 서버 콘솔의 에러 로그 확인
3. Google Cloud Console에서 API 사용량 및 오류 확인

## 📚 6. 추가 자료
- [Google Drive API 문서](https://developers.google.com/drive/api)
- [Google Calendar API 문서](https://developers.google.com/calendar/api)
- [NextAuth.js Google Provider 문서](https://next-auth.js.org/providers/google)

---
**더죤환경기술(주) 기술진단팀 | 내부 기술 문서**
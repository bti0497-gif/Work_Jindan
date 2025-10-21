# 구글 드라이브 연동 설정 가이드

## 📋 개요
더죤환경기술(주) 기술진단팀 협업 플랫폼에서 구글 드라이브와 캘린더를 연동하기 위한 설정 가이드입니다.

## 🔧 1. Google Cloud Console 설정

### 1-1. 프로젝트 생성
1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. 프로젝트 이름: `더죤환경기술-기술진단팀` (또는 원하는 이름)

### 1-2. API 활성화
1. **API 및 서비스** > **라이브러리** 이동
2. 다음 API들을 검색하여 활성화:
   - **Google Drive API**
   - **Google Calendar API**

### 1-3. OAuth 2.0 클라이언트 ID 생성
1. **API 및 서비스** > **사용자 인증 정보** 이동
2. **+ 사용자 인증 정보 만들기** > **OAuth 클라이언트 ID** 선택
3. 애플리케이션 유형: **웹 애플리케이션**
4. 이름: `더죤환경기술 기술진단팀 웹앱`
5. **승인된 JavaScript 원본**: 
   - `http://localhost:3000` (개발용)
   - `https://your-domain.com` (프로덕션용)
6. **승인된 리디렉션 URI**:
   - `http://localhost:3000/api/auth/callback/google` (개발용)
   - `https://your-domain.com/api/auth/callback/google` (프로덕션용)

### 1-4. 사용자 인증 정보 다운로드
1. 생성된 클라이언트 ID에서 **JSON 다운로드** 클릭
2. 클라이언트 ID와 클라이언트 보안 비밀번호 복사

## 🔐 2. 환경 변수 설정

### 2-1. .env.local 파일 생성/수정
```bash
# Google API 설정
GOOGLE_CLIENT_ID=your_actual_google_client_id
GOOGLE_CLIENT_SECRET=your_actual_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback/google

# NextAuth 설정
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_key

# 데이터베이스
DATABASE_URL=file:./dev.db
```

### 2-2. 프로덕션 환경 변수
프로덕션 배포 시 다음 환경 변수들을 설정하세요:
```bash
GOOGLE_CLIENT_ID=your_production_google_client_id
GOOGLE_CLIENT_SECRET=your_production_google_client_secret
GOOGLE_REDIRECT_URI=https://your-domain.com/api/auth/callback/google
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your_strong_production_secret
```

## 🧪 3. 연동 테스트

### 3-1. 로컬 테스트
1. 개발 서버 시작: `npm run dev`
2. 브라우저에서 `http://localhost:3000` 접속
3. Google 로그인 시도
4. 파일 관리 탭에서 구글 드라이브 기능 테스트

### 3-2. 연결 상태 확인
애플리케이션에서 구글 API 연결 상태를 확인할 수 있습니다:
- 파일 관리 페이지에서 구글 드라이브 연동 상태 표시
- 오류 발생 시 콘솔에서 상세 에러 메시지 확인

## 🔒 4. 보안 고려사항

### 4-1. OAuth 동의 화면 구성
1. **OAuth 동의 화면** 설정에서 앱 정보 입력
2. **스코프** 설정:
   - `openid`
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
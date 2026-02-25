
# 더죤환경 기술진단팀 협업스튜디오 개발 가이드 (v2.7)

본 문서는 **더죤환경기술(주)**의 협업 시스템을 Visual Studio WinForms(WebView2) 환경으로 이식하고 배포 패키지(.msi, .exe)를 제작하기 위한 기술 표준을 정의합니다.

## 1. 권장 기술 스택 (Deployment Stack)
Next.js의 복잡한 서버 설정을 피하고, WebView2에서 가장 빠르고 가볍게 동작하는 **SPA(Single Page Application)** 구성을 권장합니다.

- **Framework**: React 19 (Client-side Only)
- **Build Tool**: **Vite 6.x** (WebView2 최적화)
- **Language**: TypeScript 5.x
- **Styling**: Tailwind CSS 3.x
- **Runtime Container**: Microsoft.Web.WebView2 (NuGet Package 1.0.2903.40+)

## 2. 의존성 관리 (package.json 표준)
버전 충돌 방지를 위해 아래 설정을 `package.json`에 적용하십시오.

```json
{
  "name": "thezone-tech-studio",
  "private": true,
  "version": "2.7.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^3.4.15",
    "typescript": "^5.6.3",
    "vite": "^6.0.1"
  }
}
```

## 3. WinForms WebView2 연동 가이드
Visual Studio에서 WinForms 프로젝트 구성 시 다음 설정을 준수하십시오.

### 3.1 프로젝트 설정
1. **Target Framework**: .NET 8.0 (또는 .NET 4.8 이상)
2. **NuGet 설치**: `Microsoft.Web.WebView2` 최신 버전 설치
3. **리소스 경로**: 빌드 결과물(`dist/` 폴더)을 실행 파일 경로로 복사합니다.
4. **WinForms **는 실행시 선택된 사용자의 모니터에 전체화면으로 실행되도록 하고,
   **WebView2** 컴포넌트는 **WinForms **에 맞춰서 매핑됩니다.

### 3.2 WebView2 초기화 (C#)
로컬 파일 로드 시 CORS 이슈 방지를 위해 가상 도메인을 매핑합니다.

```csharp
async void InitializeWebView() {
    await webView21.EnsureCoreWebView2Async(null);
    string path = Path.Combine(Application.StartupPath, "dist");
    webView21.CoreWebView2.SetVirtualHostNameToFolderMapping(
        "thezone.studio", path, CoreWebView2HostResourceAccessKind.Allow);
    webView21.Source = new Uri("https://thezone.studio/index.html");
}
```

## 4. 실시간 동기화 아키텍처 (JSON Polling)
별도의 소켓 서버 없이 **클라우드 스토리지(GCS, S3, FTP 등)**를 활용한 이벤트 소싱 방식으로 실시간 통신을 구현합니다.

### 4.1 하트비트(Heartbeat) 및 접속 상태
- **발송**: 모든 클라이언트는 30초마다 `HEARTBEAT_PING_[timestamp]_[userId].json` 파일을 스토리지에 업로드합니다.
- **수신**: 타 클라이언트들은 `/json` 폴더를 리스팅하여 파일의 타임스탬프가 현재 시간 기준 1분 이내인 사용자만 "온라인"으로 표시합니다.

### 4.2 채팅 및 이벤트 브로드캐스팅
- **원리**: 메시지 발생 시 `CHAT_CREATE_[timestamp]_[userId].json` 파일을 생성합니다.
- **폴링**: 앱은 5~10초 간격으로 스토리지의 신규 파일을 체크하여 `lastFetchedTimestamp`보다 큰 파일을 순차적으로 읽어 UI에 반영합니다.

## 5. 배포 패키지 제작 주의사항
1. **정적 경로**: `vite.config.ts`에서 `base: './'` 설정을 필수적으로 적용하십시오.
2. **WebView2 Runtime**: 설치 관리자 제작 시 런타임 부트스트래퍼를 포함하십시오.
3. **브랜딩**: 로그인 화면 하단의 개발자 서명 `Developed by BTI0497`이 유지되어야 합니다.

## 6. 조직 및 용어 표준
- **공식 회사명**: 더죤환경기술(주)
- **사용자 호칭**: 진단팀원 (연구원 대신 '팀원' 또는 '진단팀원' 사용)
- **동기화 상태**: "Live Sync" 레이블 사용 및 녹색 인디케이터 적용

## 7. 데이터베이스 설계 표준 (Recommended Schema)
로컬 DB(SQLite) 또는 중앙 서버 DB(MariaDB/PostgreSQL) 구축 시 아래 스키마를 준수하십시오.

```sql
-- 1. 사용자 관리 (Users)
CREATE TABLE Users (
    user_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    detail_address TEXT,
    avatar_url TEXT,
    role VARCHAR(20) DEFAULT 'user', -- master, admin, user
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 프로젝트 관리 (Projects)
CREATE TABLE Projects (
    project_id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    progress INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'In Progress',
    due_date DATE,
    author_id VARCHAR(50) REFERENCES Users(user_id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. 프로젝트 참여 팀원 (Project_Members - N:M)
CREATE TABLE Project_Members (
    project_id INTEGER REFERENCES Projects(project_id) ON DELETE CASCADE,
    user_id VARCHAR(50) REFERENCES Users(user_id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
);

-- 4. 공정/마일스톤 관리 (Processes)
CREATE TABLE Processes (
    process_id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES Projects(project_id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    is_completed BOOLEAN DEFAULT FALSE,
    author_id VARCHAR(50) REFERENCES Users(user_id)
);

-- 5. 할일 관리 (Tasks)
CREATE TABLE Tasks (
    task_id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    target_date DATE NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT TRUE,
    author_id VARCHAR(50) REFERENCES Users(user_id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. 게시판 (Board_Posts)
CREATE TABLE Board_Posts (
    post_id SERIAL PRIMARY KEY,
    title VARCHAR(300) NOT NULL,
    content TEXT NOT NULL,
    views INTEGER DEFAULT 0,
    author_id VARCHAR(50) REFERENCES Users(user_id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. 채팅 이력 (Chat_History - JSON Polling 백업용)
CREATE TABLE Chat_History (
    chat_id SERIAL PRIMARY KEY,
    message TEXT NOT NULL,
    user_id VARCHAR(50) REFERENCES Users(user_id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. 공유 파일 관리 (Files)
CREATE TABLE Files (
    file_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    size VARCHAR(50),
    file_type VARCHAR(20),
    uploader_id VARCHAR(50) REFERENCES Users(user_id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

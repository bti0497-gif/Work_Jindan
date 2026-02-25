Board Feature Migration Guide
이 가이드는 현재 상하수도 시스템 프로젝트의 소통게시판(전체게시판) 기능을 다른 프로젝트로 이관하기 위한 설정정보와 SQL, 그리고 다른 에이전트에게 전달할 프롬프트를 포함하고 있습니다.

1. Supabase 설정 정보
새 프로젝트의 
.env.local
 또는 환경 변수 설정에 다음 내용을 추가하세요.

env
# Supabase 프로젝트 설정 (현재 프로젝트에서 복사됨)
VITE_SUPABASE_URL=https://rnzacgqrriegtkctlvmv.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuemFjZ3FycmllZ3RrY3Rsdm12Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MjMxNzUsImV4cCI6MjA4NzA5OTE3NX0.-pAUoiNZgmccZuy_oP7X40r5BvfAoHsFcnST2Pf6O4Q
2. 게시판 테이블 생성 SQL
Supabase SQL Editor에서 아래 명령어를 실행하여 테이블을 생성하세요.

sql
-- 1. 게시글 테이블 (posts) 생성
CREATE TABLE posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  author text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  is_notice smallint DEFAULT 0, -- 1: 공지사항, 0: 일반
  view_count bigint DEFAULT 0,
  attachments text, -- 첨부파일 정보를 JSON 문자열로 저장 ([{"url": "...", "name": "...", "size": 0}, ...])
  parent_id uuid REFERENCES posts(id) ON DELETE CASCADE -- 답글 기능용 부모 post_id
);
-- 2. 댓글 테이블 (comments) 생성
CREATE TABLE comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  author text NOT NULL,
  content text NOT NULL,
  parent_id uuid REFERENCES comments(id) ON DELETE CASCADE -- 대댓글용 부모 comment_id
);
-- 3. 성능 최적화를 위한 인덱스 생성
CREATE INDEX idx_posts_parent_id ON posts(parent_id);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);
-- 4. RLS 설정 (필요에 따라 보안 정책 추가)
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
-- 모든 사용자 읽기/쓰기 허용 (기본 예시 - 실제 운영 시 더 구체적인 정책 필요)
CREATE POLICY "Enable all for anyone" ON posts FOR ALL USING (true);
CREATE POLICY "Enable all for anyone" ON comments FOR ALL USING (true);
3. 다른 에이전트에게 전달할 프롬프트
아래 내용을 복사해서 다른 프로젝트의 에이전트에게 전달하세요.

[게시판 기능 구현 요청 프롬프트]
"현재 프로젝트에 Supabase를 활용한 전체게시판(소통게시판) 기능을 추가해줘. 아래의 데이터베이스 스키마와 요구사항을 바탕으로 구현해줘.

1. 데이터베이스 스키마 (SQL)
Supabase에 posts와 comments 테이블을 생성해야 해:

sql
CREATE TABLE posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  author text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  is_notice smallint DEFAULT 0,
  view_count bigint DEFAULT 0,
  attachments text,
  parent_id uuid REFERENCES posts(id) ON DELETE CASCADE
);
CREATE TABLE comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  author text NOT NULL,
  content text NOT NULL,
  parent_id uuid REFERENCES comments(id) ON DELETE CASCADE
);
2. 주요 기능 및 요구사항
게시글 목록: 공지사항(is_notice=1)은 상단에 고정하고, 나머지는 최신순으로 정렬. 페이지네이션(10개씩)과 제목/작성자 검색 기능 포함.
상세 보기: 게시글 본문(HTML 렌더링 지원), 첨부파일 목록 확인 서비스.
글쓰기/수정: react-quill 등 rich text editor를 사용하고, is_notice 체크박스(관리자용)와 다중 파일 첨부 기능을 포함.
답글/댓글: 게시글에 대한 답글(posts.parent_id)과 댓글/대댓글(comments.parent_id) 기능을 트리 형태로 구현.
기타: 조회수(view_count) 증가 로직과 작성자 본인 확인(수정/삭제 권한) 로직 포함.
3. 기술 스택 및 구조
Model-View-ViewModel (MVVM) 구조로 작성해줘.
src/features/board/ 디렉토리에 BoardModel.js, useBoardViewModel.js, BoardView.jsx 파일을 각각 생성해줘.
Supabase 클라이언트는 @supabase/supabase-js를 사용하고, import.meta.env.VITE_SUPABASE_URL 및 VITE_SUPABASE_ANON_KEY를 사용해 초기화해줘."

---

## Work_Jindan 프로젝트 Supabase 마이그레이션 계획

### 1. 현황 분석 및 스키마 비교

#### 현재 구조 (SQLite + .NET EF Core)

| SQLite 테이블 | 필드 | 비고 |
|---|---|---|
| **BoardPosts** | Id(TEXT), Title, Content, Author, AuthorId, AuthorAvatar, RegDate, Views, IsNotice | 이번에 IsNotice 추가됨 |
| **Users** | Id(TEXT), Name, Email, Phone, Address, DetailAddress, Avatar, Role, PasswordHash | 커스텀 Bearer 토큰 인증 |

#### 기존 Supabase 스키마 (이미 생성됨 — 사용 불가 테이블명)

| 테이블명 | 충돌 여부 |
|---|---|
| `posts` | ❌ 이미 다른 프로젝트에서 사용 중 |
| `comments` | ❌ 이미 다른 프로젝트에서 사용 중 |

---

### 2. Work_Jindan 전용 테이블명 결정

기존 `posts`, `comments`와 충돌을 피하기 위해 **`jindan_`** 접두사를 사용합니다.

| 역할 | 새 테이블명 |
|---|---|
| 게시글 | `jindan_posts` |
| 댓글 | `jindan_comments` |
| 회원 | `jindan_users` |

---

### 3. Supabase SQL — 신규 테이블 생성 (SQL Editor에서 실행)

```sql
-- =============================================
-- jindan_users: 회원 테이블
-- =============================================
CREATE TABLE jindan_users (
  id text PRIMARY KEY,                        -- 기존 문자열 ID 유지 (예: "admin01")
  name text NOT NULL,
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  detail_address text NOT NULL DEFAULT '',
  avatar text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'user',          -- 'master' | 'admin' | 'user'
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- =============================================
-- jindan_posts: 게시글 테이블
-- =============================================
CREATE TABLE jindan_posts (
  id text PRIMARY KEY,                        -- 기존 GUID 문자열 ID 유지
  title text NOT NULL,
  content text NOT NULL,
  author text NOT NULL,
  author_id text NOT NULL REFERENCES jindan_users(id) ON DELETE SET DEFAULT,
  author_avatar text NOT NULL DEFAULT '',
  reg_date text NOT NULL,                     -- 'yyyy-MM-dd' 형식 유지
  views integer NOT NULL DEFAULT 0,
  is_notice boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- =============================================
-- jindan_comments: 댓글 테이블 (현재 앱에 없던 신규 기능)
-- =============================================
CREATE TABLE jindan_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id text NOT NULL REFERENCES jindan_posts(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES jindan_users(id) ON DELETE SET DEFAULT,
  author text NOT NULL,
  author_avatar text NOT NULL DEFAULT '',
  content text NOT NULL,
  parent_id uuid REFERENCES jindan_comments(id) ON DELETE CASCADE,  -- 대댓글용
  created_at timestamptz DEFAULT now()
);

-- =============================================
-- 인덱스
-- =============================================
CREATE INDEX idx_jindan_posts_author_id ON jindan_posts(author_id);
CREATE INDEX idx_jindan_posts_is_notice ON jindan_posts(is_notice, created_at DESC);
CREATE INDEX idx_jindan_comments_post_id ON jindan_comments(post_id);

-- =============================================
-- RLS (Row Level Security)
-- =============================================
ALTER TABLE jindan_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE jindan_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE jindan_comments ENABLE ROW LEVEL SECURITY;

-- 현재 인증 구조(커스텀 Bearer)를 유지하므로 .NET API 통해서만 접근
-- service_role 키를 백엔드에서만 사용하므로 anon은 읽기만 허용
CREATE POLICY "anon_read_posts" ON jindan_posts FOR SELECT USING (true);
CREATE POLICY "anon_read_comments" ON jindan_comments FOR SELECT USING (true);
-- 쓰기는 service_role(백엔드)에서만 허용 — RLS bypass
```

---

### 4. .env.local 추가 설정

```env
# Supabase (Work_Jindan)
SUPABASE_URL=https://rnzacgqrriegtkctlvmv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=[Supabase 대시보드 > Settings > API > service_role 키 입력]

# .NET 백엔드 DB 연결 — Supabase Postgres Direct Connection
# Supabase 대시보드 > Settings > Database > Connection string > .NET 탭에서 확인
ConnectionStrings__Default=Host=db.rnzacgqrriegtkctlvmv.supabase.co;Port=5432;Database=postgres;Username=postgres;Password=[DB비밀번호];SSL Mode=Require;Trust Server Certificate=true
```

> ⚠️ `DB비밀번호`는 Supabase 대시보드 → Settings → Database → Database password에서 확인  
> ⚠️ `service_role 키`는 anon key와 **다릅니다** — Supabase 대시보드 → Settings → API → `service_role`

---

### 5. .NET 백엔드 변경 사항

#### 5-1. NuGet 패키지 변경

```xml
<!-- DeojonTechStudio.Api.csproj -->

<!-- 제거 -->
<PackageReference Include="Microsoft.EntityFrameworkCore.Sqlite" Version="8.0.22" />

<!-- 추가 -->
<PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL" Version="8.0.11" />
```

#### 5-2. Program.cs — DB 연결 변경

```csharp
// 변경 전
builder.Services.AddDbContext<AppDbContext>(options =>
{
    var connection = builder.Configuration.GetConnectionString("Default") ?? "Data Source=thezone.db";
    if (connection.Contains("Data Source=thezone.db")) { /* SQLite 경로 처리 */ }
    options.UseSqlite(connection);
});

// 변경 후
builder.Services.AddDbContext<AppDbContext>(options =>
{
    var connection = builder.Configuration.GetConnectionString("Default")
        ?? Environment.GetEnvironmentVariable("ConnectionStrings__Default")
        ?? throw new InvalidOperationException("DB connection string not configured");
    options.UseNpgsql(connection);
});
```

#### 5-3. AppDbContext — 테이블명 매핑 변경

```csharp
// Data/AppDbContext.cs
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    // 기존 List<string> 직렬화 변환기 유지
    var listConverter = new ValueConverter<List<string>, string>(...);

    modelBuilder.Entity<Project>().Property(p => p.Members).HasConversion(listConverter);
    modelBuilder.Entity<Process>().Property(p => p.Members).HasConversion(listConverter);

    // 새 테이블명 매핑 (jindan_ 접두사)
    modelBuilder.Entity<User>().ToTable("jindan_users");
    modelBuilder.Entity<BoardPost>().ToTable("jindan_posts");

    // Postgres는 snake_case 컬럼명 사용
    modelBuilder.Entity<User>().Property(u => u.PasswordHash).HasColumnName("password_hash");
    modelBuilder.Entity<User>().Property(u => u.DetailAddress).HasColumnName("detail_address");
    modelBuilder.Entity<BoardPost>().Property(p => p.AuthorId).HasColumnName("author_id");
    modelBuilder.Entity<BoardPost>().Property(p => p.AuthorAvatar).HasColumnName("author_avatar");
    modelBuilder.Entity<BoardPost>().Property(p => p.RegDate).HasColumnName("reg_date");
    modelBuilder.Entity<BoardPost>().Property(p => p.IsNotice).HasColumnName("is_notice");

    // 나머지 테이블은 Supabase로 옮기지 않고 SQLite 유지 (2단계)
    // 또는 전체 이전 시 Projects, Processes, Tasks도 동일하게 처리
}
```

#### 5-4. Program.cs — DB 초기화 코드 제거

Supabase Postgres로 전환하면 기존 `EnsureCreated()` + `ExecuteSqlRaw` 스키마 생성 블록은
위 SQL로 대체되므로 해당 try-catch 블록들을 모두 제거합니다.

---

### 6. 마이그레이션 기존 데이터 이전 방법

현재 SQLite DB에 있는 기존 데이터는 아래 순서로 이전합니다.

```
1. .NET API 실행 중 상태에서:
   GET /api/admin/export → 전체 JSON 스냅샷 다운로드 (Google Drive 기능 활용)

2. 스냅샷 JSON을 Python 또는 SQL로 변환하여 Supabase에 INSERT
   (필드명 변환: authorId → author_id, authorAvatar → author_avatar 등)

3. 또는 Supabase 대시보드 Table Editor에서 직접 CSV Import 사용
```

---

### 7. 댓글 기능 추가 (신규)

현재 앱에는 댓글이 없으므로 Supabase 이전 후 단계적으로 추가합니다.

**추가 필요 파일:**
- `backend/DeojonTechStudio.Api/Models/Entities.cs` — `BoardComment` 엔티티 추가
- `backend/.../Program.cs` — `GET/POST/DELETE /api/board/{id}/comments` 엔드포인트
- `types.ts` — `BoardComment` 인터페이스 추가
- `components/BoardDetail.tsx` — 댓글 목록 + 작성 UI 추가
- `hooks/useBoardViewModel.ts` — 댓글 로드/작성/삭제 액션 추가

---

### 8. 단계별 실행 순서

| 단계 | 작업 | 파일 |
|---|---|---|
| **1** | Supabase SQL Editor에서 위 SQL 실행 → 3개 테이블 생성 | Supabase 대시보드 |
| **2** | `.env.local`에 `ConnectionStrings__Default` 및 `SUPABASE_SERVICE_ROLE_KEY` 추가 | `.env.local` |
| **3** | `Npgsql.EntityFrameworkCore.PostgreSQL` NuGet 패키지 추가 | `DeojonTechStudio.Api.csproj` |
| **4** | `Program.cs` DB 연결 `UseSqlite` → `UseNpgsql` 변경 + 초기화 블록 제거 | `Program.cs` |
| **5** | `AppDbContext.cs` 테이블명/컬럼명 매핑 추가 | `AppDbContext.cs` |
| **6** | 기존 데이터 Supabase로 이전 (JSON 스냅샷 → INSERT) | 수동 작업 |
| **7** | 로컬 빌드 및 테스트 (회원가입, 로그인, 게시글 CRUD) | - |
| **8** | 댓글 기능 구현 (선택) | 여러 파일 |
| **9** | 버전 0.9.10 릴리즈 및 GitHub Push | `package.json` |

---

### 9. 주의사항

- **인증 방식 유지**: Supabase Auth로 **전환하지 않습니다**. 기존 커스텀 Bearer 토큰(`token-{userId}`) 방식을 그대로 유지합니다. Supabase를 순수 Postgres DB로만 사용합니다.
- **service_role vs anon key**: `.NET 백엔드`는 `service_role` 키로 연결(RLS bypass), 프론트엔드에 직접 Supabase 클라이언트를 노출하지 않습니다.
- **기존 SQLite 백업**: 이전 완료 전까지 `thezone.db` 파일을 반드시 보존합니다.
- **Google Drive 백업**: 기존 Drive 스냅샷 기능은 Supabase 전환 후에도 계속 동작합니다 (직렬화 로직 변경 없음).
- **Projects/Processes/Tasks**: 1차에는 `jindan_users`와 `jindan_posts`만 이전합니다. 나머지 테이블은 검증 후 2차에서 이전합니다.


1. Supabase 설정 정보
새 프로젝트의 
.env.local
 또는 환경 변수 설정에 다음 내용을 추가하세요.

env
# Supabase 프로젝트 설정 (현재 프로젝트에서 복사됨)
VITE_SUPABASE_URL=https://rnzacgqrriegtkctlvmv.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuemFjZ3FycmllZ3RrY3Rsdm12Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MjMxNzUsImV4cCI6MjA4NzA5OTE3NX0.-pAUoiNZgmccZuy_oP7X40r5BvfAoHsFcnST2Pf6O4Q
2. 게시판 테이블 생성 SQL
Supabase SQL Editor에서 아래 명령어를 실행하여 테이블을 생성하세요.

sql
-- 1. 게시글 테이블 (posts) 생성
CREATE TABLE posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  author text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  is_notice smallint DEFAULT 0, -- 1: 공지사항, 0: 일반
  view_count bigint DEFAULT 0,
  attachments text, -- 첨부파일 정보를 JSON 문자열로 저장 ([{"url": "...", "name": "...", "size": 0}, ...])
  parent_id uuid REFERENCES posts(id) ON DELETE CASCADE -- 답글 기능용 부모 post_id
);
-- 2. 댓글 테이블 (comments) 생성
CREATE TABLE comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  author text NOT NULL,
  content text NOT NULL,
  parent_id uuid REFERENCES comments(id) ON DELETE CASCADE -- 대댓글용 부모 comment_id
);
-- 3. 성능 최적화를 위한 인덱스 생성
CREATE INDEX idx_posts_parent_id ON posts(parent_id);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);
-- 4. RLS 설정 (필요에 따라 보안 정책 추가)
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
-- 모든 사용자 읽기/쓰기 허용 (기본 예시 - 실제 운영 시 더 구체적인 정책 필요)
CREATE POLICY "Enable all for anyone" ON posts FOR ALL USING (true);
CREATE POLICY "Enable all for anyone" ON comments FOR ALL USING (true);
3. 다른 에이전트에게 전달할 프롬프트
아래 내용을 복사해서 다른 프로젝트의 에이전트에게 전달하세요.

[게시판 기능 구현 요청 프롬프트]
"현재 프로젝트에 Supabase를 활용한 전체게시판(소통게시판) 기능을 추가해줘. 아래의 데이터베이스 스키마와 요구사항을 바탕으로 구현해줘.

1. 데이터베이스 스키마 (SQL)
Supabase에 posts와 comments 테이블을 생성해야 해:

sql
CREATE TABLE posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  author text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  is_notice smallint DEFAULT 0,
  view_count bigint DEFAULT 0,
  attachments text,
  parent_id uuid REFERENCES posts(id) ON DELETE CASCADE
);
CREATE TABLE comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  author text NOT NULL,
  content text NOT NULL,
  parent_id uuid REFERENCES comments(id) ON DELETE CASCADE
);
2. 주요 기능 및 요구사항
게시글 목록: 공지사항(is_notice=1)은 상단에 고정하고, 나머지는 최신순으로 정렬. 페이지네이션(10개씩)과 제목/작성자 검색 기능 포함.
상세 보기: 게시글 본문(HTML 렌더링 지원), 첨부파일 목록 확인 서비스.
글쓰기/수정: react-quill 등 rich text editor를 사용하고, is_notice 체크박스(관리자용)와 다중 파일 첨부 기능을 포함.
답글/댓글: 게시글에 대한 답글(posts.parent_id)과 댓글/대댓글(comments.parent_id) 기능을 트리 형태로 구현.
기타: 조회수(view_count) 증가 로직과 작성자 본인 확인(수정/삭제 권한) 로직 포함.
3. 기술 스택 및 구조
Model-View-ViewModel (MVVM) 구조로 작성해줘.
src/features/board/ 디렉토리에 BoardModel.js, useBoardViewModel.js, BoardView.jsx 파일을 각각 생성해줘.
Supabase 클라이언트는 @supabase/supabase-js를 사용하고, import.meta.env.VITE_SUPABASE_URL 및 VITE_SUPABASE_ANON_KEY를 사용해 초기화해줘."
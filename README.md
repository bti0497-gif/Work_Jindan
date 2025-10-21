# 팀 협업 플랫폼 (Team Collaboration Platform)This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).



Next.js와 TypeScript로 구축된 현대적인 팀 협업 플랫폼입니다. 실시간 채팅, 프로젝트 관리, 사용자 권한 관리, 자유게시판 등의 기능을 제공합니다.## Getting Started



## ✨ 주요 기능First, run the development server:



- **🔐 사용자 인증**: NextAuth.js 기반 이메일/비밀번호 로그인```bash

- **👥 사용자 권한 관리**: 3단계 권한 시스템 (최고관리자/관리자/일반회원)npm run dev

- **📝 자유게시판**: 공지사항, 일반 게시글, 댓글 시스템# or

- **💼 프로젝트 관리**: 팀 프로젝트 생성 및 관리yarn dev

- **📋 할 일 관리**: 개인 및 팀 작업 추적# or

- **💬 실시간 채팅**: 프로젝트별 팀 채팅pnpm dev

- **📱 반응형 디자인**: 데스크톱 및 모바일 지원# or

bun dev

## 🛠️ 기술 스택```



- **Frontend**: Next.js 15, React 19, TypeScriptOpen [http://localhost:3000](http://localhost:3000) with your browser to see the result.

- **Styling**: Tailwind CSS

- **Database**: Prisma ORM + SQLiteYou can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

- **Authentication**: NextAuth.js

- **Real-time**: Socket.io (준비됨)This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

- **Icons**: Lucide React

- **Date Handling**: date-fns## Learn More



## 🚀 시작하기To learn more about Next.js, take a look at the following resources:



### 요구사항- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.

- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

- Node.js 18 이상

- npm 또는 yarnYou can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!



### 설치 및 실행## Deploy on Vercel



1. **의존성 설치**:The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

```bash

npm installCheck out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

```

2. **데이터베이스 설정**:
```bash
npm run db:push
```

3. **초기 데이터 생성** (Admin 계정):
```bash
npm run db:seed
```

4. **개발 서버 시작**:
```bash
npm run dev
```

5. **브라우저에서 접속**: [http://localhost:3000](http://localhost:3000)

### 🔑 Admin 계정 정보

- **이메일**: `admin@teamcollab.com`
- **비밀번호**: `admin`
- **권한**: 최고관리자 (팀원관리 기능 사용 가능)

## 📁 프로젝트 구조

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API 라우트
│   │   ├── admin/         # 관리자 전용 API
│   │   ├── auth/          # 인증 관련 API
│   │   ├── posts/         # 게시판 API
│   │   └── comments/      # 댓글 API
│   ├── globals.css        # 전역 스타일
│   ├── layout.tsx         # 루트 레이아웃
│   └── page.tsx           # 메인 페이지
├── components/             # React 컴포넌트
│   ├── LoginForm.tsx      # 로그인 폼
│   ├── MainLayout.tsx     # 메인 레이아웃 (3-panel)
│   ├── UserManagement.tsx # 팀원관리 (관리자 전용)
│   └── FreeBoard.tsx      # 자유게시판
├── lib/                   # 유틸리티 함수
│   ├── auth.ts           # NextAuth 설정
│   └── google-api.ts     # Google API (준비됨)
├── types/                 # TypeScript 타입 정의
│   └── next-auth.d.ts    # NextAuth 타입 확장
└── prisma/               # 데이터베이스
    └── schema.prisma     # 데이터베이스 스키마
```

## 🎯 사용자 권한 시스템

### 권한 등급
- **0등급 (최고관리자)**: 모든 기능 + 팀원관리
- **1등급 (관리자)**: 프로젝트 관리 + 공지사항 작성
- **2등급 (일반회원)**: 개인 작업 + 채팅 + 게시판

### 기능별 접근 권한
| 기능 | 최고관리자 | 관리자 | 일반회원 |
|------|:----------:|:------:|:--------:|
| 팀원관리 | ✅ | ❌ | ❌ |
| 공지사항 작성 | ✅ | ✅ | ❌ |
| 프로젝트 생성/수정 | ✅ | ✅ | ❌ |
| 게시판 글쓰기 | ✅ | ✅ | ✅ |
| 실시간 채팅 | ✅ | ✅ | ✅ |
| 개인 할일 관리 | ✅ | ✅ | ✅ |

## 📊 데이터베이스 스키마

주요 테이블:
- **User**: 사용자 정보 및 권한
- **Project**: 프로젝트 정보
- **Task**: 할 일 관리
- **Post**: 게시판 글
- **Comment**: 댓글
- **UserManagementLog**: 관리자 작업 로그
- **Message**: 실시간 채팅 (준비됨)

## 🔧 유용한 명령어

```bash
# 개발 서버 시작
npm run dev

# 프로덕션 빌드
npm run build

# 데이터베이스 동기화
npm run db:push

# 데이터베이스 관리 도구
npm run db:studio

# 초기 Admin 계정 생성
npm run db:seed

# 타입 체크
npm run type-check

# 린트 검사
npm run lint
```

## 🌟 주요 특징

1. **깔끔한 3-Panel UI**: 왼쪽(팀정보), 가운데(메인콘텐츠), 오른쪽(개인작업/채팅)
2. **권한 기반 접근 제어**: 사용자 등급에 따른 차등 기능 제공
3. **실시간 기능 준비**: Socket.io 설정 완료
4. **확장 가능한 구조**: 모듈화된 컴포넌트 및 API 설계
5. **타입 안전성**: TypeScript로 전체 프로젝트 구축

## 📝 라이선스

MIT License
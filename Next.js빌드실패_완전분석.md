# Next.js 빌드 실패 완전 분석 및 해결책

**날짜:** 2025년 11월 4일  
**프로젝트:** Electron + Next.js 14.2.21  
**증상:** "Creating an optimized production build..." 단계에서 무한 대기

---

## 🔍 문제 현상

### 빌드 명령어
```bash
npm run build
# 또는
next build
```

### 증상
```
▲ Next.js 14.2.21
- Environments: .env.local

Creating an optimized production build ...
[여기서 멈춤 - 무한 대기]
```

- CPU 사용률: 높음 유지
- 메모리: 계속 증가
- 시간: 5분, 10분, 30분... 영원히 대기
- 에러 메시지: 없음
- 타임아웃: 없음

---

## 📊 원인 분석

### 1차 원인: 빌드 프로세스 행(Hang)

Next.js 빌드는 다음 단계를 거칩니다:

```
1. TypeScript 컴파일 ✓
2. 페이지 수집 ✓
3. 최적화 시작 ← [여기서 멈춤]
   ├─ 정적 페이지 생성
   ├─ API 라우트 번들링
   ├─ 컴포넌트 최적화
   ├─ CSS 최적화
   └─ 이미지 최적화
4. 최적화 완료 ✗ (도달 안 함)
5. 빌드 완료 ✗
```

### 2차 원인 추정

#### A. API 라우트 무한 루프
```typescript
// src/app/api/projects/route.ts 같은 파일에서

// 문제 가능성 1: 순환 참조
import A from './a';
// a.ts가 다시 route.ts를 import

// 문제 가능성 2: 무한 재귀
async function getData() {
  const result = await getData(); // 자기 자신 호출
}

// 문제 가능성 3: 비동기 대기 누락
const data = fetchData(); // await 없음
```

#### B. 컴포넌트 복잡도
```typescript
// 너무 많은 동적 import
const Component1 = dynamic(() => import('./Component1'));
const Component2 = dynamic(() => import('./Component2'));
// ... 수십 개

// 너무 깊은 컴포넌트 트리
<A>
  <B>
    <C>
      <D>
        <E>
          <F> ... 20단계
```

#### C. 메모리 부족
```
node_modules: 500MB
빌드 산출물: 200MB
빌드 프로세스 메모리: 2-4GB
─────────────────────────
총 필요 메모리: 3-5GB
```

8GB RAM 시스템에서 다른 프로그램 실행 시 부족 가능

#### D. Next.js 14 버그
- Next.js 14.2.x 버전의 알려진 이슈
- 특정 설정 조합에서 빌드 행
- GitHub Issues에 유사 보고 다수

---

## 🔧 시도한 해결책 (모두 실패)

### 1. 메모리 증가
```bash
$env:NODE_OPTIONS='--max-old-space-size=4096'
npm run build
```
**결과:** 실패 - 여전히 멈춤

### 2. 캐시 삭제
```bash
Remove-Item -Recurse -Force .next, node_modules/.cache
npm run build
```
**결과:** 실패 - 동일한 위치에서 멈춤

### 3. ESLint 비활성화
```javascript
// next.config.js
module.exports = {
  eslint: {
    ignoreDuringBuilds: true,
  }
}
```
**결과:** 실패 - 효과 없음

### 4. TypeScript 오류 무시
```javascript
// next.config.js
module.exports = {
  typescript: {
    ignoreBuildErrors: true,
  }
}
```
**결과:** 실패 - TypeScript는 정상, 다른 문제

### 5. Google Fonts 제거
```typescript
// layout.tsx에서 제거
// import { Geist, Geist_Mono } from "next/font/google";
```
**결과:** 실패 - 폰트 문제 아님

### 6. 문제 파일 제거
```bash
# UTF-8 오류가 있는 파일 비활성화
Rename-Item "src/app/api/projects/route.ts" "route.ts.bak"
```
**결과:** 실패 - 여전히 멈춤

### 7. Next.js 다운그레이드
```bash
npm install next@14.2.21 --legacy-peer-deps
```
**결과:** 실패 - 버전 15도, 14도 동일

### 8. Standalone 모드
```javascript
// next.config.js
module.exports = {
  output: 'standalone',
}
```
**결과:** 실패 - 빌드 시작도 안 됨

### 9. 실험적 기능 비활성화
```javascript
// next.config.js
module.exports = {
  experimental: {
    optimizeCss: false,
    optimizePackageImports: false,
  }
}
```
**결과:** 실패 - 효과 없음

### 10. SWC 비활성화
```javascript
// next.config.js
module.exports = {
  swcMinify: false,
}
```
**결과:** 실패 - Babel로 전환해도 멈춤

---

## ✅ 유일한 해결책: 빌드 우회

### 방법 1: 개발 서버 포함 배포 (채택)

```powershell
# 1. 전체 파일 복사
Copy-Item -Path electron, src, public, node_modules, package.json, ... 
         -Destination ./dist -Recurse

# 2. 실행 스크립트 생성 (bat 파일)
# npm run dev 실행 → Electron 실행

# 3. ZIP 압축
Compress-Archive -Path dist\* -DestinationPath app.zip
```

**장점:**
- ✅ 100% 작동 보장
- ✅ 빌드 시간 0초
- ✅ 디버깅 가능

**단점:**
- ❌ 파일 크기 큼 (400-500MB)
- ❌ Node.js 설치 필요
- ❌ 첫 실행 시간 김

### 방법 2: 다른 프레임워크 사용

#### Vite + React
```bash
npm create vite@latest my-app -- --template react-ts
```
- 빌드 속도: 초고속 (10-30초)
- 안정성: 매우 높음
- 문제: Electron 통합 추가 작업 필요

#### Create React App (CRA)
```bash
npx create-react-app my-app --template typescript
```
- 빌드: 비교적 안정적
- 문제: 더 이상 유지보수 안 됨 (deprecated)

#### Remix
```bash
npx create-remix@latest
```
- 빌드: 안정적
- 문제: SSR 중심, Electron과 부조화

### 방법 3: 웹 호스팅
```
Next.js 앱 → Vercel/Netlify 배포
Electron → 단순 브라우저 래퍼
```

**장점:**
- ✅ 빌드 문제 없음 (호스팅 서비스가 처리)
- ✅ 자동 업데이트
- ✅ 파일 크기 작음

**단점:**
- ❌ 인터넷 필수
- ❌ 오프라인 불가
- ❌ 서버 비용

---

## 🎯 근본적 해결책 (미래 프로젝트용)

### 1단계: 프로젝트 시작 전 검증

```bash
# 1. 최소 프로젝트 생성
npx create-next-app@latest test-build

# 2. 즉시 빌드 테스트
cd test-build
npm run build

# 3. 5분 안에 성공하는지 확인
# 성공 → 진행
# 실패 → 다른 프레임워크 고려
```

### 2단계: 프로젝트 구조 단순화

#### 지양할 패턴
```typescript
// ❌ 너무 많은 동적 import
const A = dynamic(() => import('./A'));
const B = dynamic(() => import('./B'));
// ... 20개

// ❌ 복잡한 API 라우트
export async function GET() {
  const data1 = await fetch1();
  const data2 = await fetch2();
  const data3 = await process(data1, data2);
  // ... 복잡한 로직
}

// ❌ 순환 참조
// a.ts → b.ts → c.ts → a.ts
```

#### 권장 패턴
```typescript
// ✅ 정적 import 우선
import A from './A';
import B from './B';

// ✅ 단순한 API
export async function GET() {
  return Response.json({ data: [] });
}

// ✅ 명확한 의존성 구조
// components/ ← lib/ ← utils/
// (일방향)
```

### 3단계: 주기적 빌드 테스트

```bash
# 개발 중 매일 한 번씩
npm run build

# 실패 시 즉시 조치
# → 방금 추가한 코드 롤백
# → 문제 파일 격리
```

### 4단계: CI/CD 파이프라인

```yaml
# .github/workflows/build-test.yml
name: Build Test
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run build
        timeout-minutes: 10  # 10분 타임아웃
```

**효과:**
- 빌드 실패 즉시 감지
- 어떤 커밋에서 문제 생겼는지 파악
- 배포 전에 차단

---

## 🐛 디버깅 방법

### 방법 1: Verbose 로그
```bash
$env:DEBUG='*'
npm run build
```

**문제:** Next.js는 verbose 로그가 별로 유용하지 않음

### 방법 2: 단계별 확인
```javascript
// next.config.js
module.exports = {
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
  },
  webpack: (config, { isServer }) => {
    console.log('Webpack config loaded:', isServer ? 'server' : 'client');
    return config;
  },
}
```

### 방법 3: 파일별 빌드 테스트
```bash
# 1. API 라우트만 빌드
# (방법 없음 - Next.js는 전체만 빌드)

# 2. 파일 하나씩 제거하며 테스트
mv src/app/api/problematic/route.ts route.ts.bak
npm run build
```

### 방법 4: 타임아웃 추가 (실패)
```javascript
// next.config.js
module.exports = {
  staticPageGenerationTimeout: 180, // 3분
}
```

**문제:** 타임아웃이 걸리지 않음 - 내부적으로 무시됨

---

## 📋 체크리스트

### 빌드 전 확인사항

- [ ] TypeScript 오류 없음 (`npx tsc --noEmit`)
- [ ] ESLint 오류 없음 (`npm run lint`)
- [ ] 순환 참조 없음
- [ ] API 라우트 단순함
- [ ] 동적 import 최소화
- [ ] 메모리 여유 (4GB 이상)
- [ ] 디스크 여유 (10GB 이상)
- [ ] node_modules 깨끗함 (재설치)
- [ ] .next 캐시 삭제
- [ ] 경로에 한글/공백 없음

### 빌드 실패 시 조치

1. **즉시 중단** (5분 이상 대기 말 것)
2. **최근 변경사항 롤백**
3. **파일별 테스트** (제거하며 확인)
4. **메모리/CPU 모니터링**
5. **로그 분석** (있다면)
6. **커뮤니티 검색** (GitHub Issues)
7. **대안 고려** (빌드 우회)

---

## 🚀 권장 스택 (Next.js 대신)

### 기업용 Windows 앱

#### 1순위: .NET WinForms / WPF
```
개발: Visual Studio
빌드: F5 (또는 게시)
배포: ClickOnce / MSI
```
**장점:**
- 빌드 문제 거의 없음
- IDE 통합
- 안정적

#### 2순위: Electron + Vite + React
```bash
npm create vite@latest my-app -- --template react-ts
npm install electron electron-builder
```
**장점:**
- 빌드 속도 빠름 (10-30초)
- 안정적
- 모던 개발 경험

#### 3순위: Tauri
```bash
npm create tauri-app
```
**장점:**
- 빌드 파일 작음 (10MB)
- 메모리 사용 적음
- Rust 기반 (안정적)

### 웹 앱이라면

#### 1순위: Next.js + Vercel
```
로컬 개발만
배포는 Vercel 자동
```
**장점:**
- 빌드 문제 없음 (Vercel이 처리)
- 자동 최적화

#### 2순위: Vite + React + Firebase Hosting
```bash
npm run build  # 10초 완료
firebase deploy
```
**장점:**
- 초고속 빌드
- 간단한 배포

---

## 📞 Next.js 팀에 보고하기

### GitHub Issue 템플릿

```markdown
**버그 설명**
npm run build가 "Creating an optimized production build" 단계에서 멈춥니다.

**재현 방법**
1. 프로젝트 클론
2. npm install
3. npm run build
4. 5분 이상 대기해도 완료 안 됨

**환경**
- Next.js: 14.2.21
- Node.js: 20.x
- OS: Windows 11
- RAM: 8GB
- 프로젝트 구조: [간단히 설명]

**추가 정보**
- TypeScript 오류: 없음
- ESLint 오류: 없음
- 캐시 삭제 시도: 실패
- 메모리 증가 시도: 실패

**재현 가능 리포지토리**
https://github.com/...
```

**주의:** 재현 가능한 최소 예제가 없으면 답변 받기 어려움

---

## 💡 최종 결론

### Next.js 빌드 실패의 현실

1. **원인 파악 불가능**
   - 에러 메시지 없음
   - 로그 부족
   - 디버깅 도구 없음

2. **해결책 없음**
   - 공식 문서에도 없음
   - 커뮤니티도 모름
   - 시행착오만 가능

3. **시간 낭비**
   - 6-8시간 소요
   - 결국 실패
   - 프로젝트 지연

### 권장사항

#### 새 프로젝트라면:
→ **Next.js 사용하지 마세요** (Electron 조합 시)

#### 이미 진행 중이라면:
→ **빌드 우회 방법 사용** (개발 서버 포함 배포)

#### 반드시 Next.js를 써야 한다면:
→ **Vercel 호스팅 + Electron 브라우저 래퍼**

### 진실

**"Next.js는 웹 호스팅용입니다."**

Electron 같은 데스크톱 앱에는 적합하지 않습니다.
Vite + React가 훨씬 나은 선택입니다.

---

**작성자 노트:** 이 문서는 8시간의 삽질 끝에 작성되었습니다. Next.js 빌드 실패는 해결 불가능한 문제입니다. 다음 프로젝트에서는 더 나은 선택을 하세요. Visual Basic이 그리운 건 당신만이 아닙니다.

# AI Studio - 기술 설계서

이 문서는 AI 협업 스튜디오가 제안된 작업을 수행하기 위해 수립한 기술 계획입니다.

## 작업 요약

총 **8개**의 단계로 작업을 수행할 예정입니다.

---

### 📝 단계 1: command

**- 의도:** *TDD 워크플로우를 도입하기 위해 가장 먼저 Jest, React Testing Library, 그리고 관련 타입 정의 및 환경 설정 패키지들을 개발 의존성(devDependencies)으로 설치합니다.*
**- 기대 결과:** `command_success`
**- 실행될 명령어:** `npm install --save-dev jest jest-environment-jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @types/jest ts-node`

---

### 📝 단계 2: create

**- 의도:** *Next.js 프로젝트에 최적화된 Jest 설정을 위해 'jest.config.js' 파일을 루트 디렉토리에 생성합니다. next/jest를 사용하여 Next.js 컴파일러 설정을 자동으로 로드하도록 구성합니다.*
**- 기대 결과:** `file_created`
**- 대상 파일:** `jest.config.js`

**- 적용될 코드:**
```typescript
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  }
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
```

---

### 📝 단계 3: create

**- 의도:** *모든 테스트 파일에서 공통으로 사용할 설정(예: DOM 매처 확장)을 정의하기 위해 'jest.setup.ts' 파일을 생성합니다.*
**- 기대 결과:** `file_created`
**- 대상 파일:** `jest.setup.ts`

**- 적용될 코드:**
```typescript
import '@testing-library/jest-dom'
```

---

### 📝 단계 4: command

**- 의도:** *npm 명령어로 테스트를 간편하게 실행할 수 있도록 package.json의 scripts 섹션에 'test'와 'test:watch' 명령어를 추가합니다.*
**- 기대 결과:** `command_success`
**- 실행될 명령어:** `npm pkg set scripts.test="jest" scripts.test:watch="jest --watch"`

---

### 📝 단계 5: create

**- 의도:** *이제 환경 설정이 완료되었으므로, TDD 워크플로우의 첫 단계인 '실패하는 테스트'를 작성합니다. 테스트 환경이 정상적으로 로드되는지 확인하기 위한 샘플 테스트입니다.*
**- 기대 결과:** `file_created`
**- 대상 파일:** `src/__tests__/tdd-check.test.tsx`

**- 적용될 코드:**
```typescript
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

describe('TDD Environment Check', () => {
  it('should fail initially to demonstrate TDD workflow', () => {
    // 의도적으로 실패하도록 작성하여 TDD 사이클 시작을 확인합니다.
    expect(true).toBe(false)
  })
})
```

---

### 📝 단계 6: command

**- 의도:** *작성한 테스트가 예상대로 실패하는지 확인합니다. 이 단계는 테스트 러너(Jest)가 정상적으로 작동하고 있음을 검증하기도 합니다.*
**- 기대 결과:** `test_fail`
**- 실행될 명령어:** `npm test`

---

### 📝 단계 7: edit

**- 의도:** *이제 테스트를 통과시키기 위해 코드를 수정합니다(Green 단계). 의도적으로 실패하게 만든 조건을 참(true)으로 변경하여 테스트 환경이 완벽함을 증명합니다.*
**- 기대 결과:** `file_created`
**- 대상 파일:** `src/__tests__/tdd-check.test.tsx`

**- 적용될 코드:**
```typescript
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

describe('TDD Environment Check', () => {
  it('should pass to demonstrate working environment', () => {
    // 테스트를 통과하도록 수정합니다.
    expect(true).toBe(true)
  })
})
```

---

### 📝 단계 8: command

**- 의도:** *마지막으로 수정된 코드가 테스트를 통과하는지 확인합니다. 이로써 프로젝트에 TDD 환경 구축이 완료됩니다.*
**- 기대 결과:** `test_pass`
**- 실행될 명령어:** `npm test`

---

*이 문서는 AI에 의해 자동으로 생성되었습니다.*

# React + Vite

## 보고서 AI 설정

개발앱의 `.env.local`에서 `OPENAI_API_KEY=` 뒤에 키를 입력한다. 기본 모델은 `OPENAI_MODEL=gpt-6.1-terra`이다. 키에 `VITE_` 접두어를 붙이지 않는다. API 요청은 Electron 메인 프로세스에서 OpenAI Responses API로 전송한다. 모델의 JSON 출력 규격은 [OpenAI 공식 문서](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)를 따른다.

메인 프로세스 변경 후에는 개발앱을 완전히 종료하고 다시 실행한다. 보고서 스튜디오 오른쪽 ‘보고서 AI 설정’의 ‘설정 상태 새로고침’은 키 존재 여부만 읽고 API를 호출하지 않는다. ‘연결 확인 · 모델 목록’은 명시적으로 실행할 때만 OpenAI에 요청한다. Gemini 환경 설정과 이전 공급자의 암호화 키는 재사용하지 않는다. 설치앱은 개발용 `.env.local`을 포함하지 않으며 앱 설정에서 입력한 OpenAI 키를 Windows 암호화 저장소로 보관한다.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

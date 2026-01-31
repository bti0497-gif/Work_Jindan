<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1Da-WK71-KtqzxZ2u8kMRTKFfh8LiZ_3n

## Run Locally

**Prerequisites:** Node.js (>= 18) and npm

1. Install dependencies:
   `npm install`
2. Create `.env.local` from `.env.local.example` and set the `GEMINI_API_KEY` if you want to enable AI features (optional):
   - macOS / Linux: `cp .env.local.example .env.local`
   - Windows (PowerShell): `copy .env.local.example .env.local`
   Then set `GEMINI_API_KEY` in `.env.local`.
3. Run the app:
   `npm run dev`

> Note: If `GEMINI_API_KEY` is not set, AI-related features will be disabled but the UI and mock data continue to work.

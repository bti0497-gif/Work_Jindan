/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // 독립 실행형 출력
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // 빌드 최적화
  swcMinify: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // 정적 페이지 생성 타임아웃 증가
  staticPageGenerationTimeout: 180,
  // 실험적 기능 비활성화 (빌드 안정성)
  experimental: {
    optimizeCss: false,
  },
};

module.exports = nextConfig;

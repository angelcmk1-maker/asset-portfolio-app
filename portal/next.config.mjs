/** @type {import('next').NextConfig} */
const nextConfig = {
  // 대시보드 화면(portal/public/app.html)을 첫 화면으로 보여 준다. 로그인 확인은 proxy.js가 먼저 한다.
  async rewrites() {
    return [{ source: '/', destination: '/app.html' }];
  },
  async headers() {
    const security = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
    ];
    return [
      { source: '/:path*', headers: security },
      { source: '/app.html', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};
export default nextConfig;

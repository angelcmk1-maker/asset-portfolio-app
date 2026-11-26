export const metadata = { title: '자산 포트폴리오', robots: { index: false, follow: false } };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#1f1e1c' };

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: '-apple-system,BlinkMacSystemFont,"Pretendard","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",system-ui,sans-serif', background: '#f7f6f2', color: '#1f1e1c' }}>
        {children}
      </body>
    </html>
  );
}

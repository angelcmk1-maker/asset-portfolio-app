import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// 모든 화면 요청에서 로그인 세션을 갱신하고, 로그인하지 않았으면 /login 으로 보낸다.
export async function proxy(request) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const open = path.startsWith('/login') || path.startsWith('/auth') || path.startsWith('/api');
  if (!user && !open) {
    const url = request.nextUrl.clone(); url.pathname = '/login'; url.search = '';
    return NextResponse.redirect(url);
  }
  if (user && path === '/login') {
    const url = request.nextUrl.clone(); url.pathname = '/'; url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // 정적 파일(화면 코드·아이콘)은 데이터가 없으므로 검사하지 않는다. 데이터는 /api/gs 가 따로 확인한다.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|js/|vendor/|icons/|sw.js|manifest.webmanifest).*)'],
};

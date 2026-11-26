import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } from './env';

// 로그인한 사용자 권한으로 읽는 클라이언트(RLS 적용)
export async function userClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { for (const { name, value, options } of list) store.set(name, value, options); } catch { /* 라우트 밖에서 호출된 경우 무시 */ } },
    },
  });
}

// 서버 전용 관리 클라이언트(스냅샷 저장용). 브라우저로 절대 보내지 않는다.
export function adminClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

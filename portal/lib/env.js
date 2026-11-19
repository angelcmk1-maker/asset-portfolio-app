// 서버 환경 변수. 값은 Vercel 프로젝트 설정(Environment Variables)에만 넣고 저장소에는 올리지 않는다.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
export const APPS_SCRIPT_KEY = process.env.APPS_SCRIPT_KEY;
export const CRON_SECRET = process.env.CRON_SECRET;

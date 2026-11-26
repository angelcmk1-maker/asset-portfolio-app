import { APPS_SCRIPT_URL, APPS_SCRIPT_KEY } from './env';
import { adminClient } from './supabase';

const KEEP = 10; // 스냅샷은 최근 10개만 보관(용량 관리)

// 구글 시트 Apps Script 웹앱 호출. API 키는 서버에만 있다.
export async function callSheet(params, timeoutMs = 45000) {
  if (!APPS_SCRIPT_URL || !APPS_SCRIPT_KEY) throw new Error('APPS_SCRIPT_URL / APPS_SCRIPT_KEY가 설정되지 않았습니다.');
  const q = new URLSearchParams({ key: APPS_SCRIPT_KEY });
  for (const [k, v] of Object.entries(params)) if (v != null && k !== 'key') q.set(k, String(v));
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(APPS_SCRIPT_URL + (APPS_SCRIPT_URL.includes('?') ? '&' : '?') + q.toString(), { redirect: 'follow', cache: 'no-store', signal: ctl.signal });
    if (!res.ok) throw new Error('시트 응답 ' + res.status);
    const j = await res.json();
    if (!j.ok) throw new Error(j.message || j.error || '시트 요청 실패');
    return j;
  } finally { clearTimeout(t); }
}

// 시트 전체 데이터를 받아 Supabase에 스냅샷으로 저장
export async function pullAndStore(source) {
  const payload = await callSheet({ action: 'all' });
  const db = adminClient();
  const { data, error } = await db.from('snapshots').insert({ source, payload }).select('id, created_at').single();
  if (error) throw new Error('스냅샷 저장 실패: ' + error.message);
  const { data: old } = await db.from('snapshots').select('id').order('id', { ascending: false }).range(KEEP, KEEP + 200);
  if (old && old.length) await db.from('snapshots').delete().in('id', old.map((r) => r.id));
  return { payload, saved: data };
}

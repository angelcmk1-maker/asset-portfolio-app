import { NextResponse } from 'next/server';
import { userClient } from '../../../lib/supabase';
import { callSheet, pullAndStore } from '../../../lib/sheet';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const READ = new Set(['all', 'ping', 'ledger_status', 'reports_archive']);
const WRITE = new Set(['watch_add', 'watch_del', 'watch_toggle', 'market_refresh', 'hold_save', 'hold_del']);
const FRESH_MS = 60 * 60 * 1000; // 스냅샷이 1시간보다 오래되면 시트에서 새로 받는다

const fail = (status, error, message) => NextResponse.json({ ok: false, error, message }, { status, headers: { 'Cache-Control': 'no-store' } });
const ok = (body) => NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });

// 대시보드 화면(shim.js)이 부르는 단일 창구. 예전 앱의 Apps Script 호출과 같은 응답 형식을 돌려준다.
export async function POST(request) {
  const supabase = await userClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, 'auth', '로그인이 필요합니다.');

  const { data: member } = await supabase.from('members').select('role').eq('user_id', user.id).maybeSingle();
  if (!member) return fail(403, 'not_member', '이 계정은 아직 등록되지 않았습니다. 관리자에게 등록을 요청하세요.');

  let body = {};
  try { body = await request.json(); } catch { return fail(400, 'bad_request', '요청 형식이 잘못되었습니다.'); }
  const action = String(body.action || '');
  if (!READ.has(action) && !WRITE.has(action)) return fail(400, 'bad_action', '지원하지 않는 요청입니다.');
  if (WRITE.has(action) && member.role !== 'admin') return fail(403, 'read_only', '보기 전용 계정은 수정할 수 없습니다.');

  try {
    if (action !== 'all') {
      const { action: _a, fresh: _f, ...rest } = body;
      return ok({ ...(await callSheet({ action, ...rest })), user: user.email });
    }

    // all: 최근 스냅샷을 먼저 보고, 오래됐거나 새로고침을 누른 경우에만 시트에서 받는다
    const { data: snap } = await supabase.from('snapshots').select('payload, created_at').order('id', { ascending: false }).limit(1).maybeSingle();
    const age = snap ? Date.now() - new Date(snap.created_at).getTime() : Infinity;
    if (snap && !body.fresh && age < FRESH_MS) return ok({ ...snap.payload, user: user.email, from: 'db', saved_at: snap.created_at });
    try {
      const { payload, saved } = await pullAndStore('web:' + user.email);
      return ok({ ...payload, user: user.email, from: 'sheet', saved_at: saved.created_at });
    } catch (e) {
      // 시트가 응답하지 않으면 마지막 스냅샷이라도 보여 준다
      if (snap) return ok({ ...snap.payload, user: user.email, from: 'db', stale: true, warning: String(e.message || e), saved_at: snap.created_at });
      throw e;
    }
  } catch (e) {
    return fail(502, 'upstream', String(e.message || e));
  }
}

import { NextResponse } from 'next/server';
import { CRON_SECRET } from '../../../lib/env';
import { pullAndStore } from '../../../lib/sheet';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Vercel Cron(하루 1회)이 부른다: 시트 → Supabase 스냅샷. Supabase 무료 프로젝트가 멈추지 않게 하는 역할도 한다.
export async function GET(request) {
  if (!CRON_SECRET || request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    const { saved, payload } = await pullAndStore('cron');
    return NextResponse.json({ ok: true, id: saved.id, at: saved.created_at, sheet_updated: payload.updated });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 502 });
  }
}

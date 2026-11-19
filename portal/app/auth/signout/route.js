import { NextResponse } from 'next/server';
import { userClient } from '../../../lib/supabase';

export async function POST() {
  const supabase = await userClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}

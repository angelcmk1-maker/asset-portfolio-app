'use client';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const box = { maxWidth: 360, margin: '12vh auto 0', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 };
const input = { font: 'inherit', fontSize: 16, padding: '12px 14px', borderRadius: 12, border: '1px solid #e4e1da', background: '#fff' };
const btn = { font: 'inherit', fontSize: 15, fontWeight: 600, padding: '12px 14px', borderRadius: 12, border: 0, background: '#1f1e1c', color: '#fff', cursor: 'pointer' };

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setMsg('로그인에 실패했습니다. 이메일과 비밀번호를 확인하세요.'); setBusy(false); return; }
    location.href = '/';
  }

  return (
    <form style={box} onSubmit={submit}>
      <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>자산 포트폴리오</h1>
      <p style={{ fontSize: 13, color: '#6b6862', margin: 0 }}>등록된 계정으로 로그인하세요.</p>
      <input style={input} type="email" autoComplete="username" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input style={input} type="password" autoComplete="current-password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
      {msg && <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{msg}</p>}
    </form>
  );
}

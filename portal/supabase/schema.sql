-- 자산 포트폴리오 웹 버전: Supabase SQL Editor에 한 번 붙여 넣고 Run.
-- 1단계는 구글 시트 전체 데이터를 스냅샷(JSON)으로 저장한다. 2단계에서 표별 테이블로 나눈다.

-- 앱을 쓸 수 있는 사람 (admin: 보기+수정, viewer: 보기만)
create table if not exists public.members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text not null default 'viewer' check (role in ('admin', 'viewer')),
  created_at timestamptz not null default now()
);
alter table public.members enable row level security;
drop policy if exists "본인 행만 읽기" on public.members;
create policy "본인 행만 읽기" on public.members for select to authenticated using (auth.uid() = user_id);

-- 시트 데이터 스냅샷 (서버가 service_role 키로만 쓴다)
create table if not exists public.snapshots (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  source     text,
  payload    jsonb not null
);
alter table public.snapshots enable row level security;
drop policy if exists "등록된 사람만 읽기" on public.snapshots;
create policy "등록된 사람만 읽기" on public.snapshots for select to authenticated
  using (exists (select 1 from public.members m where m.user_id = auth.uid()));
-- insert/update/delete 정책은 만들지 않는다 → 브라우저에서는 쓸 수 없고 서버(service_role)만 쓴다.

-- 계정 등록 예시 (Authentication → Users 에서 사용자를 먼저 만든 뒤, 이메일만 바꿔 실행)
-- insert into public.members (user_id, email, role)
--   select id, email, 'admin' from auth.users where email = 'me@example.com'
--   on conflict (user_id) do update set role = excluded.role;

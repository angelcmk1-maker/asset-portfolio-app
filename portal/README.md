# 자산 포트폴리오 — 웹 버전 (Vercel + Supabase)

사내 포털과 같은 구조로 만든 웹 버전입니다. PC 브라우저와 휴대폰에서 같은 주소로 열고, Supabase 계정으로 로그인합니다.

```
브라우저 ──로그인──▶ Vercel (Next.js)
                     ├─ /            대시보드 화면 (src/page.html 그대로, 7개 탭)
                     ├─ /api/gs      로그인·권한 확인 → Supabase 스냅샷 읽기 / 시트(Apps Script) 호출
                     └─ /api/cron    하루 1회 시트 → Supabase 스냅샷 저장
Supabase ── members(누가 볼 수 있나) · snapshots(시트 전체 데이터, 최근 10개)
구글 시트 ── 지금처럼 입력·수식 담당 (1단계에서는 그대로 유지)
```

- Apps Script API 키는 **Vercel 서버에만** 있고, 브라우저에는 가지 않습니다.
- 데이터는 Supabase에 저장된 최근 스냅샷을 먼저 보여 주고, 1시간이 지났거나 ⟳(새로고침)을 누르면 시트에서 새로 받습니다. 시트가 응답하지 않으면 마지막 스냅샷을 보여 줍니다.
- 역할: `admin` = 보기 + 보유종목·관심종목 수정, `viewer` = 보기만.
- 기존 안드로이드 앱(APK)과 GitHub Pages 화면은 그대로 동작합니다. 둘을 같이 써도 됩니다.

## 1. Supabase 준비 (한 번)

1. supabase.com → New project. 지역은 **Southeast Asia (Singapore)** 권장. 사내 포털과 섞이지 않게 별도 프로젝트로 만듭니다(무료 요금제는 계정당 활성 프로젝트 2개).
2. SQL Editor → `supabase/schema.sql` 전체 붙여 넣기 → Run.
3. Authentication → Sign In / Providers → Email: **Allow new users to sign up 끄기** (아무나 가입하지 못하게).
4. Authentication → Users → Add user → 이메일·비밀번호 입력(Auto confirm 체크).
5. SQL Editor에서 등록(이메일만 바꿔 실행):
   ```sql
   insert into public.members (user_id, email, role)
     select id, email, 'admin' from auth.users where email = '내이메일@example.com'
     on conflict (user_id) do update set role = excluded.role;
   ```
   가족은 같은 방법으로 사용자를 만들고 `'viewer'`로 등록합니다.
6. Project Settings → API에서 `Project URL`, `anon public` 키, `service_role` 키를 확인해 둡니다(service_role 키는 절대 공유하지 않기).

## 2. Vercel 배포 (한 번)

1. vercel.com → Add New → Project → GitHub `asset-portfolio-app` 가져오기.
2. **Root Directory: `portal`** 로 지정 (Framework는 Next.js 자동 인식).
3. Environment Variables (`.env.example` 참고):

   | 이름 | 값 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public 키 |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role 키 |
   | `APPS_SCRIPT_URL` | 폰 앱에 넣은 웹 앱 URL과 같음 |
   | `APPS_SCRIPT_KEY` | 폰 앱에 넣은 API 키와 같음 |
   | `CRON_SECRET` | 아무 긴 임의 문자열(예: 비밀번호 생성기로 32자) |

4. Deploy → 나온 주소(…vercel.app)로 접속 → 로그인.
5. 휴대폰: 주소를 연 뒤 브라우저 메뉴 → **홈 화면에 추가**하면 앱처럼 열립니다(아이폰도 가능).

## 3. 운영

- 화면 수정: 지금처럼 `src/page.html`을 고치면 GitHub Pages(앱)와 Vercel(웹)에 모두 반영됩니다. Vercel은 빌드할 때 `tools/build.py --portal`로 `portal/public`을 다시 만듭니다.
- 매일 시세 갱신 커밋(`web/data/market.json`)으로는 Vercel을 다시 배포하지 않습니다(`vercel.json`의 ignoreCommand). 웹 버전은 지수·환율을 GitHub Pages의 `market.json`에서 바로 읽습니다.
- 하루 1회 cron(베트남 04:17 전후)이 스냅샷을 저장해 Supabase 무료 프로젝트가 7일 비활성으로 멈추지 않게 합니다.
- 용량: 스냅샷은 최근 10개만 남깁니다(수 MB 수준, 무료 500MB 한도 안).

## 다음 단계 (2·3단계)

2. 월별흐름·배당내역·계좌잔고를 Supabase 표로 나누고, NAS `ledger_sync.py`가 시트 대신 Supabase에 직접 쓰게 바꾸기
3. 월말 잔고·환율·기타자산 입력 화면을 웹에 추가하고, 시트 수식(수익률·원금)을 서버 계산으로 옮긴 뒤 시트 은퇴

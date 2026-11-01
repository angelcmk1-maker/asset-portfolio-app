# NAS 가계부 자동 반영 (시놀로지 DS220+)

편한가계부 자동 백업을 NAS에 보관하고, 매일 그 백업으로 구글 시트(→ 폰 앱)를 갱신합니다.

```
편한가계부 앱 ─(자동 백업 .mmbak)→ 구글 드라이브 MoneyManager
        └─ Cloud Sync(내려받기 전용) → NAS /volume1/backup/MoneyManager      ← 원본 백업
                 └─ 작업 스케줄러(매일) ledger_sync.py
                        ├─ 보관: MoneyManager_archive/  (일별 60개 + 매월 첫 백업 영구 보관)
                        └─ POST → Apps Script 웹앱 → 시트 월별흐름·배당내역·계좌목록 G열 → 폰 앱
```

- 새 백업이 없으면(같은 파일 해시) 아무것도 바꾸지 않습니다.
- 받는 쪽(Apps Script)은 줄 수가 기존보다 10% 넘게 줄면 손상 백업으로 보고 반영하지 않습니다.
- 배당 종목명은 기존 배당내역에서 (일자·계좌·금액)이 같은 줄의 이름을 이어받고, 새 건은 문구에 기존 종목명이 있으면 그 이름, 없으면 `기타 배당`.
- 반영 기록은 시트의 숨김 탭 `_가계부동기화`와 NAS의 `ledger_sync.log`에 남습니다.

## 1. Apps Script 갱신 (한 번)

저장소 `apps-script/Code.gs` 최신본을 시트 Apps Script 편집기에 전체 붙여 넣기 → 저장 →
배포 → 배포 관리 → 연필 → 버전: **새 버전** → 배포 (URL은 그대로). 새로 추가된 것은 `doPost`(action=ledger_sync)와 `?action=ledger_status`입니다.

## 2. Cloud Sync로 백업 받기 (한 번)

1. 제어판 → 공유 폴더 → `backup` 공유 폴더 만들기(이미 있으면 그대로 사용).
2. 패키지 센터 → **Cloud Sync** 설치 → 열기 → `+` → **Google Drive** → angelcmk1@gmail.com 로그인.
3. 설정
   - 로컬 경로: `/backup/MoneyManager` (폴더 새로 만들기)
   - 원격 경로: `/MoneyManager`
   - 동기화 방향: **원격 변경 사항만 다운로드**
   - **원격 폴더에서 파일이 제거되어도 로컬 폴더의 파일을 제거하지 않음** 체크 (구글 드라이브에서 지워져도 NAS에 남음)
   - 고급 설정에서 `.mmbak` 외 파일은 필요 없으면 확장자 필터로 제외해도 됩니다.
4. 몇 분 뒤 File Station에서 `backup/MoneyManager`에 `MMAuto…mmbak`이 보이면 완료.

## 3. 동기화 스크립트 놓기 (한 번)

1. File Station → `backup` 안에 `ledger-sync` 폴더를 만들고 이 `nas` 폴더의 `ledger_sync.py`, `config.example.json`을 올립니다.
2. `config.example.json`을 복사해 이름을 `config.json`으로 바꾸고 (텍스트 편집기 패키지 또는 PC에서 수정 후 업로드):
   - `webapp_url`: Apps Script 웹 앱 URL (폰 앱에 넣은 것과 같음)
   - `api_key`: API 키 (폰 앱에 넣은 것과 같음)
   - 경로는 그대로 두면 됩니다.
3. `config.json`은 키가 들어 있으므로 다른 곳(대화·저장소)에 올리지 않습니다.

## 4. 작업 스케줄러 등록

제어판 → **작업 스케줄러** → 생성 → 예약된 작업 → **사용자 정의 스크립트**

| 항목 | 값 |
|---|---|
| 일반 → 사용자 | `root` (또는 backup 폴더 읽기/쓰기 권한이 있는 관리자 계정) |
| 스케줄 | 매일, 첫 실행 06:40, 반복: 12시간마다 (06:40·18:40) |
| 작업 설정 → 실행 명령 | `/usr/bin/python3 /volume1/backup/ledger-sync/ledger_sync.py` |
| 작업 설정 → 알림 | "스크립트가 비정상적으로 종료된 경우에만 실행 세부 정보 보내기" 체크 |

처음엔 실행 명령 끝에 ` --dry-run`을 붙여 한 번 **실행**해 보고, `ledger-sync/ledger_sync.log`에
`변환: … 월별흐름 8xx줄, 배당 4xx건`이 나오면 ` --dry-run`을 지웁니다. (`last_payload.json`에 변환 결과가 저장됩니다.)

### python3가 없을 때

SSH 또는 작업 스케줄러에서 `python3 --version`이 실패하면, 패키지 센터 → **Container Manager** 설치 후 실행 명령을 이렇게 바꿉니다.

```
docker run --rm -v /volume1/backup:/volume1/backup python:3.12-slim python /volume1/backup/ledger-sync/ledger_sync.py
```

## 5. 수동 실행·확인

- 지금 바로 반영: 작업 스케줄러에서 작업 선택 → **실행**
- 같은 백업을 다시 반영(또는 줄 수 감소 안전장치를 넘겨야 할 때): 명령 끝에 ` --force`를 붙여 한 번 실행
- 마지막 반영 결과: 웹 앱 URL에 `?key=…&action=ledger_status`
- 계좌를 새로 만들면 `ledger_sync.py`의 `META`와 시트 `계좌목록`에 같은 이름으로 추가합니다.

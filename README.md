# 자산 포트폴리오 앱

편한가계부·구글 시트 데이터로 자산 변동, 배당, 지수 비교, 시뮬레이션, 리포트를 보는 개인용 안드로이드 앱.

## 구조

```
폰 앱(APK, Capacitor 껍데기)
  └─ 화면: GitHub Pages  https://angelcmk1-maker.github.io/asset-portfolio-app/
        └─ 데이터: 구글 시트 Apps Script 웹앱(API 키 필요)  ← 구글 시트 '자산 포트폴리오'
```

- **이 저장소는 공개**이므로 화면 코드만 있습니다. 자산 데이터와 API 키는 저장소에 없고, 키는 폰 앱 설정에만 저장됩니다.
- 화면·기능 수정(`src/page.html`, `web/`)은 push하면 Pages로 배포되고, 앱을 다시 설치하지 않아도 다음 실행 때 반영됩니다.
- APK는 `capacitor.config.json`·아이콘 등 껍데기가 바뀔 때만 새로 빌드됩니다(Actions → 안드로이드 앱(APK) 빌드 → Run workflow 로 수동 빌드도 가능).

## 폴더

| 경로 | 내용 |
|---|---|
| `src/page.html` | 대시보드 화면(claude.ai 대시보드와 같은 코드) |
| `web/js/shim.js` | 대시보드의 `dash` API를 Apps Script 데이터로 대신하는 계층 |
| `web/js/app.js` | 설정(URL·키), 새로고침, 관심종목 편집 |
| `tools/build.py` | `src/page.html` → `web/index.html` |
| `apps-script/Code.gs` | 구글 시트에 붙이는 데이터 API |
| `android-keystore/debug.keystore` | APK 서명 키(업데이트 설치가 되도록 고정) |

## 처음 설정

1. **Apps Script**: 구글 시트 → 확장 프로그램 → Apps Script → `apps-script/Code.gs` 붙여 넣기 → `setup` 실행(로그의 API 키 복사) → 배포 → 새 배포 → 웹 앱(실행: 나, 액세스: 모든 사용자) → URL 복사. 트리거에 `refreshMarket` 하루 1회 추가.
2. **Pages**: Settings → Pages → Source: **GitHub Actions**.
3. **APK**: Releases 에서 최신 `asset-portfolio-*.apk` 를 폰으로 내려받아 설치.
4. 앱 첫 화면에서 웹 앱 URL과 API 키 입력.

#!/usr/bin/env python3
"""src/page.html(대시보드 화면)을 앱용 web/index.html 로 감싼다.

페이지 코드는 claude.ai 대시보드와 같은 것을 쓰고, `dash` API는 web/js/shim.js 가 대신한다.
사용: python3 tools/build.py
"""
import datetime
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
page = (ROOT / "src" / "page.html").read_text(encoding="utf-8")

# 구글 시트 직접 링크는 앱 안의 편집 화면으로 대체(app.js 가 버튼으로 바꿈)
page = re.sub(r'href="https://docs\.google\.com/spreadsheets/[^"]*"', 'href="#"', page)
page = page.replace("구글 시트 '관심종목' 탭에서 한 줄을 추가하면 종목이 늘고, 지우거나 '리포트 포함'을 N으로 바꾸면 빠집니다.",
                    "아래 '종목 추가·삭제'에서 종목을 넣고 빼거나 리포트 포함을 끌 수 있습니다(구글 시트 관심종목 탭에 저장).")

# claude.ai 대시보드는 <script> 마다 따로 범위를 가지므로, 앱에서도 각 스크립트를 함수로 감싸 같은 이름 충돌을 막는다
page = re.sub(r"<script>([\s\S]*?)</script>", lambda m: "<script>(function(){\n" + m.group(1) + "\n})();</script>", page)

build = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d.%H%M")

THEME = """
:root{
  --font-anthropic-sans:-apple-system,BlinkMacSystemFont,"Pretendard","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",system-ui,sans-serif;
  --font-anthropic-serif:"Noto Serif KR","Apple SD Gothic Neo",Georgia,serif;
  --color-bg:#f7f6f2;--color-panel:#ffffff;--color-fg:#1f1e1c;--color-fg-muted:#6b6862;--color-border-line:#e4e1da;
  --color-ok:#16a34a;--color-bad:#dc2626;
  --cds-border:#e4e1da;--cds-text-secondary:#6b6862;--cds-surface-popover:#ffffff;--cds-shadow-popover:0 6px 24px rgba(0,0,0,.14);
  --cds-chart-axis:#8a867f;--cds-chart-grid:#ece9e3;--cds-chart-reference:#a8a39b;--cds-chart-status-critical:#dc2626;
  --cds-font-size-caption:12px;--cds-font-size-body:14px;--cds-font-size-heading:16px;--cds-font-size-title:22px;--cds-font-weight-medium:600;
  --cds-gap-xs:4px;--cds-gap-sm:8px;--cds-gap-md:12px;--cds-gap-lg:18px;
  --cds-pad-xs:4px;--cds-pad-sm:8px;--cds-pad-md:12px;--cds-pad-lg:16px;--cds-pad-xl:24px;
  --cds-radius:14px;--cds-dur-slow:.3s;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root{
  --color-bg:#151515;--color-panel:#1f1f1e;--color-fg:#ecebe8;--color-fg-muted:#a29f99;--color-border-line:#33322f;
  --cds-border:#33322f;--cds-text-secondary:#a29f99;--cds-surface-popover:#262625;--cds-shadow-popover:0 6px 24px rgba(0,0,0,.5);
  --cds-chart-axis:#8f8b84;--cds-chart-grid:#2c2b29;--cds-chart-reference:#6f6b65;color-scheme:dark;
}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--color-bg);color:var(--color-fg);font-family:var(--font-anthropic-sans);-webkit-text-size-adjust:100%}
body{padding:calc(env(safe-area-inset-top) + 4px) 12px 0}
#dash-root{padding-bottom:8px}
.dash-skeleton{min-height:48px;border-radius:10px;background:linear-gradient(90deg,var(--color-border-line) 0%,var(--color-panel) 50%,var(--color-border-line) 100%);background-size:200% 100%;animation:sk 1.2s infinite linear;opacity:.6}
@keyframes sk{from{background-position:200% 0}to{background-position:-200% 0}}
.pf-fail{color:var(--color-bad);font-size:12px;padding:8px}
.app-bar{display:flex;align-items:center;gap:6px;justify-content:flex-end;max-width:1200px;margin:0 auto 4px}
.app-status{flex:1;font-size:11px;color:var(--color-fg-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.app-status.bad{color:var(--color-bad)}
.app-ic{font:inherit;font-size:16px;line-height:1;width:34px;height:34px;border-radius:50%;border:1px solid var(--color-border-line);background:var(--color-panel);color:var(--color-fg);cursor:pointer}
.app-ic.spin{animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.app-modal{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100;display:flex;align-items:flex-end;justify-content:center}
.app-sheet{background:var(--color-panel);color:var(--color-fg);width:100%;max-width:560px;max-height:88vh;overflow:auto;border-radius:18px 18px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:10px}
.app-sheet-head{display:flex;align-items:center;justify-content:space-between}
.app-sheet h2{font-size:17px;margin:0}.app-sheet h3{font-size:14px;margin:8px 0 0}
.app-field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--color-fg-muted);flex:1}
.app-field input,.app-field select{font:inherit;font-size:15px;padding:10px 12px;border-radius:10px;border:1px solid var(--color-border-line);background:var(--color-bg);color:var(--color-fg);width:100%}
.app-row{display:flex;gap:8px}
.app-form{display:flex;flex-direction:column;gap:8px}
.app-primary{font:inherit;font-size:14px;font-weight:600;padding:11px 14px;border-radius:12px;border:0;background:var(--color-fg);color:var(--color-bg);cursor:pointer}
.app-primary:disabled,.app-ghost:disabled{opacity:.5}
.app-ghost{font:inherit;font-size:13px;padding:9px 12px;border-radius:10px;border:1px solid var(--color-border-line);background:transparent;color:var(--color-fg);cursor:pointer}
.app-ghost.sm{padding:6px 10px;font-size:12px}.app-ghost.danger{color:var(--color-bad)}
.app-msg{font-size:12px;color:var(--color-fg-muted);margin:0;line-height:1.5}
.app-wl{display:flex;flex-direction:column;gap:6px}
.app-wl-row{display:flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid var(--color-border-line);border-radius:10px}
.app-wl-row.off{opacity:.5}
.app-wl-row .nm{flex:1;min-width:0;display:flex;flex-direction:column}
.app-wl-row small{color:var(--color-fg-muted);font-size:11px}
#card-watch .app-primary,#card-holdings>.app-primary{align-self:flex-start;margin:8px 0}
.app-hold{font:inherit;text-align:left;background:var(--color-bg);color:var(--color-fg);cursor:pointer;width:100%}
.app-chev{color:var(--color-fg-muted);font-size:20px}
.app-sheet [hidden]{display:none}
.app-diag{font-size:11px;line-height:1.6;background:var(--color-bg);border:1px solid var(--color-border-line);border-radius:10px;padding:8px 10px;word-break:break-all}
.app-diag b{font-weight:600}.app-diag .bad{color:var(--color-bad)}
.lk{position:fixed;inset:0;z-index:1000;background:var(--color-bg);display:flex;align-items:center;justify-content:center;padding:calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 16px)}
.lk-box{width:100%;max-width:340px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
.lk-box.shake{animation:lkshake .35s}
@keyframes lkshake{20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
.lk-icon{font-size:30px;width:60px;height:60px;border-radius:18px;display:flex;align-items:center;justify-content:center;background:var(--color-panel);border:1px solid var(--color-border-line)}
.lk-title{font-size:20px;margin:6px 0 0}
.lk-sub{font-size:13px;color:var(--color-fg-muted);margin:0;line-height:1.5;min-height:2.6em}
.lk-dots{display:flex;gap:12px;min-height:16px;margin:6px 0}
.lk-dots i{width:13px;height:13px;border-radius:50%;border:2px solid var(--color-fg-muted)}
.lk-dots i.on{background:var(--color-fg);border-color:var(--color-fg)}
.lk-msg{font-size:12px;color:var(--color-bad);margin:0;min-height:1.4em}
.lk-keys{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:100%;margin-top:6px}
.lk-k{font:inherit;font-size:24px;height:62px;border-radius:16px;border:1px solid var(--color-border-line);background:var(--color-panel);color:var(--color-fg);cursor:pointer;-webkit-tap-highlight-color:transparent}
.lk-k:active{background:var(--color-border-line)}
.lk-fn{font-size:15px;color:var(--color-fg-muted)}
.lk-ok{font-size:16px;font-weight:600;background:var(--color-fg);color:var(--color-bg);border-color:var(--color-fg)}
.lk-ok:disabled{opacity:.35}
.lk-link{font:inherit;font-size:12px;color:var(--color-fg-muted);background:none;border:0;text-decoration:underline;margin-top:10px;cursor:pointer;line-height:1.5}
"""

html = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1f1e1c">
<title>자산 포트폴리오</title>
<link rel="manifest" href="manifest.webmanifest">
<style>{THEME}</style>
<script>window.PF_BUILD = "{build}";</script>
<script src="vendor/d3.min.js"></script>
<script src="js/shim.js?v={build}"></script>
<script src="js/lock.js?v={build}"></script>
<script src="js/app.js?v={build}"></script>
</head>
<body>
<div id="dash-root">
{page}
</div>
</body>
</html>
"""
(ROOT / "web" / "index.html").write_text(html, encoding="utf-8")
print("web/index.html", len(html), "bytes, build", build)

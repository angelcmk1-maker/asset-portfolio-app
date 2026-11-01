#!/usr/bin/env python3
"""편한가계부 백업 → NAS 보관 → 구글 시트(월별흐름·배당내역·계좌목록 G열) 자동 반영.

시놀로지 작업 스케줄러에서 하루 한 번 실행한다(nas/README.md 참고).
표준 라이브러리만 사용(파이썬 3.8 이상). 설정은 같은 폴더의 config.json.

  python3 ledger_sync.py            # 새 백업이 있으면 보관 + 시트 반영
  python3 ledger_sync.py --dry-run  # 변환·검사만 하고 시트는 안 바꿈
  python3 ledger_sync.py --force    # 같은 백업이어도 다시 반영(줄 수 감소 안전장치도 통과)
"""
import collections, datetime, glob, hashlib, json, os, shutil, sqlite3, sys, tempfile, time, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "config.json"), encoding="utf-8"))
SRC_DIR = CFG["backup_dir"]                      # Cloud Sync가 내려받는 MoneyManager 폴더
ARCHIVE_DIR = CFG.get("archive_dir") or os.path.join(SRC_DIR, "_archive")
STATE = os.path.join(HERE, "state.json")
LOG = os.path.join(HERE, "ledger_sync.log")
KEEP_DAILY = int(CFG.get("keep_daily", 60))      # 일별 보관 개수(매월 첫 백업은 따로 계속 보관)
MIN_AGE = int(CFG.get("min_age_minutes", 10)) * 60

# 집계 대상 계좌(작업지침 3-1). 시트에는 KRW·USD 계좌만 보낸다(시트 월별흐름에는 VND 계좌 줄이 없음).
META = [
    ("미래에셋[인식]", "본인", "투자", "KRW"), ("ISA계좌[인식]", "본인", "투자", "KRW"),
    ("연금저축[인식] ETF", "본인", "연금", "KRW"), ("연금저축[인식] 펀드", "본인", "연금", "KRW"),
    ("IRP 미래에셋", "본인", "연금", "KRW"), ("DC형", "본인", "연금", "KRW"),
    ("주택청약종합저축[인식]", "본인", "저축", "KRW"), ("베트남 저축(VND)", "본인", "저축", "VND"),
    ("우리사주(현대엘리베이터)", "본인", "투자", "KRW"), ("미래에셋[이솔]", "이솔", "투자", "KRW"),
    ("주택청약종합저축[이솔]", "이솔", "저축", "KRW"), ("미래에셋[이서]", "이서", "투자", "KRW"),
    ("주택청약종합저축[이서]", "이서", "저축", "KRW"), ("미래에셋(USD)", "본인", "투자", "USD"),
]
META_BY = {m[0]: m for m in META}
ESOP = "우리사주(현대엘리베이터)"


def log(msg):
    line = "%s %s" % (datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg)
    print(line)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    try:  # 로그가 너무 커지지 않게 최근 2000줄만
        lines = open(LOG, encoding="utf-8").read().splitlines()
        if len(lines) > 2500:
            open(LOG, "w", encoding="utf-8").write("\n".join(lines[-2000:]) + "\n")
    except OSError:
        pass


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def latest_backup():
    files = [p for p in glob.glob(os.path.join(SRC_DIR, "*.mmbak")) + glob.glob(os.path.join(SRC_DIR, "*.sqlite"))
             if os.path.isfile(p)]
    now = time.time()
    ready = [p for p in files if now - os.path.getmtime(p) >= MIN_AGE]  # 아직 내려받는 중인 파일 제외
    return max(ready, key=os.path.getmtime) if ready else None


def open_db(path, tmpdir):
    """.mmbak 은 보통 SQLite 그대로지만, zip 으로 묶인 경우도 대비한다."""
    with open(path, "rb") as f:
        head = f.read(16)
    if head.startswith(b"SQLite format 3"):
        db = path
    elif head.startswith(b"PK"):
        with zipfile.ZipFile(path) as z:
            name = next((n for n in z.namelist() if not n.endswith("/")), None)
            db = z.extract(name, tmpdir)
    else:
        raise RuntimeError("SQLite 백업 형식이 아닙니다: " + os.path.basename(path))
    tmp = os.path.join(tmpdir, "mm.sqlite")  # 원본을 건드리지 않도록 복사본을 연다
    if db != tmp:
        shutil.copyfile(db, tmp)
    c = sqlite3.connect(tmp)
    c.execute("select count(*) from INOUTCOME").fetchone()
    return c


def convert(c, cutoff):
    """claude/mm2flows.py 와 같은 규칙(작업지침 3-2)."""
    uid2name = {u: n for u, n in c.execute("select uid, NIC_NAME from ASSETS")}
    cat = {u: (n, p) for u, n, p in c.execute("select uid, NAME, pUid from ZCATEGORY")}

    def catpath(u):
        if u not in cat:
            return (None, None)
        nm, p = cat[u]
        if p and p in cat and p != "0":
            return (cat[p][0], nm)
        return (nm, None)

    def d_of(ms):
        return (datetime.datetime(1970, 1, 1) + datetime.timedelta(milliseconds=int(ms), hours=7)).date()

    rows = c.execute("""select DO_TYPE, ZMONEY, AMOUNT_ACCOUNT, ZDATE, assetUid, toAssetUid, categoryUid,
      ZCONTENT, ZDATA, IS_DEL, uid, txUidTrans, ctgUid from INOUTCOME where (IS_DEL=0 or IS_DEL is null)""").fetchall()
    pair4 = {}
    for r in rows:
        if str(r[0]) == "4":
            pair4[r[11]] = r
            pair4[r[10]] = r
    flows = collections.defaultdict(lambda: [0.0, 0.0])
    divs = []

    def add(acct, d, kind, krw, native):
        k = (d.strftime("%Y-%m"), acct, kind)
        flows[k][0] += krw
        flows[k][1] += native

    for r in rows:
        dt, zm, aa, zd, au, tau, cu, content, memo = r[:9]
        t = str(dt)
        if t not in ("0", "1", "3") or zd in (None, ""):
            continue
        d = d_of(zd)
        if d.isoformat() > cutoff:
            continue
        krw = float(zm or 0)
        nat = float(aa) if aa not in (None, "") else krw
        src = uid2name.get(au)
        if t == "3":
            dst = uid2name.get(tau)
            if dst in META_BY:
                if META_BY[dst][3] == "KRW":
                    dn = krw
                else:
                    p = pair4.get(r[10]) or pair4.get(r[11])
                    dn = float(p[2]) if p and p[2] not in (None, "") else nat
                add(dst, d, "납입", krw, dn)
            if src in META_BY:
                add(src, d, "납입", -krw, -(krw if META_BY[src][3] == "KRW" else nat))
            continue
        cu = r[12] or cu
        big, small = catpath(cu)
        in_fin = cu == "5" or (cu in cat and cat[cu][1] == "5")
        text = ("%s %s" % (content or "", memo or "")).strip()
        if t == "0":
            acct = src
            isdiv = small == "배당/분배금" or big == "배당/분배금"
            if src == "KEB 하나은행" and isdiv and "현대EL" in text:
                acct = ESOP
            if acct not in META_BY:
                continue
            n = krw if META_BY[acct][3] == "KRW" else nat
            if isdiv:
                add(acct, d, "배당", krw, n)
                divs.append({"date": d.isoformat(), "owner": META_BY[acct][1], "account": acct, "text": text,
                             "krw": round(krw)})
            elif in_fin and "퇴직연금" not in (small or ""):
                add(acct, d, "이자", krw, n)
            else:
                add(acct, d, "납입", krw, n)
        elif t == "1" and src in META_BY:
            add(src, d, "납입", -krw, -(krw if META_BY[src][3] == "KRW" else nat))

    sheet_flows, balances = [], collections.defaultdict(float)
    for (mo, acct, kind), (k, n) in sorted(flows.items()):
        balances[acct] += n  # 가계부 잔액(현지 통화) = 그 계좌 모든 흐름의 합
        if META_BY[acct][3] == "VND" or round(k) == 0:
            continue
        sheet_flows.append({"month": mo, "account": acct, "kind": kind, "krw": round(k)})
    divs.sort(key=lambda x: (x["date"], x["account"], x["krw"]))
    bal = {a: round(v, 2) for a, v in balances.items() if META_BY[a][3] != "VND"}
    return sheet_flows, divs, bal


def post(payload):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(CFG["webapp_url"], data=data, headers={"Content-Type": "application/json"})
    # Apps Script 는 302 로 결과 주소를 돌려준다. urllib 이 GET 으로 따라가며 결과를 받는다.
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode("utf-8"))


def archive(src, digest):
    os.makedirs(ARCHIVE_DIR, exist_ok=True)
    day = datetime.date.today()
    dst = os.path.join(ARCHIVE_DIR, "%s_%s%s" % (day.isoformat(), digest[:8], os.path.splitext(src)[1]))
    if not os.path.exists(dst):
        shutil.copy2(src, dst)
    # 매월 첫 보관본은 'monthly'에 계속 남기고, 일별은 최근 KEEP_DAILY개만 둔다
    mdir = os.path.join(ARCHIVE_DIR, "monthly")
    os.makedirs(mdir, exist_ok=True)
    if not glob.glob(os.path.join(mdir, day.strftime("%Y-%m") + "*")):
        shutil.copy2(dst, os.path.join(mdir, os.path.basename(dst)))
    daily = sorted(p for p in glob.glob(os.path.join(ARCHIVE_DIR, "*")) if os.path.isfile(p))
    for old in daily[:-KEEP_DAILY]:
        os.remove(old)
    return dst


def main():
    dry = "--dry-run" in sys.argv
    force = "--force" in sys.argv
    src = latest_backup()
    if not src:
        log("백업 파일 없음: " + SRC_DIR)
        return 1
    digest = sha256(src)
    state = json.load(open(STATE, encoding="utf-8")) if os.path.exists(STATE) else {}
    if not force and not dry and state.get("sha256") == digest:
        log("변경 없음 (%s)" % os.path.basename(src))
        return 0
    tmpdir = tempfile.mkdtemp(prefix="mm_")
    try:
        c = open_db(src, tmpdir)
        cutoff = datetime.date.today().isoformat()
        flows, divs, bal = convert(c, cutoff)
        c.close()
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    log("변환: %s → 월별흐름 %d줄, 배당 %d건, 계좌 %d개" % (os.path.basename(src), len(flows), len(divs), len(bal)))
    if dry:
        out = os.path.join(HERE, "last_payload.json")
        json.dump({"flows": flows, "divs": divs, "balances": bal}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        log("--dry-run: 시트는 바꾸지 않음. 변환 결과 → " + out)
        return 0
    kept = archive(src, digest)
    res = post({"key": CFG["api_key"], "action": "ledger_sync", "flows": flows, "divs": divs, "balances": bal,
                "source": os.path.basename(src), "cutoff": cutoff, "force": force})
    if not res.get("ok"):
        log("시트 반영 실패: %s %s" % (res.get("error"), res.get("message", "")))
        return 2
    state.update({"sha256": digest, "file": os.path.basename(src), "archived": kept,
                  "synced_at": datetime.datetime.now().isoformat(timespec="seconds"), "result": res})
    json.dump(state, open(STATE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log("시트 반영 완료: 흐름 %s, 배당 %s(새 %s), 잔액 %s개%s" % (
        res.get("flows"), res.get("divs"), res.get("new_divs"), res.get("balances"),
        (", 시트에 없는 계좌: " + ", ".join(res["missing_accounts"])) if res.get("missing_accounts") else ""))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # 작업 스케줄러 결과 메일에 원인이 남도록
        log("오류: %r" % e)
        raise

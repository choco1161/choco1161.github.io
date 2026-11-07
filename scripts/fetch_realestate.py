"""공공데이터포털 API로 부동산 데이터를 받아 data/realestate/ 에 JSON으로 저장한다.

사용법 (GitHub Actions에서 실행, 키는 환경변수 DATA_GO_KR_KEY):
  python scripts/fetch_realestate.py check apt|silv|apply   # 키·활용신청 확인 (실패 시 exit 1)
  python scripts/fetch_realestate.py fetch                  # 수집 + 집계

연결 API (모두 공공데이터포털, 같은 서비스키)
  apt   국토교통부_아파트 매매 실거래가 자료        RTMSDataSvcAptTrade
  silv  국토교통부_아파트 분양권전매 실거래가 자료  RTMSDataSvcSilvTrade
  apply 한국부동산원_청약홈 분양정보 조회 서비스    ApplyhomeInfoDetailSvc
키 값은 어떤 파일·로그에도 남기지 않는다. 키 오류는 status.json과 페이지 상단에 표시된다.
"""
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "realestate")
SEED = os.path.join(ROOT, "data", "seed", "apt_snapshot.json")
KST = timezone(timedelta(hours=9))
NOW = datetime.now(KST)
BASE_MONTH = "202509"      # 지수 기준월 = 100
REFRESH_MONTHS = 3         # 신고기한(30일) 때문에 최근 N개월은 매일 다시 받음

RTMS = {
    "apt": "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade",
    "silv": "https://apis.data.go.kr/1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade",
}
APPLY = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/"
API_NAME = {
    "apt": "국토교통부 아파트 매매 실거래가",
    "silv": "국토교통부 아파트 분양권전매 실거래가",
    "apply": "한국부동산원 청약홈 분양정보",
}

GWANG = {
    "수도권": ["서울", "경기", "인천"],
    "부울경": ["부산", "울산", "경남"],
    "대경권": ["대구", "경북"],
    "충청권": ["대전", "세종", "충북", "충남"],
    "호남권": ["광주", "전북", "전남"],
    "강원": ["강원"],
    "제주": ["제주"],
}
SIDO2G = {s: g for g, ss in GWANG.items() for s in ss}
ADDR_SIDO = {
    "서울특별시": ["서울"], "부산광역시": ["부산"], "대구광역시": ["대구"], "인천광역시": ["인천"],
    "광주광역시": ["광주"], "대전광역시": ["대전"], "울산광역시": ["울산"], "세종특별자치시": ["세종"],
    "경기도": ["경기"], "강원특별자치도": ["강원"], "강원도": ["강원"], "충청북도": ["충북"], "충청남도": ["충남"],
    "전북특별자치도": ["전북"], "전라북도": ["전북"], "전라남도": ["전남"], "경상북도": ["경북"], "경상남도": ["경남"],
    "제주특별자치도": ["제주"], "전남광주통합특별시": ["광주", "전남"],
}


class ApiError(Exception):
    pass


# ───────────── 공통 ─────────────
def service_key():
    k = (os.environ.get("DATA_GO_KR_KEY") or "").strip()
    if not k:
        raise ApiError("GitHub Secret DATA_GO_KR_KEY가 비어 있습니다")
    if "%" in k:  # Encoding 키를 넣은 경우 Decoding 키로 되돌림
        k = urllib.parse.unquote(k)
    return k


def http_get(url, tries=4):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "derek-platform-data/1.0"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            body = e.read()
            if e.code in (401, 403) or i == tries - 1:
                return e.code, body
            last = e
        except Exception as e:  # 네트워크 오류는 재시도
            last = e
        time.sleep(1.5 * (i + 1))
    raise ApiError(f"네트워크 오류: {type(last).__name__}")


def months_window():
    out, y, m = [], int(BASE_MONTH[:4]), int(BASE_MONTH[4:])
    while (y, m) <= (NOW.year, NOW.month):
        out.append(f"{y}{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def load_regions():
    with open(SEED, encoding="utf-8") as f:
        snap = json.load(f)
    regs = [{"code": r[0], "name": r[1], "sido": r[2], "w": r[4]} for r in snap["r"]]
    return regs, snap


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def read_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


# ───────────── 실거래 (apt, silv) ─────────────
def _t(item, *names):
    for n in names:
        el = item.find(n)
        if el is not None and el.text is not None:
            return el.text.strip()
    return ""


def rtms_page(api, lawd, ym, page):
    q = urllib.parse.urlencode({"LAWD_CD": lawd, "DEAL_YMD": ym, "pageNo": page, "numOfRows": 1000})
    url = f"{RTMS[api]}?serviceKey={urllib.parse.quote(service_key(), safe='')}&{q}"
    code, body = http_get(url)
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        raise ApiError(f"HTTP {code}, XML 아님: {body[:120].decode('utf-8', 'replace')}")
    rc = _t(root, "header/resultCode", "cmmMsgHeader/returnReasonCode")
    if rc not in ("000", "00"):
        msg = _t(root, "header/resultMsg", "cmmMsgHeader/returnAuthMsg", "cmmMsgHeader/errMsg")
        raise ApiError(f"{rc} {msg}".strip())
    items = root.findall("body/items/item")
    total = int(_t(root, "body/totalCount") or 0)
    return items, total


def rtms_month(api, lawd, ym):
    """한 시군구·한 달 → [거래수, ㎡당 중위가(만원), 해제건수]"""
    items, total, page = [], None, 1
    while True:
        its, total = rtms_page(api, lawd, ym, page)
        items += its
        if len(items) >= total or not its:
            break
        page += 1
    ppm, cancel = [], 0
    for it in items:
        if _t(it, "cdealType", "해제여부") == "O":
            cancel += 1
            continue
        try:
            amt = float(_t(it, "dealAmount", "거래금액").replace(",", ""))
            area = float(_t(it, "excluUseAr", "전용면적"))
        except ValueError:
            continue
        if area > 0:
            ppm.append(amt / area)
    return [len(ppm), round(statistics.median(ppm), 1) if ppm else None, cancel]


def fetch_rtms(api, regions, status):
    months = months_window()
    recent = set(months[-REFRESH_MONTHS:])
    seed = None
    if api == "apt":
        _, snap = load_regions()
        seed = {m: i for i, m in enumerate(snap["m"])}
        partial = set(snap.get("partial", []))
    todo = []
    for ym in months:
        path = os.path.join(OUT, api, f"{ym}.json")
        have = read_json(path)
        if have and ym not in recent:
            continue
        if not have and api == "apt" and ym in seed and ym not in recent and ym not in partial:
            # 같은 API로 10/20에 받아둔 값으로 채움 (호출 절약)
            i = seed[ym]
            d = {}
            for r in snap["r"]:
                n, _, p = r[3].split(";")[i].partition(",")
                d[r[0]] = [int(n) if n else 0, float(p) if p else None, None]
            write_json(path, {"m": ym, "src": "snapshot 2026.10.20", "d": d})
            continue
        todo.append(ym)
    calls = 0
    for ym in todo:
        errs = []

        def one(r):
            try:
                return r["code"], rtms_month(api, r["code"], ym)
            except ApiError as e:
                errs.append(f"{r['code']} {e}")
                return r["code"], None
        with ThreadPoolExecutor(max_workers=8) as ex:
            res = dict(ex.map(one, regions))
        calls += len(regions)
        if len(errs) > len(regions) * 0.2:
            raise ApiError(f"{ym} 호출 {len(errs)}건 실패 (예: {errs[0]})")
        old = (read_json(os.path.join(OUT, api, f"{ym}.json")) or {}).get("d", {})
        res = {k: (v if v is not None else old.get(k)) for k, v in res.items()}
        write_json(os.path.join(OUT, api, f"{ym}.json"),
                   {"m": ym, "src": "api " + NOW.strftime("%Y-%m-%d %H:%M"), "d": res})
        print(f"  {api} {ym}: {sum(v[0] for v in res.values() if v):,}건", flush=True)
    status[api]["msg"] += f" · 이번 실행 {len(todo)}개월({calls:,}회 호출) 갱신"


# ───────────── 청약홈 (apply) ─────────────
def odcloud(op, params):
    q = {"page": 1, "perPage": 500, "returnType": "JSON", **params}
    url = f"{APPLY}{op}?serviceKey={urllib.parse.quote(service_key(), safe='')}&{urllib.parse.urlencode(q)}"
    code, body = http_get(url)
    try:
        js = json.loads(body)
    except ValueError:
        raise ApiError(f"HTTP {code}: {body[:120].decode('utf-8', 'replace')}")
    if code != 200 or "data" not in js:
        raise ApiError(f"HTTP {code} {js.get('code', '')} {js.get('msg', '')}".strip())
    return js["data"]


def match_region(addr, regions):
    w = addr.split()
    if len(w) < 2:
        return None
    sidos = ADDR_SIDO.get(w[0], [])
    t1 = w[1]
    t2 = w[2] if len(w) > 2 and w[2].endswith("구") else ""
    s1 = t1
    for suf in ("특례시", "시", "군"):
        if s1.endswith(suf) and len(s1) > len(suf):
            s1 = s1[: -len(suf)]
            break
    cands = [s1 + t2[:-1]] if t2 else []
    cands += [t1, s1, t1[:-1] if t1.endswith("구") else t1]
    for c in cands:
        for r in regions:
            if r["name"] == c and (not sidos or r["sido"] in sidos):
                return r
    return None


def fetch_apply(regions, status):
    since = (NOW - timedelta(days=100)).strftime("%Y-%m-%d")
    rows = odcloud("getAPTLttotPblancDetail", {"cond[RCRIT_PBLANC_DE::GTE]": since})

    def models(no):
        try:
            return no, odcloud("getAPTLttotPblancMdl", {"cond[HOUSE_MANAGE_NO::EQ]": no})
        except ApiError:
            return no, []
    with ThreadPoolExecutor(max_workers=6) as ex:
        mdl = dict(ex.map(models, {str(r.get("HOUSE_MANAGE_NO")) for r in rows}))

    out = []
    for r in rows:
        addr = r.get("HSSPLY_ADRES") or ""
        reg = match_region(addr, regions)
        sido = reg["sido"] if reg else (ADDR_SIDO.get(addr.split()[0], [None])[0] if addr else None)
        sido = sido or (r.get("SUBSCRPT_AREA_CODE_NM") or "")[:2]
        types = []
        for m in mdl.get(str(r.get("HOUSE_MANAGE_NO")), []):
            try:
                types.append([str(m.get("HOUSE_TY", "")).strip(), float(m.get("SUPLY_AR") or 0),
                              int(m.get("SUPLY_HSHLDCO") or 0), int(m.get("SPSPLY_HSHLDCO") or 0),
                              int(str(m.get("LTTOT_TOP_AMOUNT") or "0").replace(",", "") or 0)])
            except ValueError:
                pass
        dtl = str(r.get("HOUSE_DTL_SECD_NM") or r.get("HOUSE_DTL_SECD") or "")
        out.append({
            "no": str(r.get("HOUSE_MANAGE_NO")), "name": r.get("HOUSE_NM"), "addr": addr,
            "sido": sido, "g": SIDO2G.get(sido), "code": reg["code"] if reg else None,
            "kind": "국민" if ("국민" in dtl or dtl == "03") else "민영",
            "tot": int(r.get("TOT_SUPLY_HSHLDCO") or 0), "pub": r.get("RCRIT_PBLANC_DE"),
            "a0": r.get("RCEPT_BGNDE"), "a1": r.get("RCEPT_ENDDE"), "win": r.get("PRZWNER_PRESNATN_DE"),
            "move": r.get("MVN_PREARNGE_YM"), "builder": r.get("CNSTRCT_ENTRPS_NM"),
            "url": r.get("PBLANC_URL"), "types": types,
        })
    out.sort(key=lambda x: x["a0"] or "", reverse=True)
    write_json(os.path.join(OUT, "apply.json"),
               {"asof": NOW.strftime("%Y-%m-%d %H:%M"), "since": since, "rows": out})
    status["apply"]["msg"] += f" · 공고 {len(out)}건 (공고일 {since} 이후)"


# ───────────── 집계: 광역권 지수 ─────────────
def build_index(regions):
    months = months_window()
    for r in regions:
        r["g"] = SIDO2G.get(r["sido"])
    series = {}
    for api in ("apt", "silv"):
        per = {}
        for ym in months:
            f = read_json(os.path.join(OUT, api, f"{ym}.json"))
            if f:
                per[ym] = f["d"]
        series[api] = per
    apt = series["apt"]
    base = apt.get(BASE_MONTH, {})

    def idx(members):
        line, cnt = [], []
        for ym in months:
            d = apt.get(ym)
            if not d:
                line.append(None); cnt.append(None); continue
            num = den = 0.0
            n_all = 0
            for r in members:
                b, v = base.get(r["code"]), d.get(r["code"])
                if v:
                    n_all += v[0]
                if not b or not v or not b[1] or not v[1] or b[0] < 5 or v[0] < 5:
                    continue
                num += r["w"] * v[1] / b[1]
                den += r["w"]
            line.append(round(100 * num / den, 2) if den else None)
            cnt.append(n_all)
        return line, cnt

    groups = {"전국": regions}
    for g, ss in GWANG.items():
        groups[g] = [r for r in regions if r["sido"] in ss]
    for s in sorted({r["sido"] for r in regions}):
        groups["시도:" + s] = [r for r in regions if r["sido"] == s]
    idxs = {}
    for k, mem in groups.items():
        line, cnt = idx(mem)
        idxs[k] = {"i": line, "n": cnt}

    def col(api, r):
        return [(series[api].get(ym) or {}).get(r["code"]) for ym in months]
    regs_out = [{"c": r["code"], "nm": r["name"], "s": r["sido"], "g": r["g"], "w": r["w"],
                 "apt": [v[:2] if v else None for v in col("apt", r)],
                 "silv": [v[:2] if v else None for v in col("silv", r)]} for r in regions]
    write_json(os.path.join(OUT, "index.json"), {
        "asof": NOW.strftime("%Y-%m-%d %H:%M"), "base": BASE_MONTH, "m": months,
        "recent": months[-2:], "gwang": list(GWANG), "idx": idxs, "regions": regs_out})


# ───────────── 실행 ─────────────
def check(api, regions):
    ym = (NOW.replace(day=1) - timedelta(days=1)).strftime("%Y%m")
    if api in RTMS:
        items, total = rtms_page(api, "11680", ym, 1)  # 서울 강남구 지난달
        return f"정상 · 강남구 {ym[:4]}.{ym[4:]} {total:,}건 응답"
    rows = odcloud("getAPTLttotPblancDetail", {"perPage": 1})
    return f"정상 · 공고 응답 {len(rows)}건"


def main():
    regions, _ = load_regions()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "fetch"
    if cmd == "check":
        api = sys.argv[2]
        try:
            print(f"[{API_NAME[api]}] {check(api, regions)}")
        except ApiError as e:
            print(f"::error::[{API_NAME[api]}] 실패: {e}")
            sys.exit(1)
        return

    status = {}
    for api in ("apt", "silv", "apply"):
        try:
            status[api] = {"name": API_NAME[api], "ok": True, "msg": check(api, regions)}
        except ApiError as e:
            status[api] = {"name": API_NAME[api], "ok": False, "msg": f"실패: {e}"}
    for api in ("apt", "silv"):
        if status[api]["ok"]:
            try:
                fetch_rtms(api, regions, status)
            except ApiError as e:
                status[api].update(ok=False, msg=f"수집 중 실패: {e}")
    if status["apply"]["ok"]:
        try:
            fetch_apply(regions, status)
        except ApiError as e:
            status["apply"].update(ok=False, msg=f"수집 중 실패: {e}")
    build_index(regions)
    write_json(os.path.join(OUT, "status.json"),
               {"checked": NOW.strftime("%Y-%m-%d %H:%M KST"), "apis": status})
    for v in status.values():
        print(("OK  " if v["ok"] else "ERR ") + v["name"] + " — " + v["msg"])
    if not any(v["ok"] for v in status.values()):
        sys.exit(1)


if __name__ == "__main__":
    main()

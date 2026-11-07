"""부동산 데이터를 받아 data/realestate/ 에 JSON으로 저장한다 (GitHub Actions에서 매일 실행).

  python scripts/fetch_realestate.py check kb|apply|apt|silv   # 소스별 연결 확인 (실패 시 exit 1)
  python scripts/fetch_realestate.py fetch                     # 수집 + 집계

소스 (인수인계 문서 2026-11-07 [3] 기준)
  kb    KB부동산 데이터허브 주택가격동향조사 (매수우위·가격지수)    키 불필요
  apply 청약홈 APT 분양정보 목록·상세 화면                          키 불필요
  apt   국토교통부 아파트 매매 실거래가 (공공데이터포털)            DATA_GO_KR_KEY
  silv  국토교통부 아파트 분양권전매 실거래가 (공공데이터포털)      DATA_GO_KR_KEY
실거래 API는 병렬 호출 시 429가 나므로 순차 호출 + 지연 + 백오프로 부른다.
키 값은 어떤 파일·로그에도 남기지 않는다. 오류는 status.json과 페이지 상단에 표시된다.
"""
import html
import json
import os
import random
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from http.cookiejar import CookieJar

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "realestate")
SEED = os.path.join(ROOT, "data", "seed", "apt_snapshot.json")
KST = timezone(timedelta(hours=9))
NOW = datetime.now(KST)
BASE_MONTH = "202509"      # 실거래 지수 기준월 = 100 (페이지 표시도 이 값을 따름)
REFRESH_MONTHS = 3         # 신고기한(30일)·해제 신고 때문에 최근 N개월은 매일 다시 받음
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

NAME = {
    "kb": "KB부동산 매수우위·가격지수",
    "apply": "청약홈 분양정보",
    "apt": "국토교통부 아파트 매매 실거래가",
    "silv": "국토교통부 분양권전매 실거래가",
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
_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))


def http(url, data=None, headers=None, tries=5, timeout=40):
    """(status, bytes). 429·5xx·네트워크 오류는 지수 백오프로 재시도."""
    h = {"User-Agent": UA, **(headers or {})}
    body = urllib.parse.urlencode(data).encode() if isinstance(data, dict) else data
    last = None
    for i in range(tries):
        try:
            with _opener.open(urllib.request.Request(url, data=body, headers=h), timeout=timeout) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code not in (429, 500, 502, 503, 504) or i == tries - 1:
                return e.code, e.read()
        except Exception as e:
            last = e
        time.sleep(min(30, 1.5 * 2 ** i) + random.random())
    raise ApiError(f"네트워크 오류: {type(last).__name__}")


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


def ym_add(ym, k):
    y, m = int(ym[:4]), int(ym[4:]) + k
    y += (m - 1) // 12
    return f"{y}{(m - 1) % 12 + 1:02d}"


def months_between(a, b):
    out = [a]
    while out[-1] < b:
        out.append(ym_add(out[-1], 1))
    return out


def load_regions():
    snap = read_json(SEED)
    return [{"code": r[0], "name": r[1], "sido": r[2], "w": r[4]} for r in snap["r"]], snap


# ───────────── KB 데이터허브 ─────────────
KB = "https://data-api.kbland.kr/bfmstat/weekMnthlyHuseTrnd/"
KB_SUB = {"부산": "2600000000", "경기": "4100000000"}   # 하위 구·군/시 가격지수


def kb_get(op, params):
    url = KB + op + "?" + urllib.parse.urlencode(params)
    code, body = http(url, headers={"Origin": "https://data.kbland.kr", "Referer": "https://data.kbland.kr/kbstats/wmh"})
    try:
        js = json.loads(body)
    except ValueError:
        raise ApiError(f"HTTP {code}: JSON 아님")
    if js.get("dataHeader", {}).get("resultCode") != "10000":
        raise ApiError(f"HTTP {code} {js.get('dataHeader')}")
    return js["dataBody"]["data"]


def kb_price(region_code=""):
    d = kb_get("priceIndex", {"기간": "99", "매매전세코드": "01", "매물종별구분": "01", "월간주간구분코드": "01",
                              "지역코드": region_code, "조회시작일자": "", "조회종료일자": "", "type": "false", "메뉴코드": "1"})
    dates = d["날짜리스트"]
    return {r["지역명"]: dict(zip(dates, [round(v, 2) if v else None for v in r["dataList"][: len(dates)]]))
            for r in d["데이터리스트"]}, d.get("업데이트일자")


def fetch_kb(status):
    d = kb_get("maktTrnd", {"title": "매수우위지수", "메뉴코드": "01", "월간주간구분코드": "01", "기간": "99"})
    bs, ratio = {}, {}
    for r in d["데이터리스트"]:
        rows = {x["기준날짜"]: x for x in r["dataList"]}
        bs[r["지역명"]] = {k: (round(v["매수우위지수"], 1) if v.get("매수우위지수") else None) for k, v in rows.items()}
        last = r["dataList"][-1]
        ratio[r["지역명"]] = [round(last.get("매수자많음") or 0, 1), round(last.get("비슷함") or 0, 1), round(last.get("매도자많음") or 0, 1)]
    time.sleep(1)
    px, upd = kb_price()
    sub = {}
    for sido, code in KB_SUB.items():
        time.sleep(1)
        sub[sido], _ = kb_price(code)
    last = max(m for v in bs.values() for m in v)
    months = months_between("200001", last)

    def arr(series):
        return [series.get(m) for m in months]
    write_json(os.path.join(OUT, "kb.json"), {
        "asof": NOW.strftime("%Y-%m-%d %H:%M"), "updated": upd or d.get("업데이트일자"), "m0": months[0], "m": len(months),
        "bs": {k: arr(v) for k, v in bs.items()}, "ratio": ratio, "ratio_m": last,
        "px": {k: arr(v) for k, v in px.items()},
        "sub": {s: {k: arr(v) for k, v in reg.items()} for s, reg in sub.items()},
    })
    status["kb"]["msg"] += f" · {len(bs)}개 지역 매수우위 {months[0][:4]}.{months[0][4:]}~{last[:4]}.{last[4:]}, KB 업데이트 {upd or '–'}"


# ───────────── 청약홈 (화면 수집) ─────────────
AH = "https://www.applyhome.co.kr/ai/aia/"
AH_LIST = AH + "selectAPTLttotPblancListView.do"
AH_DETAIL = AH + "selectAPTLttotPblancDetail.do"


class _ListParser(HTMLParser):
    """목록 표의 tr[data-pbno] → 셀 텍스트."""
    def __init__(self):
        super().__init__()
        self.rows, self.cur, self.cell = [], None, None

    def handle_starttag(self, tag, a):
        a = dict(a)
        if tag == "tr" and "data-pbno" in a:
            self.cur = {"no": a["data-pbno"], "name": html.unescape(a.get("data-honm", "")), "td": []}
        elif tag == "td" and self.cur is not None:
            self.cell = []

    def handle_endtag(self, tag):
        if tag == "td" and self.cur is not None and self.cell is not None:
            self.cur["td"].append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.cur is not None:
            self.rows.append(self.cur)
            self.cur = None

    def handle_data(self, s):
        if self.cell is not None:
            self.cell.append(s)


def _tokens(page):
    page = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", page)
    return [t for t in (" ".join(html.unescape(x).split()) for x in re.split(r"<[^>]+>", page)) if t]


def _after(tk, label, pat=None):
    for i, t in enumerate(tk):
        if t.strip() == label:
            for nxt in tk[i + 1: i + 8]:
                if pat is None or re.search(pat, nxt):
                    return nxt
    return ""


DATE = r"\d{4}-\d{2}-\d{2}"
TY = re.compile(r"^\d{2,3}\.\d{2,4}[A-Z]*$")


def ah_detail(no):
    code, body = http(AH_DETAIL, {"houseManageNo": no, "pblancNo": no, "gvPgmId": "AIA01M01"}, headers={"Referer": AH_LIST})
    if code != 200:
        raise ApiError(f"상세 HTTP {code}")
    tk = _tokens(body.decode("utf-8", "replace"))
    addr = _after(tk, "공급위치")
    m = re.search(r"([\d,]+)\s*세대", _after(tk, "공급규모"))
    tot = int(m.group(1).replace(",", "")) if m else 0
    sp = re.search(DATE, _after(tk, "특별공급", DATE) or "")
    r1 = re.search(DATE, _after(tk, "1순위", DATE) or "")
    win = re.search(DATE, _after(tk, "당첨자 발표일", DATE) or "")
    ct = re.findall(DATE, _after(tk, "계약일", DATE) or "")
    mv = re.search(r"입주예정월\s*:\s*(\d{4})\.(\d{1,2})", " ".join(tk))
    # 공급대상 표: 주택형, 공급면적, 일반, 특별, 계 / 공급금액 표: 주택형, 최고가
    try:
        i0 = tk.index("공급대상")
    except ValueError:
        i0 = 0
    i1 = next((i for i, t in enumerate(tk) if t == "특별공급 공급대상"), len(tk))
    i2 = next((i for i, t in enumerate(tk) if t.startswith("공급금액(최고가")), len(tk))
    types, j = {}, i0
    while j < i1:
        if TY.match(tk[j]) and j + 4 < len(tk):
            try:
                types[tk[j]] = [tk[j], float(tk[j + 1]), int(tk[j + 2].replace(",", "")), int(tk[j + 3].replace(",", "")), 0]
                j += 5
                continue
            except ValueError:
                pass
        j += 1
    for j in range(i2, len(tk) - 1):
        if TY.match(tk[j]) and re.fullmatch(r"[\d,]+", tk[j + 1]):
            types.setdefault(tk[j], [tk[j], 0.0, 0, 0, 0])[4] = int(tk[j + 1].replace(",", ""))
    builder = ""
    if "시공사" in tk:
        k = tk.index("시공사")
        vals = [t for t in tk[k + 1: k + 8] if t not in ("사업주체 전화번호",) and not re.fullmatch(r"[\d-]+", t)]
        builder = vals[1] if len(vals) > 1 else (vals[0] if vals else "")
    return {"addr": addr, "tot": tot, "sp": sp.group(0) if sp else None, "r1": r1.group(0) if r1 else None,
            "win": win.group(0) if win else None, "ct": ct, "move": f"{mv.group(1)}{int(mv.group(2)):02d}" if mv else None,
            "builder": builder, "types": list(types.values())}


def match_region(addr, regions):
    w = (addr or "").split()
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
    cands = ([s1 + t2[:-1], t2[:-1]] if t2 else []) + [t1, s1, t1[:-1] if t1.endswith("구") else t1]
    if t1.endswith("군"):
        cands.append(t1[:-1] + "구")   # 코드표에 '울주구'처럼 적힌 경우
    for c in cands:
        for r in regions:
            if r["name"] == c and (not sidos or r["sido"] in sidos):
                return r
    one = [r for r in regions if r["sido"] in sidos]
    return one[0] if len(one) == 1 else None   # 세종처럼 시도 = 시군구 하나


def fetch_apply(regions, status):
    http(AH_LIST)  # 세션 쿠키
    begin = ym_add(NOW.strftime("%Y%m"), -11)   # 직전 12개월 (청약홈 기본 조회 범위)
    end = NOW.strftime("%Y%m")
    rows, seen = [], set()
    for page in range(1, 80):
        code, body = http(AH_LIST, {"beginPd": begin, "endPd": end, "houseDetailSecd": "", "suplyAreaCode": "",
                                    "houseNm": "", "chk0": "", "pageIndex": page}, headers={"Referer": AH_LIST})
        if code != 200:
            raise ApiError(f"목록 HTTP {code}")
        p = _ListParser()
        p.feed(body.decode("utf-8", "replace"))
        new = [r for r in p.rows if r["no"] not in seen]
        if not new:
            break
        for r in new:
            seen.add(r["no"])
        rows += new
        time.sleep(0.12)
    old = {r["no"]: r for r in (read_json(os.path.join(OUT, "apply.json"), {}) or {}).get("rows", [])}
    out, fresh, errs = [], 0, 0
    for r in rows:
        td = r["td"] + [""] * 10
        # 열: 지역, 주택구분, 분양/임대, 단지명, 시공사, 문의처, 공고일, 청약기간, 당첨자발표
        period = re.findall(DATE, td[7])
        base = {"no": r["no"], "name": r["name"] or td[3], "reg": td[0], "kind": td[1], "supply": td[2],
                "pub": (re.findall(DATE, td[6]) or [None])[0], "a0": period[0] if period else None,
                "a1": period[-1] if period else None}
        prev = old.get(r["no"])
        if prev and prev.get("types") and prev.get("a0") == base["a0"]:
            det = {k: prev.get(k) for k in ("addr", "tot", "sp", "r1", "win", "ct", "move", "builder", "types")}
        else:
            try:
                det = ah_detail(r["no"])
                fresh += 1
            except ApiError:
                errs += 1
                det = {k: (prev or {}).get(k) for k in ("addr", "tot", "sp", "r1", "win", "ct", "move", "builder", "types")}
            time.sleep(0.15)
        x = {**base, **det}
        reg = match_region(x.get("addr"), regions)
        sido = reg["sido"] if reg else (ADDR_SIDO.get((x.get("addr") or " ").split()[0], [None])[0] or td[0][:2])
        x.update(sido=sido, g=SIDO2G.get(sido), code=reg["code"] if reg else None, win=x.get("win") or td[8][:10] or None)
        out.append(x)
    if rows and errs > len(rows) * 0.3:
        raise ApiError(f"상세 {errs}/{len(rows)}건 실패")
    out.sort(key=lambda x: x.get("a0") or "", reverse=True)
    write_json(os.path.join(OUT, "apply.json"), {"asof": NOW.strftime("%Y-%m-%d %H:%M"), "since": f"{begin[:4]}-{begin[4:]}",
                                                 "rows": out})
    status["apply"]["msg"] += f" · 공고 {len(out)}건 ({begin[:4]}.{begin[4:]}~), 새 상세 {fresh}건, 상세 오류 {errs}건"


# ───────────── 실거래 (apt, silv) ─────────────
RTMS = {
    "apt": "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade",
    "silv": "https://apis.data.go.kr/1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade",
}


def service_key():
    k = (os.environ.get("DATA_GO_KR_KEY") or "").strip()
    if not k:
        raise ApiError("GitHub Secret DATA_GO_KR_KEY가 비어 있습니다")
    k = k.strip("'\"` ")
    if k.lower().startswith("servicekey="):
        k = k[len("servicekey="):]
    k = "".join(k.split())
    if "%" in k:  # Encoding 키 → Decoding 키
        k = urllib.parse.unquote(k)
    return k


def key_shape():
    """키 값은 드러내지 않고 길이·형식만 (오류 원인 확인용)."""
    k = service_key()
    if all(c in "0123456789abcdefABCDEF" for c in k):
        kind = "16진수"
    elif all(c.isalnum() or c in "+/=" for c in k):
        kind = "Base64"
    else:
        kind = "기타 문자 포함"
    return f"키 {len(k)}자·{kind}"


def _t(item, *names):
    for n in names:
        el = item.find(n)
        if el is not None and el.text is not None:
            return el.text.strip()
    return ""


def rtms_page(api, lawd, ym, page):
    q = urllib.parse.urlencode({"LAWD_CD": lawd, "DEAL_YMD": ym, "pageNo": page, "numOfRows": 1000})
    url = f"{RTMS[api]}?serviceKey={urllib.parse.quote(service_key(), safe='')}&{q}"
    for attempt in range(6):
        code, body = http(url)
        try:
            root = ET.fromstring(body)
        except ET.ParseError:
            raise ApiError(f"HTTP {code}, XML 아님: {body[:100].decode('utf-8', 'replace')}")
        rc = _t(root, "header/resultCode", "cmmMsgHeader/returnReasonCode")
        if rc in ("000", "00"):
            return root.findall("body/items/item"), int(_t(root, "body/totalCount") or 0)
        msg = _t(root, "header/resultMsg", "cmmMsgHeader/returnAuthMsg", "cmmMsgHeader/errMsg")
        if rc == "23":  # 초당 요청 제한 → 쉬었다가 다시
            time.sleep(2 * (attempt + 1))
            continue
        raise ApiError(f"{rc} {msg}".strip())
    raise ApiError("23 초당 요청 제한이 계속됨")


def rtms_month(api, lawd, ym):
    """한 시군구·한 달 → [거래수, ㎡당 중위가(만원), 해제건수]"""
    items, page = [], 1
    while True:
        its, total = rtms_page(api, lawd, ym, page)
        items += its
        if len(items) >= total or not its:
            break
        page += 1
        time.sleep(0.15)
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


def seed_apt(snap):
    """10/20에 같은 API로 받아둔 시군구 월별 값(확정된 달만)으로 빈 달을 채운다. 키가 없어도 지수가 보이게."""
    partial = set(snap.get("partial", []))
    for i, ym in enumerate(snap["m"]):
        path = os.path.join(OUT, "apt", f"{ym}.json")
        if ym in partial or read_json(path):
            continue
        d = {}
        for r in snap["r"]:
            n, _, p = r[3].split(";")[i].partition(",")
            d[r[0]] = [int(n) if n else 0, float(p) if p else None, None]
        write_json(path, {"m": ym, "src": "snapshot 2026.10.20", "d": d})


def fetch_rtms(api, regions, snap, status):
    months = months_between(BASE_MONTH, NOW.strftime("%Y%m"))
    recent = set(months[-REFRESH_MONTHS:])
    todo = []
    for ym in months:
        path = os.path.join(OUT, api, f"{ym}.json")
        if read_json(path) and ym not in recent:
            continue   # 이미 받은(또는 스냅샷으로 채운) 확정 달은 다시 부르지 않음
        todo.append(ym)
    calls = 0
    for ym in todo:
        path = os.path.join(OUT, api, f"{ym}.json")
        old = (read_json(path) or {}).get("d", {})
        res, errs = {}, []
        for r in regions:   # 순차 호출 (병렬 시 429)
            try:
                res[r["code"]] = rtms_month(api, r["code"], ym)
            except ApiError as e:
                errs.append(f"{r['code']} {e}")
                res[r["code"]] = old.get(r["code"])
                if len(errs) >= 5 and len(errs) == len(res):   # 처음부터 연속 실패 → 키/한도 문제
                    raise ApiError(f"{ym} 연속 실패: {errs[0]}")
            calls += 1
            time.sleep(0.13 + random.random() * 0.1)
        if len(errs) > len(regions) * 0.2:
            raise ApiError(f"{ym} 호출 {len(errs)}건 실패 (예: {errs[0]})")
        write_json(path, {"m": ym, "src": "api " + NOW.strftime("%Y-%m-%d %H:%M"), "d": res})
        print(f"  {api} {ym}: {sum(v[0] for v in res.values() if v):,}건", flush=True)
    status[api]["msg"] += f" · 이번 실행 {len(todo)}개월({calls:,}회 호출)"


def build_index(regions):
    """시군구 ㎡당 중위가 → 기준월 대비 비율 → 평소 거래량 가중 평균 (거래 5건 미만 제외)."""
    months = months_between(BASE_MONTH, NOW.strftime("%Y%m"))
    for r in regions:
        r["g"] = SIDO2G.get(r["sido"])
    series = {api: {ym: (read_json(os.path.join(OUT, api, f"{ym}.json")) or {}).get("d") for ym in months}
              for api in ("apt", "silv")}
    apt, base = series["apt"], series["apt"].get(BASE_MONTH) or {}

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
        return {"i": line, "n": cnt}

    groups = {"전국": regions, **{g: [r for r in regions if r["sido"] in ss] for g, ss in GWANG.items()}}
    groups.update({"시도:" + s: [r for r in regions if r["sido"] == s] for s in sorted({r["sido"] for r in regions})})

    def col(api, r):
        return [((series[api].get(ym) or {}).get(r["code"]) or [None, None])[:2] if (series[api].get(ym) or {}).get(r["code"]) else None
                for ym in months]
    write_json(os.path.join(OUT, "index.json"), {
        "asof": NOW.strftime("%Y-%m-%d %H:%M"), "base": BASE_MONTH, "m": months, "recent": months[-2:],
        "gwang": list(GWANG), "idx": {k: idx(v) for k, v in groups.items()},
        "regions": [{"c": r["code"], "nm": r["name"], "s": r["sido"], "g": r["g"], "w": r["w"],
                     "apt": col("apt", r), "silv": col("silv", r)} for r in regions]})


# ───────────── 실행 ─────────────
def check(src):
    if src == "kb":
        d = kb_get("maktTrnd", {"title": "확인", "메뉴코드": "01", "월간주간구분코드": "01", "기간": "0"})
        x = d["데이터리스트"][0]
        return f"정상 · {x['지역명']} {x['dataList'][-1]['기준날짜']} 매수우위 {x['dataList'][-1]['매수우위지수']:.1f}"
    if src == "apply":
        code, body = http(AH_LIST)
        n = body.decode("utf-8", "replace").count("data-pbno")
        if code != 200 or not n:
            raise ApiError(f"목록 HTTP {code}, 공고 {n}건")
        return f"정상 · 첫 화면 공고 {n}건"
    ym = ym_add(NOW.strftime("%Y%m"), -1)
    _, total = rtms_page(src, "11680", ym, 1)
    return f"정상 · 강남구 {ym[:4]}.{ym[4:]} {total:,}건"


def main():
    regions, snap = load_regions()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "fetch"
    if cmd == "check":
        src = sys.argv[2]
        try:
            print(f"[{NAME[src]}] {check(src)}")
        except ApiError as e:
            shape = ""
            if src in RTMS:
                try:
                    shape = f" ({key_shape()})"
                except ApiError:
                    pass
            print(f"::error::[{NAME[src]}] 실패: {e}{shape}")
            sys.exit(1)
        return

    status = {}
    for src in ("kb", "apply", "apt", "silv"):
        try:
            status[src] = {"name": NAME[src], "ok": True, "msg": check(src)}
        except ApiError as e:
            status[src] = {"name": NAME[src], "ok": False, "msg": f"실패: {e}"}
    jobs = [("kb", lambda: fetch_kb(status)), ("apply", lambda: fetch_apply(regions, status)),
            ("apt", lambda: fetch_rtms("apt", regions, snap, status)), ("silv", lambda: fetch_rtms("silv", regions, snap, status))]
    for src, fn in jobs:
        if status[src]["ok"]:
            try:
                fn()
            except ApiError as e:
                status[src].update(ok=False, msg=f"수집 중 실패: {e}")
            except Exception as e:  # 화면 구조 변경 등 예상 못한 오류도 다른 소스는 계속
                status[src].update(ok=False, msg=f"수집 중 오류: {type(e).__name__}: {e}")
    seed_apt(snap)
    build_index(regions)
    write_json(os.path.join(OUT, "status.json"), {"checked": NOW.strftime("%Y-%m-%d %H:%M KST"), "apis": status})
    for v in status.values():
        print(("OK  " if v["ok"] else "ERR ") + v["name"] + " — " + v["msg"])
    if not any(v["ok"] for v in status.values()):
        sys.exit(1)


if __name__ == "__main__":
    main()

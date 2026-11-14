// ───────────────────────────────────────────────
// 사이트 공통 스크립트: 메인, 산업 허브, 영역 페이지
//  - 목록(산업·영역·페이지)은 assets/catalog.js에 있어요. 이 파일보다 먼저 불러와야 해요
// ───────────────────────────────────────────────
const { INDUSTRIES, AREAS, PROJECTS } = window.CATALOG;
const ROOT = new URL("..", document.currentScript.src).href; // 사이트 맨 위 주소 (어느 폴더에서 불러도 같음)

function esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
function projectHref(p) { return `${ROOT}${p.area}/${p.path}`; }
function areaName(id) { const a = AREAS.find(x => x.id === id); return a ? a.name : ""; }
const num = (v, d = 0) => Number(v).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
const todayKST = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());

// ───────────────────────────────────────────────
// 배경 그림 (사진 대신 SVG)
// ───────────────────────────────────────────────
function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function artSvg(p) {
  const r = rng(p.title), h = p.hue ?? 215;
  const c1 = `hsl(${h} 85% 66%)`, c2 = `hsl(${(h + 40) % 360} 80% 60%)`;
  const W = 800, H = 600;
  let g = "";
  if (p.art === "towers") {
    let x = 0;
    while (x < W) {
      const w = 40 + r() * 70, top = 120 + r() * 330;
      g += `<rect x="${x}" y="${top}" width="${w - 8}" height="${H - top}" fill="${c1}" opacity="${0.12 + r() * 0.25}"/>`;
      for (let y = top + 18; y < H; y += 22) g += `<rect x="${x + 8}" y="${y}" width="${w - 24}" height="3" fill="${c1}" opacity="${0.25 + r() * 0.5}"/>`;
      x += w;
    }
  } else if (p.art === "grid") {
    const s = 46;
    for (let y = 30; y < H; y += s) for (let x = 20; x < W; x += s) {
      const v = r();
      g += `<rect x="${x}" y="${y}" width="${s - 8}" height="${s - 8}" rx="4" fill="${v > 0.7 ? c2 : c1}" opacity="${(0.05 + v * 0.55).toFixed(2)}"/>`;
    }
  } else if (p.art === "candles") {
    let y = 330;
    for (let x = 20; x < W; x += 34) {
      const o = y, cl = Math.min(520, Math.max(120, y + (r() - 0.55) * 90)), up = cl < o;
      const hi = Math.min(o, cl) - r() * 40, lo = Math.max(o, cl) + r() * 40;
      const col = up ? c1 : `hsl(${h} 25% 70%)`;
      g += `<line x1="${x + 9}" x2="${x + 9}" y1="${hi}" y2="${lo}" stroke="${col}" stroke-width="2" opacity=".6"/>`;
      g += `<rect x="${x}" y="${Math.min(o, cl)}" width="18" height="${Math.max(4, Math.abs(cl - o))}" fill="${col}" opacity="${up ? 0.75 : 0.35}"/>`;
      y = cl;
    }
  } else if (p.art === "dots") {
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.6) * 300;
      const x = 430 + Math.cos(a) * d * 1.3, y = 300 + Math.sin(a) * d * 0.9;
      g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2 + r() * 6).toFixed(1)}" fill="${r() > 0.85 ? c2 : c1}" opacity="${(0.2 + r() * 0.6).toFixed(2)}"/>`;
    }
  } else {
    for (let k = 0; k < 3; k++) {
      let y = 200 + k * 110, d = `M0 ${y}`;
      for (let x = 20; x <= W; x += 20) { y = Math.min(560, Math.max(60, y + (r() - 0.5) * 48)); d += ` L${x} ${y.toFixed(1)}`; }
      g += `<path d="${d}" fill="none" stroke="${k === 1 ? c2 : c1}" stroke-width="${k === 0 ? 4 : 2.5}" opacity="${0.85 - k * 0.22}"/>`;
    }
  }
  const gid = `bg-${h}-${(p.title || "").length}`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h} 45% 14%)"/><stop offset="1" stop-color="hsl(${(h + 30) % 360} 40% 5%)"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#${gid})"/>${g}</svg>`;
}

// ───────────────────────────────────────────────
// 방문자 수: 무료 카운터 Abacus (계정 없이 사용, abacus.jasoncameron.dev)
//  - 같은 브라우저에서 새로고침은 한 번만 셈 (창을 닫았다 다시 열면 다시 셈)
//  - 오늘 = 한국 날짜 기준. 서비스가 응답하지 않으면 숨김
// ───────────────────────────────────────────────
const COUNTER = "https://abacus.jasoncameron.dev";
// 내 컴퓨터에서 미리 볼 때는 실제 숫자에 섞이지 않게 따로 셈
const COUNTER_NS = location.hostname.endsWith("github.io") ? "choco1161-github-io" : "choco1161-github-io-dev";

async function countVisits(el) {
  if (!el) return;
  const today = todayKST().replaceAll("-", "");
  let seen = false;
  try { seen = sessionStorage.getItem("visited-" + today) === "1"; } catch (e) {}
  const op = seen ? "get" : "hit";
  const get = key => fetch(`${COUNTER}/${op}/${COUNTER_NS}/${key}`, { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null)).then(j => (j && typeof j.value === "number" ? j.value : null)).catch(() => null);
  const [total, day] = await Promise.all([get("total"), get("day-" + today)]);
  if (total == null) return;
  try { sessionStorage.setItem("visited-" + today, "1"); } catch (e) {}
  el.innerHTML = `<span>오늘 <b>${num(day ?? 0)}</b></span><span>누적 <b>${num(total)}</b></span>`;
  el.hidden = false;
}

// ───────────────────────────────────────────────
// 데이터 불러오기: 매일 자동 갱신되는 JSON을 필요한 것만, 한 번씩
// ───────────────────────────────────────────────
const SOURCES = {
  market: "data/stocks/market.json",
  fx:     "data/fx/fx.json",
  kb:     "data/realestate/kb.json",
  idx:    "data/realestate/index.json",
  apply:  "data/realestate/apply.json",
  picks:  "stocks/daily-pick/picks.json",
  prices: "stocks/daily-pick/prices.json",
  macro:  "macro/rates-30y/data.js", // 스크립트 파일: MACRO, MACRO_ASOF를 만들어요
};
const loaded = {};
function load(key) {
  if (loaded[key]) return loaded[key];
  const url = ROOT + SOURCES[key];
  loaded[key] = url.endsWith(".js")
    ? new Promise(res => {
        const s = document.createElement("script");
        s.src = url;
        // data.js는 const로 선언돼서 window에는 안 붙어요 → 이름으로 직접 읽기
        s.onload = () => res(typeof MACRO !== "undefined" ? { M: MACRO, asof: typeof MACRO_ASOF !== "undefined" ? MACRO_ASOF : {} } : null);
        s.onerror = () => res(null);
        document.head.appendChild(s);
      })
    : fetch(url, { cache: "no-cache" }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  return loaded[key];
}

// KB 월 번호 → "2026.10"
function kbMonth(kb, k) {
  const y0 = +kb.m0.slice(0, 4), m0 = +kb.m0.slice(4) - 1, t = y0 * 12 + m0 + k;
  return `${Math.floor(t / 12)}.${String(t % 12 + 1).padStart(2, "0")}`;
}
const ym = s => `${s.slice(0, 4)}.${s.slice(4)}`;
const lastN = (a, n) => a.filter(v => v != null).slice(-n);

// ───────────────────────────────────────────────
// 지표 카드: 새 지표는 여기에 하나 추가
//  needs = 필요한 데이터, page = 누르면 갈 페이지
//  get(데이터) → { value, unit, delta, deltaUnit, deltaFmt, note, spark, meta } (없으면 null → 카드 숨김)
// ───────────────────────────────────────────────
const KPIS = [
  { id: "fx", industry: "finance", label: "원/달러 환율", needs: ["fx"], page: "macro/fx/",
    get: ({ fx }) => {
      const s = fx?.series?.USD; if (!s || s.c.length < 2) return null;
      const n = s.c.length, d = s.d[n - 1];
      return { value: num(s.c[n - 1], 1), unit: "원", delta: s.c[n - 1] - s.c[n - 2], deltaUnit: "원", deltaFmt: 1, note: "전일 대비",
               spark: s.c.slice(-30), meta: `${+d.slice(5, 7)}/${+d.slice(8)} 기준 · 최근 30거래일` };
    } },
  ...[["krRate", "한국 정책금리"], ["usRate", "미국 정책금리"], ["us10y", "미국 10년물 금리"]].map(([k, label]) => ({
    id: k, industry: "finance", label, needs: ["macro"], page: "macro/rates-30y/",
    get: ({ macro }) => {
      const s = macro?.M?.[k]; if (!s) return null;
      const v = lastN(s, 2);
      return { value: num(v[1], 2), unit: "%", delta: v[1] - v[0], deltaUnit: "%p", deltaFmt: 2, note: "전년 말 대비",
               spark: lastN(s, 15), meta: `${macro.asof[k] || ""} 기준 · 연말값 추이` };
    } })),
  ...[["QQQ", "나스닥100 ETF"], ["NVDA", "엔비디아"]].map(([sym, label]) => ({
    id: sym, industry: "finance", label: `${label} (${sym})`, needs: ["market"], page: "stocks/nasdaq-floor/",
    get: ({ market }) => {
      const c = market?.closes?.[sym]; if (!c) return null;
      return { value: "$" + num(c.p, 2), delta: (c.p / c.prev - 1) * 100, deltaUnit: "%", deltaFmt: 2, note: "전일 대비",
               spark: c.hist, meta: `${c.asOf} 종가` };
    } })),
  { id: "pick", industry: "finance", label: "오늘의 미국주식", needs: ["picks", "prices"], page: "stocks/daily-pick/",
    get: ({ picks, prices }) => {
      const list = picks?.picks; if (!list?.length) return null;
      const p = list.reduce((a, b) => (b.n > a.n ? b : a));
      const now = prices?.prices?.[p.ticker]?.close;
      return { value: p.ticker, unit: p.name, delta: now ? (now / p.close - 1) * 100 : null, deltaUnit: "%", deltaFmt: 1, note: "소개일 이후",
               meta: `${p.date} 소개 · ${p.sector}` };
    } },
  ...[["전국", "KB 매수우위지수 · 전국"], ["서울", "KB 매수우위지수 · 서울"]].map(([r, label]) => ({
    id: "bs-" + r, industry: "realestate", label, needs: ["kb"], page: "realestate/region-index/",
    get: ({ kb }) => {
      const s = kb?.bs?.[r]; if (!s) return null;
      const v = lastN(s, 2);
      return { value: num(v[1], 1), delta: v[1] - v[0], deltaFmt: 1, note: "전월 대비",
               spark: lastN(s, 24), meta: `${kbMonth(kb, s.length - 1)} · 100 넘으면 매수자 우위` };
    } })),
  { id: "px", industry: "realestate", label: "KB 아파트 매매가격지수 · 전국", needs: ["kb"], page: "realestate/region-index/",
    get: ({ kb }) => {
      const s = kb?.px?.["전국"]; if (!s) return null;
      const v = lastN(s, 2);
      return { value: num(v[1], 2), delta: (v[1] / v[0] - 1) * 100, deltaUnit: "%", deltaFmt: 2, note: "전월 대비",
               spark: lastN(s, 24), meta: `${kbMonth(kb, s.length - 1)} 기준` };
    } },
  { id: "rt", industry: "realestate", label: "실거래 매매지수 · 수도권", needs: ["idx"], page: "realestate/region-index/?g=수도권",
    get: ({ idx }) => {
      const s = idx?.idx?.["수도권"]?.i; if (!s) return null;
      // 최근 달(recent)은 실거래 신고 기간(30일)이 안 끝나 거래가 덜 잡혀요 → 확정된 달까지만
      const soft = new Set(idx.recent || []);
      let k = s.length - 1;
      while (k > 1 && soft.has(idx.m[k])) k--;
      return { value: num(s[k], 2), delta: (s[k] / s[k - 1] - 1) * 100, deltaUnit: "%", deltaFmt: 2, note: "전월 대비",
               spark: s.slice(0, k + 1), meta: `${ym(idx.m[k])} 확정 · 이후 달은 신고 중 · ${ym(idx.base)}=100` };
    } },
  { id: "apply", industry: "realestate", label: "2주 안에 청약 접수", needs: ["apply"], page: "realestate/bunyang/",
    get: ({ apply }) => {
      if (!apply?.rows) return null;
      const t = todayKST(), end = new Date(Date.parse(t) + 14 * 864e5).toISOString().slice(0, 10);
      const rows = apply.rows.filter(r => r.a0 && r.a1 >= t && r.a0 <= end).sort((a, b) => a.a0.localeCompare(b.a0));
      const next = rows.find(r => r.a0 >= t) || rows[0];
      return { value: num(rows.length), unit: "건",
               meta: next ? `가까운 접수: ${next.name.replace(/\(.*$/, "").trim()} (${next.a0.slice(5).replace("-", "/")})` : "예정된 접수 없음" };
    } },
];

function sparkSvg(arr) {
  const a = (arr || []).filter(v => v != null);
  if (a.length < 2) return "";
  const lo = Math.min(...a), hi = Math.max(...a), span = hi - lo || 1;
  const pts = a.map((v, i) => `${(i / (a.length - 1) * 100).toFixed(1)},${(26 - (v - lo) / span * 24).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" vector-effect="non-scaling-stroke"/></svg>`;
}

function kpiHtml(k, d) {
  let delta = "";
  if (d.delta != null && isFinite(d.delta)) {
    const r = Number(d.delta.toFixed(d.deltaFmt ?? 1));
    const dir = r > 0 ? "up" : r < 0 ? "down" : "flat";
    const arrow = { up: "▲", down: "▼", flat: "–" }[dir];
    delta = `<p class="k-delta ${dir}">${arrow} ${num(Math.abs(r), d.deltaFmt ?? 1)}${d.deltaUnit || ""}<span>${esc(d.note || "")}</span></p>`;
  }
  return `<a class="kpi" href="${ROOT}${k.page}">
    <p class="k-label">${esc(k.label)}</p>
    <p class="k-val">${esc(d.value)}${d.unit ? `<small>${esc(d.unit)}</small>` : ""}</p>
    ${delta}${sparkSvg(d.spark)}
    <p class="k-meta">${esc(d.meta || "")}</p>
  </a>`;
}

async function renderKpis(el, industry) {
  const list = KPIS.filter(k => !industry || k.industry === industry);
  if (!list.length) { el.closest("section")?.remove(); return; }
  el.innerHTML = list.map(k => `<div class="kpi skeleton" data-id="${k.id}"><p class="k-label">${esc(k.label)}</p><p class="k-val">…</p></div>`).join("");
  await Promise.all(list.map(async k => {
    const vals = await Promise.all(k.needs.map(load));
    const data = Object.fromEntries(k.needs.map((n, i) => [n, vals[i]]));
    let d = null;
    try { d = k.get(data); } catch (e) { d = null; }
    const slot = el.querySelector(`[data-id="${k.id}"]`);
    if (d) slot.outerHTML = kpiHtml(k, d);
    else slot.remove();
  }));
  if (!el.children.length) el.innerHTML = `<div class="empty">지표를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</div>`;
}

// ───────────────────────────────────────────────
// 통합 검색: 페이지·지표·권역·종목·청약 공고를 한 번에
//  - 처음 검색창을 누를 때 데이터를 불러와 목록을 만들어요 (모두 브라우저 안에서, 서버 없음)
// ───────────────────────────────────────────────
const norm = s => String(s || "").toLowerCase().replace(/\s+/g, "");
let searchIndex = null, searchBuilding = null;

async function buildSearchIndex() {
  const items = [];
  for (const p of PROJECTS) {
    items.push({ type: "페이지", title: `${p.icon || ""} ${p.title}`, sub: p.purpose?.q || p.tagline || p.desc, href: projectHref(p),
                 text: [p.title, p.tagline, p.desc, p.purpose?.q, p.purpose?.who, areaName(p.area), ...(p.tags || [])].join(" ") });
  }
  for (const i of INDUSTRIES) items.push({ type: "페이지", title: `${i.icon} ${i.name} 허브`, sub: i.desc, href: `${ROOT}industry/${i.id}/`, text: i.name + " " + i.desc });
  for (const k of KPIS) items.push({ type: "지표", title: k.label, sub: "오늘의 지표 · 자세한 페이지로 이동", href: ROOT + k.page, text: k.label });

  const [apply, picks, idx] = await Promise.all([load("apply"), load("picks"), load("idx")]);
  for (const g of idx?.gwang || []) {
    items.push({ type: "권역", title: `${g} 부동산 지수`, sub: "KB 매수우위 · 실거래 매매지수", href: `${ROOT}realestate/region-index/?g=${encodeURIComponent(g)}`, text: g + " 지수 시세 집값" });
  }
  for (const p of picks?.picks || []) {
    items.push({ type: "종목", title: `${p.ticker} · ${p.name}`, sub: `${p.date} 소개 · ${p.sector} · ${p.point}`, href: `${ROOT}stocks/daily-pick/`,
                 text: [p.ticker, p.name, p.sector, p.point].join(" ") });
  }
  for (const r of apply?.rows || []) {
    const q = new URLSearchParams(); if (r.g) q.set("g", r.g); if (r.code) q.set("c", r.code);
    items.push({ type: "청약 공고", title: r.name, sub: `${r.addr || r.reg || ""} · 접수 ${r.a0 || "?"}~${(r.a1 || "").slice(5)}${r.tot ? ` · ${num(r.tot)}세대` : ""}`,
                 href: `${ROOT}realestate/bunyang/?${q}`, text: [r.name, r.addr, r.reg, r.sido, r.g, r.builder, r.kind, r.supply, "청약 분양"].join(" "), date: r.a0 });
  }
  for (const it of items) it.n = norm(it.text + " " + it.title);
  return items;
}

const TYPE_ORDER = ["페이지", "지표", "권역", "종목", "청약 공고"];
function searchItems(q) {
  const words = q.trim().split(/\s+/).map(norm).filter(Boolean);
  if (!words.length) return [];
  const hits = searchIndex.filter(it => words.every(w => it.n.includes(w)));
  return TYPE_ORDER.map(t => {
    const g = hits.filter(h => h.type === t);
    if (t === "청약 공고") g.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    else g.sort((a, b) => (norm(b.title).includes(words[0]) ? 1 : 0) - (norm(a.title).includes(words[0]) ? 1 : 0));
    return [t, g];
  }).filter(([, g]) => g.length);
}

function mountSearch(root) {
  root.innerHTML = `
    <form class="search" role="search" autocomplete="off">
      <label class="sr" for="q">통합 검색</label>
      <input id="q" type="search" placeholder="예: 금리, 수도권, 엔비디아, 시흥 청약" enterkeyhint="search">
      <kbd aria-hidden="true">/</kbd>
    </form>
    <div class="results" id="results" hidden></div>`;
  const input = root.querySelector("input"), out = root.querySelector("#results");
  let timer;
  const ready = () => {
    if (searchIndex) return Promise.resolve();
    if (!searchBuilding) searchBuilding = buildSearchIndex().then(x => { searchIndex = x; });
    return searchBuilding;
  };
  const run = async () => {
    if (!searchIndex && input.value.trim()) { out.hidden = false; out.innerHTML = `<p class="r-empty">검색 목록을 만드는 중…</p>`; }
    await ready();
    const q = input.value;
    if (!q.trim()) { out.hidden = true; return; }
    const groups = searchItems(q);
    out.hidden = false;
    out.innerHTML = groups.length ? groups.map(([t, g]) => `
      <div class="r-group"><p class="r-type">${t} <span>${g.length}</span></p>
        ${g.slice(0, t === "청약 공고" ? 6 : 5).map(h => `<a class="r-item" href="${h.href}"><b>${esc(h.title)}</b><span>${esc(h.sub)}</span></a>`).join("")}
      </div>`).join("") : `<p class="r-empty">“${esc(q)}”에 맞는 결과가 없어요. 다른 낱말로 찾아보세요.</p>`;
  };
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 120); });
  input.addEventListener("focus", () => { ready(); if (input.value.trim()) out.hidden = false; });
  root.querySelector("form").addEventListener("submit", e => { e.preventDefault(); const a = out.querySelector(".r-item"); if (a) location.href = a.href; });
  input.addEventListener("keydown", e => { if (e.key === "Escape") { input.value = ""; out.hidden = true; } });
  document.addEventListener("keydown", e => {
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName || "")) { e.preventDefault(); input.focus(); }
  });
  document.addEventListener("click", e => { if (!root.contains(e.target)) out.hidden = true; });
}

// ───────────────────────────────────────────────
// 공통 조각: 상단 메뉴, 페이지 타일, 산업 카드
// ───────────────────────────────────────────────
function renderNav(el, current) {
  el.innerHTML = INDUSTRIES.map(i => `<a href="${ROOT}industry/${i.id}/"${i.id === current ? ` aria-current="page"` : ""}>${esc(i.name)}</a>`).join("")
    + `<a href="${ROOT}#pages">모든 페이지</a>`;
}

function tileHtml(p) {
  return `
    <a class="tile" href="${projectHref(p)}">
      <div class="art">${artSvg(p)}</div>
      <div class="shade"></div>
      <div class="tile-in">
        <p class="kicker">${esc(areaName(p.area))}</p>
        <h3>${esc(p.title)}</h3>
        <p class="lead">${esc(p.purpose?.q || p.tagline || p.desc)}</p>
        <p class="tags">${(p.tags || []).map(t => `<span>#${esc(t)}</span>`).join("")}</p>
      </div>
    </a>`;
}

function industryCards(el) {
  el.innerHTML = INDUSTRIES.map(i => {
    const areas = AREAS.filter(a => a.industry === i.id);
    const pages = PROJECTS.filter(p => areas.some(a => a.id === p.area));
    return `<a class="hub" href="${ROOT}industry/${i.id}/" style="--h:${i.hue}">
      <span class="hub-icon">${i.icon}</span>
      <b>${esc(i.name)}</b>
      <span class="hub-desc">${esc(i.desc)}</span>
      <span class="hub-foot">${areas.map(a => esc(a.name)).join(" · ")} · 페이지 ${pages.length}개 →</span>
    </a>`;
  }).join("");
}

// ───────────────────────────────────────────────
// 메인 화면
// ───────────────────────────────────────────────
function renderPlatformHome() {
  renderNav(document.getElementById("nav"));
  document.getElementById("hero-art").innerHTML = artSvg({ title: "Derek's Platform", art: "lines", hue: 220 });
  mountSearch(document.getElementById("search"));
  countVisits(document.getElementById("visits"));
  document.getElementById("today").textContent = todayKST().replaceAll("-", ".");
  renderKpis(document.getElementById("kpis"));
  industryCards(document.getElementById("hubs"));
  document.getElementById("tiles").innerHTML = PROJECTS.map(tileHtml).join("");
  document.getElementById("count").textContent = `${PROJECTS.length}개의 페이지`;
}

// ───────────────────────────────────────────────
// 산업 허브: industry/아이디/index.html 에서 renderIndustry("아이디")
// ───────────────────────────────────────────────
function renderIndustry(id) {
  const ind = INDUSTRIES.find(i => i.id === id);
  const areas = AREAS.filter(a => a.industry === id);
  const pages = PROJECTS.filter(p => areas.some(a => a.id === p.area));
  if (!document.title.includes(" · ")) document.title = `${ind.name} · Derek's Platform`;
  renderNav(document.getElementById("nav"), id);
  document.getElementById("hero-art").innerHTML = artSvg({ title: ind.name, art: "grid", hue: ind.hue });
  document.getElementById("title").textContent = `${ind.icon} ${ind.name}`;
  document.getElementById("lead").textContent = ind.desc;
  mountSearch(document.getElementById("search"));
  renderKpis(document.getElementById("kpis"), id);

  document.getElementById("areas").innerHTML = areas.map(a => {
    const n = PROJECTS.filter(p => p.area === a.id).length;
    return `<a class="area" href="${ROOT}${a.id}/"><div class="icon">${a.icon}</div><div class="name">${esc(a.name)}</div>
      <div class="desc">${esc(a.desc)}</div><div class="count">${n ? `페이지 ${n}개 →` : "준비 중 →"}</div></a>`;
  }).join("");

  const tiles = document.getElementById("tiles");
  tiles.innerHTML = pages.length ? pages.map(tileHtml).join("") : `<div class="empty">아직 페이지가 없어요.</div>`;

  // 다른 산업으로 이어지는 페이지: 이 산업 페이지와 태그가 겹치는 바깥 페이지
  const tags = new Set(pages.flatMap(p => p.tags || []));
  const outside = PROJECTS.filter(p => !pages.includes(p) && (p.tags || []).some(t => tags.has(t)));
  const cross = document.getElementById("cross");
  if (outside.length) {
    cross.querySelector(".links").innerHTML = outside.map(p => {
      const shared = p.tags.filter(t => tags.has(t));
      return `<a href="${projectHref(p)}"><b>${esc(p.icon || "")} ${esc(p.title)}</b><span>${esc(areaName(p.area))} · ${shared.map(t => "#" + esc(t)).join(" ")}</span></a>`;
    }).join("");
  } else cross.remove();
}

// ───────────────────────────────────────────────
// 영역 페이지: 제목과 페이지 목록
// ───────────────────────────────────────────────
function renderArea(areaId) {
  const a = AREAS.find(x => x.id === areaId);
  const ind = INDUSTRIES.find(i => i.id === a.industry);
  if (!document.title.includes(" · ")) document.title = `${a.name} · Derek's Platform`;
  document.getElementById("title").textContent = `${a.icon} ${a.name}`;
  document.getElementById("desc").textContent = a.desc;
  const back = document.querySelector(".back");
  if (back && ind) back.insertAdjacentHTML("afterend", `<a class="back crumb" href="${ROOT}industry/${ind.id}/">${ind.icon} ${esc(ind.name)} 허브</a>`);

  const list = document.getElementById("list");
  const items = PROJECTS.filter(p => p.area === areaId);
  if (!items.length) {
    list.outerHTML = `<div class="empty">아직 페이지가 없어요. 곧 채워질 예정!</div>`;
    return;
  }
  list.innerHTML = items.map(p => `
    <li><a href="${p.path}"><span class="date">${esc(p.date || "")}</span>
      <div class="title">${esc((p.icon ? p.icon + " " : "") + p.title)}</div>
      ${p.purpose ? `<div class="q">${esc(p.purpose.q)}</div><div class="who">이런 분께 · ${esc(p.purpose.who)}</div>` : ""}
      <div class="desc">${esc(p.desc || "")}</div>
      <div class="chips">${(p.tags || []).map(t => `<span>#${esc(t)}</span>`).join("")}</div></a></li>`).join("");
}

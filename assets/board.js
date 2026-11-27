// 시세 보드: data/markets/markets.json (scripts/fetch_markets.py 가 평일 하루 여러 번 갱신)
//  - 원자재 시세(macro/commodities)와 코스피·코스닥(korea/market)이 함께 써요
//  - 페이지의 <div id="app" data-ids="WTI,BRENT" data-krw="1" data-compare="KOSPI,SP500"> 로 설정
//      data-ids     보여줄 시리즈 (카드 순서)
//      data-krw     1이면 달러 표시 시리즈에 원화 환산을 붙여요 (data/fx/fx.json 의 원/달러)
//      data-compare 1년 수익률 비교 차트에 넣을 시리즈
(() => {
const $ = id => document.getElementById(id);
const app = $("app");
if (!app) return;
const ROOT = new URL("..", document.currentScript.src).href;
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmt = (v, d) => v == null || isNaN(v) ? "–" : Number(v).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const md = s => { const d = new Date(s + "T00:00:00Z"); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`; };
const ym = s => `${s.slice(0, 4)}.${s.slice(5, 7)}`;
const ymd = s => s.replaceAll("-", ".");
const kst = iso => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const cls = x => (x > 0 ? "up" : x < 0 ? "down" : "flat");
const arrow = x => (x > 0 ? "▲" : x < 0 ? "▼" : "–");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const RANGES = [["1M", "1개월", 1], ["3M", "3개월", 3], ["6M", "6개월", 6], ["1Y", "1년", 12], ["2Y", "2년", 24]];
const IDS = (app.dataset.ids || "").split(",").filter(Boolean);
const COMPARE = (app.dataset.compare || "").split(",").filter(Boolean);
const KEY = "board-range:" + location.pathname;
let D, FX = null, cur = IDS[0], range = "6M", chart = null, cmpChart = null;
try { range = localStorage.getItem(KEY) || range; } catch (e) {}
if (!RANGES.some(r => r[0] === range)) range = "6M";

const getJson = u => fetch(ROOT + u, { cache: "no-cache" }).then(r => (r.ok ? r.json() : Promise.reject(r.status)));
Promise.all([getJson("data/markets/markets.json"), app.dataset.krw ? getJson("data/fx/fx.json").catch(() => null) : null])
  .then(([d, fx]) => {
    D = d; FX = fx;
    const ids = IDS.filter(id => D.series[id]?.c?.length > 1);
    if (!ids.length) throw new Error("empty");
    IDS.length = 0; IDS.push(...ids);
    const want = (new URLSearchParams(location.search).get("s") || "").toUpperCase();
    cur = IDS.includes(want) ? want : IDS[0];
    $("loading").hidden = true; app.hidden = false;
    build(); render(); compare();
  })
  .catch(() => { $("loading").hidden = true; $("failed").hidden = false; });

const S = id => D.series[id];
const isUsd = s => /^(달러|센트)/.test(s.unit);
const usdKrw = () => { const s = FX?.series?.USD; return s ? s.c[s.c.length - 1] : null; };
// 센트/파운드 → 원/kg 처럼 실무 단위로 바꿔 보여줘요
function krw(s, v) {
  const r = usdKrw(); if (!r || !isUsd(s)) return null;
  if (s.unit === "센트/파운드") return { v: v / 100 * r / 0.45359237, unit: "원/kg", dp: 0 };
  if (s.unit === "달러/파운드") return { v: v * r / 0.45359237, unit: "원/kg", dp: 0 };
  if (s.unit === "달러/배럴") return { v: v * r / 158.987, unit: "원/리터", dp: 0 };
  return { v: v * r, unit: "원/" + s.unit.split("/")[1], dp: 0 };
}
const unitTxt = s => (s.unit === "pt" ? "" : s.unit);

function last(id) {
  const s = S(id), n = s.c.length;
  return { v: s.c[n - 1], prev: s.c[n - 2], date: s.d[n - 1], pd: s.d[n - 2] };
}
function sliceFrom(id, months) {
  const s = S(id), end = new Date(s.d[s.d.length - 1] + "T00:00:00Z");
  end.setUTCMonth(end.getUTCMonth() - months);
  const from = end.toISOString().slice(0, 10);
  let i = s.d.findIndex(d => d >= from); if (i < 0) i = 0;
  return { d: s.d.slice(i), c: s.c.slice(i) };
}
function spark(arr) {
  if (arr.length < 2) return "";
  const lo = Math.min(...arr), hi = Math.max(...arr), sp = hi - lo || 1;
  const pts = arr.map((v, i) => `${(i / (arr.length - 1) * 100).toFixed(1)},${(28 - (v - lo) / sp * 26).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}

function build() {
  $("pairs").innerHTML = IDS.map(id => {
    const s = S(id), n = last(id), ch = (n.v / n.prev - 1) * 100;
    return `<button type="button" class="pair" role="tab" data-id="${id}">
      <div class="nm">${esc(s.name)}${s.monthly ? " · 월평균" : ""}</div>
      <div class="rt">${fmt(n.v, s.dp)}<small class="u"> ${esc(unitTxt(s))}</small></div>
      <div class="ch ${cls(ch)}">${arrow(ch)} ${fmt(Math.abs(ch), 2)}% <span class="flat">${s.monthly ? "전월" : "전일"}</span></div>
      <div class="${cls(ch)}">${spark(sliceFrom(id, s.monthly ? 24 : 1).c)}</div></button>`;
  }).join("");
  $("pairs").addEventListener("click", e => {
    const b = e.target.closest(".pair"); if (!b) return;
    cur = b.dataset.id;
    const u = new URL(location.href); u.searchParams.set("s", cur); history.replaceState(null, "", u);
    render();
  });
  $("ranges").innerHTML = RANGES.map(([k, t]) => `<button type="button" data-r="${k}">${t}</button>`).join("");
  $("ranges").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    range = b.dataset.r; try { localStorage.setItem(KEY, range); } catch (e2) {}
    render();
  });
  recentTable();
  const bad = Object.entries(D.status || {}).filter(([k, v]) => IDS.includes(k) && v !== "ok").map(([k]) => S(k)?.name || k);
  const srcs = [...new Set(IDS.map(id => S(id).src))].join(", ");
  $("src").innerHTML = `출처: ${esc(srcs)} · 마지막 수집 ${kst(D.updated)} (한국시간)` +
    (bad.length ? ` · <b>${esc(bad.join(", "))}</b>는 이번 수집에 실패해 이전 값을 보여줘요` : "") +
    (FX ? ` · 원화 환산은 최신 원/달러 ${fmt(usdKrw(), 1)}원 기준` : "") + ` · 참고용이며 투자 조언이 아닙니다.`;
}

function render() {
  const s = S(cur), n = last(cur), ch = n.v - n.prev, pct = (n.v / n.prev - 1) * 100;
  document.querySelectorAll(".pair").forEach(b => b.setAttribute("aria-selected", String(b.dataset.id === cur)));
  document.querySelectorAll("#ranges button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.r === range)));
  $("heroLabel").textContent = `${s.name} · ${s.note}`;
  $("heroRate").innerHTML = `${fmt(n.v, s.dp)}<small>${esc(unitTxt(s))}</small>`;
  $("heroChg").innerHTML = `<span class="${cls(ch)}">${arrow(ch)} ${fmt(Math.abs(ch), s.dp)} (${pct > 0 ? "+" : ""}${fmt(pct, 2)}%)</span> <span class="flat">${s.monthly ? "전월" : "전일"} 대비</span>`;
  $("heroTime").textContent = s.monthly ? `${ym(n.date)} 월평균 · 매월 갱신되는 자료` : `${md(n.date)} 기준`;
  const y1 = sliceFrom(cur, 12).c;
  const rows = [["52주 최고", fmt(Math.max(...y1), s.dp)], ["52주 최저", fmt(Math.min(...y1), s.dp)]];
  const k = krw(s, n.v);
  if (k) rows.unshift(["원화 환산", `${fmt(k.v, k.dp)} ${k.unit}`]);
  $("heroStats").innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("");
  drawChart(s);
}

function drawChart(s) {
  const r = RANGES.find(x => x[0] === range), sl = sliceFrom(cur, s.monthly ? Math.max(r[2], 12) : r[2]);
  $("chartTitle").textContent = `${s.name} ${s.monthly && r[2] < 12 ? "1년" : r[1]} 추이`;
  const c = sl.c, first = c[0], lastV = c[c.length - 1];
  let hi = 0, lo = 0; c.forEach((v, i) => { if (v > c[hi]) hi = i; if (v < c[lo]) lo = i; });
  const chg = (lastV / first - 1) * 100, dfmt = s.monthly ? ym : ymd;
  $("period").innerHTML = `
    <div>기간 시작<b>${fmt(first, s.dp)}</b><small>${dfmt(sl.d[0])}</small></div>
    <div>기간 변화<b class="${cls(chg)}">${chg > 0 ? "+" : ""}${fmt(chg, 2)}%</b><small>${fmt(lastV - first, s.dp)}</small></div>
    <div>최고<b>${fmt(c[hi], s.dp)}</b><small>${dfmt(sl.d[hi])}</small></div>
    <div>최저<b>${fmt(c[lo], s.dp)}</b><small>${dfmt(sl.d[lo])}</small></div>
    <div>자료 수<b>${c.length}</b><small>${s.monthly ? "개월" : "거래일"}</small></div>`;
  const grid = css("--grid"), muted = css("--muted");
  const data = { labels: sl.d, datasets: [{ data: c, borderColor: css("--line-c"), backgroundColor: css("--fill-c"), fill: "start",
    borderWidth: 2, pointRadius: s.monthly ? 2 : 0, pointHoverRadius: 4, tension: 0.15 }] };
  const tick = function (v) { const d = this.getLabelForValue(v); return s.monthly || r[2] >= 12 ? ym(d) : d.slice(5).replace("-", "/"); };
  if (chart) {
    chart.data = data;
    chart.options.scales.x.ticks.callback = tick;
    chart.options.plugins.tooltip.callbacks.label = it => `${fmt(it.parsed.y, s.dp)} ${unitTxt(s)}`;
    chart.update("none"); return;
  }
  chart = new Chart($("cMain"), {
    type: "line", data,
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false },
        tooltip: { displayColors: false, callbacks: {
          title: it => (S(cur).monthly ? ym(it[0].label) : md(it[0].label) + " " + it[0].label.slice(0, 4)),
          label: it => `${fmt(it.parsed.y, s.dp)} ${unitTxt(s)}` } } },
      scales: {
        x: { grid: { display: false }, border: { color: grid }, ticks: { color: muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 7, callback: tick } },
        y: { position: "right", grid: { color: grid }, border: { display: false }, ticks: { color: muted } },
      },
    },
  });
}

// 1년 수익률 비교 (시작일 = 100)
function compare() {
  const box = $("compare"); if (!box) return;
  const ids = COMPARE.filter(id => S(id)?.c?.length > 20 && !S(id).monthly);
  if (ids.length < 2) { box.closest("section").hidden = true; return; }
  const sl = ids.map(id => sliceFrom(id, 12));
  // 날짜를 합쳐 각 시리즈를 직전 값으로 이어 그려요 (휴장일이 나라마다 달라서)
  const dates = [...new Set(sl.flatMap(x => x.d))].sort();
  const palette = ["#4a95ec", "#ef6b6b", "#f0b54a", "#5ec8a8"];
  const sets = ids.map((id, k) => {
    const m = new Map(sl[k].d.map((d, i) => [d, sl[k].c[i]])), base = sl[k].c[0];
    let lastV = null;
    return { label: S(id).name, data: dates.map(d => { if (m.has(d)) lastV = m.get(d); return lastV == null ? null : +(lastV / base * 100).toFixed(2); }),
      borderColor: palette[k % palette.length], borderWidth: 2, pointRadius: 0, tension: 0.15, spanGaps: true };
  });
  $("cmpNote").innerHTML = ids.map((id, k) => {
    const v = sets[k].data.filter(x => x != null).pop(), p = v - 100;
    return `<span><i style="background:${sets[k].borderColor}"></i>${esc(S(id).name)} <b class="${cls(p)}">${p > 0 ? "+" : ""}${fmt(p, 1)}%</b></span>`;
  }).join("");
  const grid = css("--grid"), muted = css("--muted");
  cmpChart = new Chart(box, {
    type: "line", data: { labels: dates, datasets: sets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: it => md(it[0].label), label: it => `${it.dataset.label} ${fmt(it.parsed.y - 100, 1)}%` } } },
      scales: {
        x: { grid: { display: false }, border: { color: grid }, ticks: { color: muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 6, callback(v) { return ym(this.getLabelForValue(v)); } } },
        y: { position: "right", grid: { color: grid }, border: { display: false }, ticks: { color: muted, callback: v => `${v - 100 > 0 ? "+" : ""}${v - 100}%` } },
      },
    },
  });
}

function recentTable() {
  const daily = IDS.filter(id => !S(id).monthly);
  if (!daily.length) { $("recent").closest("section").hidden = true; return; }
  const dates = [...new Set(daily.flatMap(id => S(id).d.slice(-12)))].sort().reverse().slice(0, 10);
  const idx = daily.map(id => new Map(S(id).d.map((d, i) => [d, i])));
  let h = `<thead><tr><th>날짜</th>${daily.map(id => `<th>${esc(S(id).name)}</th>`).join("")}</tr></thead><tbody>`;
  for (const d of dates) {
    h += `<tr><td>${md(d)}</td>` + daily.map((id, j) => {
      const s = S(id), i = idx[j].get(d);
      if (i == null) return "<td>–</td>";
      const p = i > 0 ? (s.c[i] / s.c[i - 1] - 1) * 100 : 0;
      return `<td>${fmt(s.c[i], s.dp)}<small class="${cls(p)}">${arrow(p)}${fmt(Math.abs(p), 2)}%</small></td>`;
    }).join("") + "</tr>";
  }
  $("recent").innerHTML = h + "</tbody>";
}
})();

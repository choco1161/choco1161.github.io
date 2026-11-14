// 원화 환율 — data/fx/fx.json (scripts/fetch_fx.py 가 평일 하루 여러 번 갱신)
(() => {
const $ = id => document.getElementById(id);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmt = (v, d) => v == null ? "–" : Number(v).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const md = s => { const d = new Date(s + "T00:00:00Z"); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`; };
const ymd = s => s.replaceAll("-", ".");
const kst = iso => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const cls = x => (x > 0 ? "up" : x < 0 ? "down" : "flat");
const arrow = x => (x > 0 ? "▲" : x < 0 ? "▼" : "–");

const RANGES = [["1M", "1개월", 1], ["3M", "3개월", 3], ["6M", "6개월", 6], ["1Y", "1년", 12], ["3Y", "3년", 36], ["5Y", "5년", 60]];
let D, cur = "USD", range = "3M", chart = null, toKrw = true;

const params = new URLSearchParams(location.search);
try { range = localStorage.getItem("fx-range") || range; } catch (e) {}
if (!RANGES.some(r => r[0] === range)) range = "3M";

fetch("../../data/fx/fx.json", { cache: "no-cache" })
  .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
  .then(d => {
    D = d;
    D.pairs = D.pairs.filter(p => D.series[p.id]?.c?.length > 1);
    if (!D.pairs.length) throw new Error("empty");
    const want = (params.get("c") || "").toUpperCase();
    if (D.pairs.some(p => p.id === want)) cur = want;
    $("loading").hidden = true; $("app").hidden = false;
    build(); render();
  })
  .catch(() => { $("loading").hidden = true; $("failed").hidden = false; });

const pair = id => D.pairs.find(p => p.id === id);
const label = p => (p.unit > 1 ? `${p.unit}${p.name.replace(/^.*\s/, "")}` : `1${p.id === "USD" ? "달러" : p.name.replace(/^.*\s/, "")}`);

// 지금 값 = 일봉 마지막 값 (오늘 봉은 수집 시점의 최신 체결가)
function now(id) {
  const s = D.series[id], n = s.c.length;
  return { v: s.c[n - 1], prev: s.c[n - 2], date: s.d[n - 1], live: D.live?.[id] };
}

function sliceFrom(id, months) {
  const s = D.series[id], last = new Date(s.d[s.d.length - 1] + "T00:00:00Z");
  last.setUTCMonth(last.getUTCMonth() - months);
  const from = last.toISOString().slice(0, 10);
  let i = s.d.findIndex(d => d >= from); if (i < 0) i = 0;
  return { d: s.d.slice(i), c: s.c.slice(i) };
}

function spark(arr) {
  const lo = Math.min(...arr), hi = Math.max(...arr), sp = hi - lo || 1;
  const pts = arr.map((v, i) => `${(i / (arr.length - 1) * 100).toFixed(1)},${(28 - (v - lo) / sp * 26).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}

function build() {
  $("pairs").innerHTML = D.pairs.map(p => {
    const n = now(p.id), ch = n.v - n.prev;
    return `<button type="button" class="pair" role="tab" data-id="${p.id}">
      <div class="nm">${p.name} · ${label(p)}</div>
      <div class="rt">${fmt(n.v, p.dp)}</div>
      <div class="ch ${cls(ch)}">${arrow(ch)} ${fmt(Math.abs(ch), p.dp)} (${fmt(ch / n.prev * 100, 2)}%)</div>
      <div class="${cls(ch)}">${spark(sliceFrom(p.id, 1).c)}</div></button>`;
  }).join("");
  $("pairs").addEventListener("click", e => {
    const b = e.target.closest(".pair"); if (!b) return;
    cur = b.dataset.id; $("calcCur").value = cur;
    const u = new URL(location.href); u.searchParams.set("c", cur); history.replaceState(null, "", u);
    render();
  });

  $("ranges").innerHTML = RANGES.map(([k, t]) => `<button type="button" data-r="${k}">${t}</button>`).join("");
  $("ranges").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    range = b.dataset.r; try { localStorage.setItem("fx-range", range); } catch (e2) {}
    render();
  });

  $("calcCur").innerHTML = D.pairs.map(p => `<option value="${p.id}">${p.id} ${p.name}</option>`).join("");
  $("calcCur").value = cur;
  $("amt").addEventListener("input", calc);
  $("calcCur").addEventListener("change", calc);
  $("swap").addEventListener("click", () => { toKrw = !toKrw; calc(); });

  recentTable();
  const st = Object.entries(D.status || {}).filter(([, v]) => v !== "ok").map(([k]) => k);
  $("src").innerHTML = `출처: ${D.source} · 마지막 수집 ${kst(D.updated)} (한국시간)` +
    (st.length ? ` · <b>${st.join(", ")}</b>는 이번 수집에 실패해 이전 값을 보여줘요` : "") +
    ` · 참고용이며 투자 조언이 아닙니다.`;
}

function render() {
  const p = pair(cur), n = now(cur), ch = n.v - n.prev;
  document.querySelectorAll(".pair").forEach(b => b.setAttribute("aria-selected", String(b.dataset.id === cur)));
  document.querySelectorAll("#ranges button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.r === range)));

  $("heroLabel").textContent = `${p.name} (${p.id}/KRW) · ${label(p)}당`;
  $("heroRate").textContent = fmt(n.v, p.dp);
  $("heroChg").innerHTML = `<span class="${cls(ch)}">${arrow(ch)} ${fmt(Math.abs(ch), p.dp)}원 (${ch > 0 ? "+" : ""}${fmt(ch / n.prev * 100, 2)}%)</span> <span class="flat">전일 대비</span>`;
  const sameDay = n.live && n.live.time.slice(0, 10) === n.date;
  $("heroTime").textContent = `${md(n.date)} 기준` + (sameDay ? ` · 마지막 체결 ${kst(n.live.time)} (한국시간)` : "");

  const y1 = sliceFrom(cur, 12).c;
  const rows = [];
  if (sameDay && n.live.high != null) rows.push(["오늘 고가", fmt(n.live.high, p.dp)], ["오늘 저가", fmt(n.live.low, p.dp)]);
  rows.push(["52주 최고", fmt(Math.max(...y1), p.dp)], ["52주 최저", fmt(Math.min(...y1), p.dp)]);
  $("heroStats").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");

  drawChart(p);
  calc();
}

function drawChart(p) {
  const months = RANGES.find(r => r[0] === range)[2], s = sliceFrom(cur, months);
  const rName = RANGES.find(r => r[0] === range)[1];
  $("chartTitle").textContent = `${p.name} ${rName} 추이`;

  const c = s.c, first = c[0], last = c[c.length - 1];
  let hi = 0, lo = 0; c.forEach((v, i) => { if (v > c[hi]) hi = i; if (v < c[lo]) lo = i; });
  const avg = c.reduce((a, b) => a + b, 0) / c.length, chg = (last / first - 1) * 100;
  $("period").innerHTML = `
    <div>기간 시작<b>${fmt(first, p.dp)}</b><small>${ymd(s.d[0])}</small></div>
    <div>기간 변화<b class="${cls(chg)}">${chg > 0 ? "+" : ""}${fmt(chg, 2)}%</b><small>${fmt(last - first, p.dp)}원</small></div>
    <div>최고<b>${fmt(c[hi], p.dp)}</b><small>${ymd(s.d[hi])}</small></div>
    <div>최저<b>${fmt(c[lo], p.dp)}</b><small>${ymd(s.d[lo])}</small></div>
    <div>평균<b>${fmt(avg, p.dp)}</b><small>${c.length}거래일</small></div>`;

  const grid = css("--grid"), muted = css("--muted"), lineC = css("--line-c"), fillC = css("--fill-c");
  const data = { labels: s.d, datasets: [{ data: c, borderColor: lineC, backgroundColor: fillC, fill: "start",
    borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.15 }] };
  if (chart) { chart.data = data; chart.update("none"); return; }
  chart = new Chart($("cFx"), {
    type: "line", data,
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false },
        tooltip: { displayColors: false, callbacks: {
          title: it => md(it[0].label) + " " + it[0].label.slice(0, 4),
          label: it => `${fmt(it.parsed.y, pair(cur).dp)}원` } } },
      scales: {
        x: { grid: { display: false }, border: { color: grid },
          ticks: { color: muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 7,
            callback(v) { const d = this.getLabelForValue(v); return range === "3Y" || range === "5Y" ? d.slice(0, 7).replace("-", ".") : d.slice(5).replace("-", "/"); } } },
        y: { position: "right", grid: { color: grid }, border: { display: false },
          ticks: { color: muted, callback: v => fmt(v, pair(cur).dp > 1 ? 0 : 0) } },
      },
    },
  });
}

function calc() {
  const id = $("calcCur").value, p = pair(id), rate = now(id).v / p.unit;
  const a = parseFloat($("amt").value);
  const name = p.id === "USD" ? "달러" : p.name.replace(/^.*\s/, "");
  if (!(a >= 0)) { $("calcOut").textContent = "금액을 입력해주세요."; return; }
  $("calcOut").innerHTML = toKrw
    ? `${fmt(a, a % 1 ? 2 : 0)} ${name} = ${fmt(Math.round(a * rate), 0)}원<small>${label(p)} = ${fmt(now(id).v, p.dp)}원 기준</small>`
    : `${fmt(a, 0)}원 = ${fmt(a / rate, 2)} ${name}<small>${label(p)} = ${fmt(now(id).v, p.dp)}원 기준</small>`;
}

function recentTable() {
  const base = D.series[D.pairs[0].id], n = base.d.length, K = 15;
  const idx = D.pairs.map(p => new Map(D.series[p.id].d.map((d, i) => [d, i])));
  let h = `<thead><tr><th>날짜</th>${D.pairs.map(p => `<th>${p.id}${p.unit > 1 ? ` (${p.unit})` : ""}</th>`).join("")}</tr></thead><tbody>`;
  for (let k = n - 1; k >= Math.max(0, n - K); k--) {
    const d = base.d[k];
    h += `<tr><td>${md(d)}</td>` + D.pairs.map((p, j) => {
      const s = D.series[p.id], i = idx[j].get(d);
      if (i == null) return "<td>–</td>";
      const ch = i > 0 ? s.c[i] - s.c[i - 1] : 0;
      return `<td>${fmt(s.c[i], p.dp)}<small class="${cls(ch)}">${arrow(ch)}${fmt(Math.abs(ch), p.dp)}</small></td>`;
    }).join("") + "</tr>";
  }
  $("recent").innerHTML = h + "</tbody>";
}
})();

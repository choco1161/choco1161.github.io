// 부동산 정책 연표 — KB 월간 시계열(data/realestate/kb.json)과 정책(policies.js)을 묶어 그리기
(async () => {
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmt = (v, d = 1) => v == null || !isFinite(v) ? "–" : Number(v).toLocaleString("ko-KR", { maximumFractionDigits: d, minimumFractionDigits: d });
const sgn = (v, d = 1, u = "%") => v == null || !isFinite(v) ? "–" : `${v > 0 ? "+" : ""}${fmt(v, d)}${u}`;
const cls = v => v == null ? "" : v > 0 ? "rise" : v < 0 ? "fall" : "";
const statusEl = document.getElementById("status");

let KB;
try {
  const r = await fetch("../../data/realestate/kb.json", { cache: "no-cache" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  KB = await r.json();
} catch (e) {
  statusEl.textContent = "KB 시계열을 불러오지 못했어요 (" + e.message + "). 잠시 뒤 새로고침해 주세요.";
  statusEl.classList.add("err");
  return;
}

// ── 시간축 ───────────────────────────────────
const Y0 = +KB.m0.slice(0, 4), MN = KB.m;
const MONTHS = Array.from({ length: MN }, (_, i) => { const y = Y0 + Math.floor(i / 12), m = i % 12 + 1; return `${y}.${String(m).padStart(2, "0")}`; });
const LASTM = MONTHS[MN - 1], LASTY = +LASTM.slice(0, 4);
const mIdx = d => (+d.slice(0, 4) - Y0) * 12 + (+d.slice(5, 7) - 1);   // "2017-08" → 인덱스
const YEARS = []; for (let y = Y0; y <= LASTY; y++) YEARS.push(y);
const ylabel = y => (y === LASTY ? `${y}*` : `${y}`);
const PX = KB.px, BS = KB.bs;
const P = POLICIES.map(p => Object.assign({ i: mIdx(p.d), y: +p.d.slice(0, 4) }, p)).sort((a, b) => a.i - b.i);
const DIR = { tight: ["규제 강화", "--pd-tight"], ease: ["완화·부양", "--pd-ease"], supply: ["공급", "--pd-supply"], event: ["사건", "--pd-event"] };
const dirColor = d => css(DIR[d][1]);
const govOf = d => GOVS.find(g => d >= g.from && d <= g.to);

statusEl.textContent = `KB 월간 지수 ${MONTHS[0]}~${LASTM} · 정책 ${P.length}건 · 갱신 ${KB.asof}`;
document.getElementById("asof").textContent = `${LASTM}월분, ${KB.asof} 갱신`;

// 연간 상승률: 12월 ÷ 전년 12월, 마지막 해는 최신월 ÷ 전년 같은 달
function yoyYear(reg, y) {
  const a = PX[reg]; let i = (y - Y0) * 12 + 11; if (i >= MN) i = MN - 1;
  const j = i - 12; return j < 0 || a[i] == null || a[j] == null ? null : (a[i] / a[j] - 1) * 100;
}
const yoyMonth = reg => PX[reg].map((v, i) => i < 12 || v == null || PX[reg][i - 12] == null ? null : +((v / PX[reg][i - 12] - 1) * 100).toFixed(2));
const chg = (reg, i0, i1) => { const a = PX[reg]; return i0 < 0 || i1 >= MN || a[i0] == null || a[i1] == null ? null : (a[i1] / a[i0] - 1) * 100; };
const rateOf = y => { const k = MACRO_YEARS.indexOf(y); return k < 0 ? null : MACRO.krRate[k]; };
const bsAvg = (reg, y) => { const s = BS[reg].slice((y - Y0) * 12, (y - Y0) * 12 + 12).filter(v => v != null); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; };

let selYear = +document.getElementById("year").value, selPolicy = null;
const charts = {};

// ── 공통 플러그인: 정권 배경, 선택 연도, 정책 점, 선택 정책 선 ─────
const reBands = {
  id: "reBands",
  beforeDatasetsDraw(c, _a, o) {
    if (!o.on) return;
    const x = c.scales.x, A = c.chartArea, ctx = c.ctx, monthly = o.monthly;
    const pos = i => x.getPixelForValue(i);
    const step = c.data.labels.length > 1 ? pos(1) - pos(0) : 20;
    ctx.save();
    if (o.govs) GOVS.forEach((g, k) => {
      const i0 = Math.max(0, monthly ? mIdx(g.from) : +g.from.slice(0, 4) - Y0);
      const i1 = Math.min(c.data.labels.length - 1, monthly ? mIdx(g.to) : +g.to.slice(0, 4) - Y0);
      if (i1 < 0 || i0 > c.data.labels.length - 1) return;
      const x0 = Math.max(A.left, pos(i0) - step / 2), x1 = Math.min(A.right, pos(i1) + step / 2);
      if (k % 2 === 0) { ctx.fillStyle = css("--grid"); ctx.globalAlpha = .35; ctx.fillRect(x0, A.top, x1 - x0, A.bottom - A.top); ctx.globalAlpha = 1; }
      ctx.fillStyle = css("--muted"); ctx.font = "600 11px system-ui, sans-serif"; ctx.textBaseline = "bottom";
      if (o.govLabels && x1 - x0 > 34) ctx.fillText(g.name, x0 + 4, A.bottom - 4);
    });
    // 선택 연도
    const s0 = monthly ? (selYear - Y0) * 12 : selYear - Y0, s1 = monthly ? s0 + 11 : s0;
    if (s0 >= 0 && s0 < c.data.labels.length) {
      const x0 = pos(s0) - Math.max(step, 6) / 2, x1 = pos(Math.min(s1, c.data.labels.length - 1)) + Math.max(step, 6) / 2;
      ctx.fillStyle = css("--sel"); ctx.fillRect(x0, A.top, x1 - x0, A.bottom - A.top);
    }
    ctx.restore();
  },
  afterDatasetsDraw(c, _a, o) {
    if (!o.on) return;
    const x = c.scales.x, A = c.chartArea, ctx = c.ctx;
    const act = c.tooltip && c.tooltip.getActiveElements();
    if (act && act.length && c.config.type === "line") {
      ctx.save(); ctx.strokeStyle = css("--axis"); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(act[0].element.x, A.top); ctx.lineTo(act[0].element.x, A.bottom); ctx.stroke(); ctx.restore();
    }
    if (!o.dots) return;
    ctx.save();
    // 선택 정책 세로선
    if (selPolicy) {
      const px = x.getPixelForValue(selPolicy.i);
      ctx.strokeStyle = dirColor(selPolicy.dir); ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(px, A.top + 10); ctx.lineTo(px, A.bottom); ctx.stroke(); ctx.setLineDash([]);
    }
    // 정책 점 (같은 달이 겹치면 아래로 쌓기)
    const used = {};
    c._policyDots = [];
    P.forEach(p => {
      if (p.i < 0 || p.i >= MN) return;
      const px = x.getPixelForValue(p.i), k = used[p.i] = (used[p.i] || 0) + 1;
      const py = A.top + 5 + (k - 1) * 9, r = selPolicy === p ? 5.5 : 3.6;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = dirColor(p.dir); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = css("--surface"); ctx.stroke();
      c._policyDots.push({ p, x: px, y: py });
    });
    ctx.restore();
  },
};
Chart.register(reBands);

function opts(extra = {}) {
  const ink2 = css("--ink2"), muted = css("--muted"), grid = css("--grid");
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: "index", intersect: false },
    layout: { padding: { right: extra.endLabels ? 52 : 8, top: extra.dots ? 6 : 0 } },
    onClick: (e, _els, c) => {
      if (c._policyDots) {
        const hit = c._policyDots.find(d => Math.abs(d.x - e.x) <= 6 && Math.abs(d.y - e.y) <= 6);
        if (hit) { selectPolicy(hit.p); return; }
      }
      const i = Math.round(c.scales.x.getValueForPixel(e.x));
      const y = extra.monthly ? Y0 + Math.floor(i / 12) : +String(c.data.labels[i]).slice(0, 4);
      if (y >= Y0 && y <= LASTY) setYear(y);
    },
    plugins: {
      legend: { display: !!extra.legend, position: "top", align: "start", labels: { color: ink2, boxWidth: 14, boxHeight: 3, font: { size: 12 } } },
      tooltip: { backgroundColor: css("--surface"), titleColor: css("--ink"), bodyColor: ink2, borderColor: css("--axis"),
        borderWidth: 1, padding: 10, boxWidth: 10, boxHeight: 3, callbacks: extra.tip || {} },
      reBands: { on: true, monthly: !!extra.monthly, govs: extra.govs !== false, govLabels: extra.govLabels !== false, dots: !!extra.dots },
      endLabels: { on: !!extra.endLabels },
    },
    scales: {
      x: Object.assign({ grid: { display: false }, border: { color: css("--axis") },
        ticks: { color: muted, maxRotation: 0, autoSkip: !extra.monthly, autoSkipPadding: 10, font: { size: 11 } } }, extra.x || {}),
      y: Object.assign({ grid: { color: grid }, border: { display: false }, ticks: { color: muted, font: { size: 11 } } }, extra.y || {}),
    },
  };
}
// 오른쪽 끝 라벨 (macro 페이지와 같은 방식)
Chart.register({
  id: "endLabels",
  afterDatasetsDraw(c, _a, o) {
    if (!o.on) return;
    const placed = [], ctx = c.ctx;
    c.data.datasets.forEach((ds, di) => {
      const meta = c.getDatasetMeta(di); if (meta.hidden || !ds.short || meta.type !== "line") return;
      let k = ds.data.length - 1; while (k >= 0 && ds.data[k] == null) k--;
      const pt = meta.data[k]; if (!pt) return;
      let y = pt.y; for (const p of placed) if (Math.abs(p - y) < 13) y = p + (y >= p ? 13 : -13);
      placed.push(y);
      ctx.save(); ctx.fillStyle = css("--ink2"); ctx.font = "600 11px system-ui, sans-serif"; ctx.textBaseline = "middle";
      ctx.fillText(ds.short, pt.x + 6, y); ctx.restore();
    });
  },
});
const line = (label, short, data, color, more = {}) => Object.assign({ label, short, data, borderColor: color, backgroundColor: color,
  borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, pointHoverBorderWidth: 2, pointHoverBorderColor: css("--surface"), tension: 0, spanGaps: true }, more);

// 월간 x축: 해마다(좁으면 2년마다) 1월에만 연도 표시
const monthTicks = { callback: (v, i) => { const l = MONTHS[i]; if (!l || !l.endsWith(".01")) return "";
  const y = +l.slice(0, 4), every = innerWidth < 700 ? 5 : 2; return y % every === 0 ? String(y) : ""; } };

// ── ① 월간 지수 ───────────────────────────────
const REG = [["서울", "서울", "--s2", true], ["강남11개구", "강남11", "--s8", false], ["강북14개구", "강북14", "--s4", false],
  ["수도권", "수도권", "--s7", false], ["전국", "전국", "--s1", true], ["6개광역시", "6광역시", "--s3", true]];
const regOn = Object.fromEntries(REG.map(r => [r[0], r[3]]));
function buildPx() {
  const raw = document.getElementById("rawIdx").checked;
  const ds = REG.map(([k, n, c]) => line(n, n, raw ? PX[k] : yoyMonth(k), css(c), { hidden: !regOn[k] }));
  return new Chart(document.getElementById("cPx"), {
    type: "line", data: { labels: MONTHS, datasets: ds },
    options: opts({ monthly: true, dots: true, endLabels: true,
      x: { ticks: Object.assign({ color: css("--muted"), maxRotation: 0, autoSkip: false, font: { size: 11 } }, monthTicks) },
      y: raw ? { type: "logarithmic", ticks: { color: css("--muted"), callback: v => [10, 20, 30, 50, 70, 100, 150].includes(v) ? v : "" } }
             : { suggestedMin: -10, suggestedMax: 20, ticks: { color: css("--muted"), callback: v => v + "%" } },
      tip: {
        title: t => MONTHS[t[0].dataIndex] + (govOf(MONTHS[t[0].dataIndex].replace(".", "-")) ? " · " + govOf(MONTHS[t[0].dataIndex].replace(".", "-")).name + " 정부" : ""),
        label: t => raw ? ` ${t.dataset.label}: ${fmt(t.raw, 1)}` : ` ${t.dataset.label}: ${sgn(t.raw)} (전년동월비)`,
        afterBody: t => P.filter(p => p.i === t[0].dataIndex).map(p => `● ${DIR[p.dir][0]} · ${p.title}`),
      } }),
  });
}
function regToggles() {
  const el = document.getElementById("regToggles"); el.innerHTML = "";
  REG.forEach(([k, n, c]) => {
    const b = document.createElement("button");
    b.className = regOn[k] ? "on" : ""; b.setAttribute("aria-pressed", regOn[k]);
    b.innerHTML = `<i style="background:var(${c})"></i>${n}`;
    b.onclick = () => { regOn[k] = !regOn[k]; regToggles(); charts.px.destroy(); charts.px = buildPx(); };
    el.appendChild(b);
  });
}

// ── ② 연간 상승률 + 기준금리, 정책 방향 막대 ──────
function buildYear() {
  const labels = YEARS.map(ylabel);
  return new Chart(document.getElementById("cYear"), {
    data: { labels, datasets: [
      { type: "bar", label: "서울 상승률", data: YEARS.map(y => yoyYear("서울", y)), backgroundColor: css("--s2"), borderRadius: 3, barPercentage: .8, categoryPercentage: .8, yAxisID: "y" },
      { type: "bar", label: "전국 상승률", data: YEARS.map(y => yoyYear("전국", y)), backgroundColor: css("--s1"), borderRadius: 3, barPercentage: .8, categoryPercentage: .8, yAxisID: "y" },
      line("한국 기준금리(우)", "", YEARS.map(rateOf), css("--ink2"), { type: "line", yAxisID: "y2", borderWidth: 2, pointRadius: 2 }),
    ] },
    options: Object.assign(opts({ legend: true,
      y: { ticks: { color: css("--muted"), callback: v => v + "%" } },
      tip: { label: t => t.dataset.yAxisID === "y2" ? ` 기준금리: ${fmt(t.raw, 2)}%` : ` ${t.dataset.label}: ${sgn(t.raw)}` } })),
  });
}
// 기준금리 오른쪽 축 붙이기
function withRateAxis(ch) {
  ch.options.scales.y2 = { position: "right", min: 0, suggestedMax: 6, grid: { display: false }, border: { display: false },
    ticks: { color: css("--muted"), font: { size: 11 }, callback: v => v + "%" }, title: { display: true, text: "기준금리", color: css("--muted"), font: { size: 11 } } };
  ch.update(); return ch;
}
function buildDir() {
  const cnt = d => YEARS.map(y => P.filter(p => p.y === y && p.dir === d).length);
  const neg = a => a.map(v => -v);
  const ch = new Chart(document.getElementById("cDir"), {
    type: "bar",
    data: { labels: YEARS.map(ylabel), datasets: [
      { label: "규제 강화", data: cnt("tight"), backgroundColor: dirColor("tight"), stack: "s", borderRadius: 2 },
      { label: "공급", data: cnt("supply"), backgroundColor: dirColor("supply"), stack: "s", borderRadius: 2 },
      { label: "완화·부양", data: neg(cnt("ease")), backgroundColor: dirColor("ease"), stack: "s", borderRadius: 2 },
    ] },
    options: opts({ legend: true, govLabels: false, x: { stacked: true }, y: { stacked: true, ticks: { color: css("--muted"), stepSize: 2, callback: v => Math.abs(v) } },
      tip: { label: t => t.raw ? ` ${t.dataset.label}: ${Math.abs(t.raw)}건` : null } }),
  });
  ch.options.scales.x.stacked = true; ch.update();
  return ch;
}

// ── ③ 매수우위 ────────────────────────────────
function buildBs() {
  return new Chart(document.getElementById("cBs"), {
    type: "line",
    data: { labels: MONTHS, datasets: [
      line("서울", "서울", BS["서울"], css("--s2")), line("전국", "전국", BS["전국"], css("--s1")),
      line("기준 100", "", MONTHS.map(() => 100), css("--axis"), { borderDash: [4, 4], borderWidth: 1, pointHoverRadius: 0 }),
    ] },
    options: opts({ monthly: true, dots: true, endLabels: true,
      x: { ticks: Object.assign({ color: css("--muted"), maxRotation: 0, autoSkip: false, font: { size: 11 } }, monthTicks) },
      y: { suggestedMin: 0, ticks: { color: css("--muted") } },
      tip: { title: t => MONTHS[t[0].dataIndex], filter: t => t.datasetIndex < 2, label: t => ` ${t.dataset.label}: ${fmt(t.raw, 1)}`,
        afterBody: t => P.filter(p => p.i === t[0].dataIndex).map(p => `● ${p.title}`) } }),
  });
}

function buildAll() {
  Object.values(charts).forEach(c => c.destroy());
  charts.px = buildPx(); charts.year = withRateAxis(buildYear()); charts.dir = buildDir(); charts.bs = buildBs();
}

// ── 연도 선택 → 상세 패널, 연표, 표 ─────────────
function setYear(y, keepPolicy) {
  selYear = y;
  if (!keepPolicy && selPolicy && selPolicy.y !== y) selPolicy = null;
  document.getElementById("year").value = y;
  document.getElementById("yearOut").textContent = ylabel(y);
  const g = govOf(`${y}-06`) || govOf(`${y}-12`);
  const ps = P.filter(p => p.y === y);
  const stat = (name, v, u = "%", d = 1) => `<div class="stat">${name}<span class="${u === "%" ? cls(v) : ""}">${u === "%" ? sgn(v, d) : fmt(v, d)}</span></div>`;
  document.getElementById("detail").innerHTML = `
    <div class="lines">
      <div class="ttl">${RE_YEAR[y] || ""}<span class="gov-chip">${g ? g.name + " 정부" : ""}</span></div>
      ${ps.length ? `<ul class="plist">${ps.map(p => `<li><span class="m">${+p.d.slice(5)}월</span><i class="t pd-${p.dir}">${DIR[p.dir][0]}</i> <b>${p.title}</b> — ${p.body}</li>`).join("")}</ul>`
                  : `<p class="none">이 해에 정리한 큰 정책은 없어요.</p>`}
    </div>
    <div class="stats">
      ${stat("서울", yoyYear("서울", y))}${stat("강남11개구", yoyYear("강남11개구", y))}
      ${stat("수도권", yoyYear("수도권", y))}${stat("전국", yoyYear("전국", y))}
      ${stat("6개광역시", yoyYear("6개광역시", y))}
      <div class="stat">서울 매수우위<span>${fmt(bsAvg("서울", y), 1)}</span></div>
      <div class="stat">한국 기준금리<span>${fmt(rateOf(y), 2)}%</span></div>
      <div class="stat">정책 수<span>${ps.length}건</span></div>
    </div>`;
  document.querySelectorAll(".tl-year").forEach(el => el.classList.toggle("on", +el.dataset.y === y));
  document.querySelectorAll(".pc").forEach(el => el.classList.toggle("on", selPolicy && el.dataset.k === selPolicy.d + selPolicy.title));
  document.querySelectorAll("#dataTable tbody tr, #effTable tbody tr").forEach(r => r.classList.toggle("on", +r.dataset.y === y));
  pickNote();
  Object.values(charts).forEach(c => c.draw());
}
function selectPolicy(p) { selPolicy = p; setYear(p.y, true); }
function pickNote() {
  const el = document.getElementById("pickNote");
  if (!selPolicy) { el.innerHTML = "점이나 아래 연표 카드를 누르면 그 정책 전후 집값 변화가 여기에 나와요."; return; }
  const p = selPolicy, i = p.i;
  el.innerHTML = `<i class="t pd-${p.dir}">${DIR[p.dir][0]}</i> <b>${p.d.replace("-", ".")} ${p.title}</b> — 서울 앞 12개월 <span class="${cls(chg("서울", i - 12, i))}">${sgn(chg("서울", i - 12, i))}</span>,
    뒤 6개월 <span class="${cls(chg("서울", i, i + 6))}">${sgn(chg("서울", i, i + 6))}</span>, 뒤 12개월 <span class="${cls(chg("서울", i, i + 12))}">${sgn(chg("서울", i, i + 12))}</span>
    · 전국 뒤 12개월 <span class="${cls(chg("전국", i, i + 12))}">${sgn(chg("전국", i, i + 12))}</span>`;
}

// ── ④ 연표 ───────────────────────────────────
const dirOn = { tight: true, ease: true, supply: true, event: true };
function dirToggles() {
  const el = document.getElementById("dirToggles"); el.innerHTML = "";
  Object.entries(DIR).forEach(([k, [n, c]]) => {
    const b = document.createElement("button");
    b.className = dirOn[k] ? "on" : ""; b.setAttribute("aria-pressed", dirOn[k]);
    b.innerHTML = `<i style="background:var(${c})"></i>${n} ${P.filter(p => p.dir === k).length}`;
    b.onclick = () => { dirOn[k] = !dirOn[k]; dirToggles(); timeline(); setYear(selYear, true); };
    el.appendChild(b);
  });
}
function timeline() {
  const el = document.getElementById("timeline"); el.innerHTML = "";
  for (const y of YEARS) {
    const ps = P.filter(p => p.y === y && dirOn[p.dir]); if (!ps.length) continue;
    const s = yoyYear("서울", y), row = document.createElement("div");
    row.className = "tl-year"; row.dataset.y = y;
    row.innerHTML = `<div class="yh">${ylabel(y)}<small>${(govOf(ps[0].d) || {}).name || ""}</small><span class="chg ${cls(s)}">서울 ${sgn(s)}</span></div><div class="tl-cards"></div>`;
    const box = row.querySelector(".tl-cards");
    ps.forEach(p => {
      const b = document.createElement("button");
      b.className = "pc " + p.dir; b.dataset.k = p.d + p.title;
      b.innerHTML = `<div class="top"><span>${p.d.replace("-", ".")} · ${p.cat}</span><span>${DIR[p.dir][0]}</span></div><div class="tt"></div><p></p>`;
      b.querySelector(".tt").textContent = p.title; b.querySelector("p").textContent = p.body;
      b.onclick = () => { selectPolicy(p); document.getElementById("cPx").scrollIntoView({ behavior: "smooth", block: "center" }); };
      box.appendChild(b);
    });
    el.appendChild(row);
  }
}

// ── ⑤ 정책 전후 효과 ──────────────────────────
const EFF_REG = ["서울", "강남11개구", "수도권", "전국", "6개광역시"];
const effSel = document.getElementById("effReg");
EFF_REG.forEach(r => effSel.add(new Option(r, r)));
function effects() {
  const reg = effSel.value;
  const rows = P.filter(p => p.dir === "tight" || p.dir === "ease").map(p => ({ p,
    pre: chg(reg, p.i - 12, p.i), a6: chg(reg, p.i, p.i + 6), a12: chg(reg, p.i, p.i + 12) }));
  let h = `<thead><tr><th>발표</th><th>정책</th><th>앞 12개월</th><th>뒤 6개월</th><th>뒤 12개월</th><th>꺾였나</th></tr></thead><tbody>`;
  rows.forEach(r => {
    const turned = r.pre == null || r.a12 == null ? "–" :
      r.p.dir === "tight" ? (r.a12 < r.pre / 2 ? "둔화" : "계속 상승") : (r.a12 > r.pre ? "반등" : "계속 약세");
    h += `<tr data-y="${r.p.y}"><td>${r.p.d.replace("-", ".")}</td><td class="tt"><span class="dot" style="background:${dirColor(r.p.dir)}"></span>${r.p.title}</td>
      <td class="${cls(r.pre)}">${sgn(r.pre)}</td><td class="${cls(r.a6)}">${sgn(r.a6)}</td><td class="${cls(r.a12)}">${sgn(r.a12)}</td><td>${turned}</td></tr>`;
  });
  document.getElementById("effTable").innerHTML = h + "</tbody>";
  document.querySelectorAll("#effTable tbody tr").forEach(tr => tr.onclick = () => setYear(+tr.dataset.y));

  const avg = a => { const s = a.filter(v => v != null); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; };
  const T = rows.filter(r => r.p.dir === "tight" && r.a12 != null), E = rows.filter(r => r.p.dir === "ease" && r.a12 != null);
  const up12 = T.filter(r => r.a12 > 0).length;
  const span = v => `<b class="${cls(v)}">${sgn(v)}</b>`;
  document.getElementById("effInsight").innerHTML = `<h4>읽는 법 (${reg}, 뒤 12개월이 지난 정책 기준)</h4><ul>
    <li>규제 강화 ${T.length}건: 발표 전 12개월 평균 ${span(avg(T.map(r => r.pre)))} → 발표 후 12개월 평균 ${span(avg(T.map(r => r.a12)))}.
      ${T.length}건 중 <b>${up12}건은 발표 1년 뒤에도 올라 있었어요</b> — 규제는 이미 오르고 있을 때 나왔고, 대개 바로 꺾지 못했어요.</li>
    <li>완화·부양 ${E.length}건: 발표 전 평균 ${span(avg(E.map(r => r.pre)))} → 발표 후 평균 ${span(avg(E.map(r => r.a12)))}.
      하락기(2008~13)의 완화는 1~2년 동안 효과가 약했고, 금리가 내려간 뒤(2014~15)에야 회복이 시작됐어요.</li>
    <li>정책은 시장을 따라 나온 '결과'이기도 해서, 이 표는 인과가 아니라 <b>발표 시점의 온도</b>를 보여줘요. 방향을 바꾼 큰 변수는 ② 차트의 금리였어요.</li>
  </ul>`;
}

// ── ⑥ 정권별 ─────────────────────────────────
function govTable() {
  let h = `<thead><tr><th>정부</th><th>기간(데이터)</th><th>서울</th><th>강남11</th><th>수도권</th><th>전국</th><th>6광역시</th><th>서울 연율</th><th>기준금리(연말)</th><th>규제</th><th>완화</th><th>공급</th></tr></thead><tbody>`;
  GOVS.forEach(g => {
    const i0 = Math.max(0, mIdx(g.from) - 1), i1 = Math.min(MN - 1, mIdx(g.to));
    if (i1 <= i0) return;
    const n = i1 - i0, c = r => chg(r, i0, i1);
    const ann = (Math.pow(1 + c("서울") / 100, 12 / n) - 1) * 100;
    // 임기 안에 연말이 들어간 해의 기준금리만
    const ys = []; for (let y = Y0; y <= LASTY; y++) if (`${y}-12` >= g.from && (`${y}-12` <= g.to || y === LASTY) && rateOf(y) != null) ys.push(rateOf(y));
    const k = d => P.filter(p => p.d >= g.from && p.d <= g.to && p.dir === d).length;
    h += `<tr><td>${g.name}</td><td>${MONTHS[i0]}~${i1 === MN - 1 ? MONTHS[i1] + "*" : MONTHS[i1]}</td>` +
      ["서울", "강남11개구", "수도권", "전국", "6개광역시"].map(r => `<td class="${cls(c(r))}">${sgn(c(r))}</td>`).join("") +
      `<td class="${cls(ann)}">${sgn(ann)}</td><td>${fmt(Math.min(...ys), 2)}~${fmt(Math.max(...ys), 2)}%</td><td>${k("tight")}</td><td>${k("ease")}</td><td>${k("supply")}</td></tr>`;
  });
  document.getElementById("govTable").innerHTML = h + "</tbody>";
}

// ── 데이터 표 ────────────────────────────────
function dataTable() {
  const R = ["서울", "강남11개구", "강북14개구", "수도권", "전국", "6개광역시"];
  let h = `<thead><tr><th>연도</th>${R.map(r => `<th>${r}</th>`).join("")}<th>서울 지수</th><th>서울 매수우위</th><th>기준금리</th><th>정책</th></tr></thead><tbody>`;
  YEARS.forEach(y => {
    let i = (y - Y0) * 12 + 11; if (i >= MN) i = MN - 1;
    h += `<tr data-y="${y}"><td>${ylabel(y)}</td>${R.map(r => { const v = yoyYear(r, y); return `<td class="${cls(v)}">${sgn(v)}</td>`; }).join("")}` +
      `<td>${fmt(PX["서울"][i], 1)}</td><td>${fmt(bsAvg("서울", y), 1)}</td><td>${fmt(rateOf(y), 2)}%</td><td>${P.filter(p => p.y === y).length}</td></tr>`;
  });
  document.getElementById("dataTable").innerHTML = h + "</tbody>";
}

// ── 전망 박스 숫자 채우기 ─────────────────────
function outlookNums() {
  const L = MN - 1, lm = LASTM;
  const s = chg("서울", L - 12, L), g = chg("강남11개구", L - 12, L), n = chg("전국", L - 12, L), l6 = chg("6개광역시", L - 12, L);
  const bsNow = BS["서울"][L], bsMax = Math.max(...BS["서울"].slice(L - 11, L + 1).filter(v => v != null));
  document.getElementById("oSeoul").textContent = `${lm} 전년동월비 서울 ${sgn(s)} · 강남11 ${sgn(g)}`;
  document.getElementById("oBs").textContent = `${lm} 서울 매수우위 ${fmt(bsNow, 1)} · 최근 1년 고점 ${fmt(bsMax, 1)}`;
  document.getElementById("oLocal").textContent = `${lm} 전년동월비 전국 ${sgn(n)} · 6개광역시 ${sgn(l6)}`;
}

// ── 시작 ─────────────────────────────────────
const yr = document.getElementById("year"); yr.min = Y0; yr.max = LASTY;
regToggles(); dirToggles(); timeline(); effects(); govTable(); dataTable(); outlookNums(); buildAll(); setYear(selYear);
yr.addEventListener("input", e => setYear(+e.target.value));
document.getElementById("rawIdx").addEventListener("change", () => { charts.px.destroy(); charts.px = buildPx(); });
effSel.addEventListener("change", () => { effects(); setYear(selYear, true); });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { buildAll(); timeline(); effects(); setYear(selYear, true); });
// 폭이 바뀔 때만 다시 그림 (모바일 주소창 높이 변화는 무시)
let rz, lastW = innerWidth;
addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => {
  if ((innerWidth < 700) !== (lastW < 700)) { buildAll(); setYear(selYear, true); } lastW = innerWidth; }, 250); });
})();

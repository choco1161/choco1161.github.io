// 한미 금리 30년 — 차트 그리기
(() => {
const Y = MACRO_YEARS, M = MACRO, N = Y.length;
const LAST = Y[N - 1];
const label = y => (y === LAST ? `${y}*` : `${y}`);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmt = (v, d = 2) => v == null ? "–" : Number(v).toLocaleString("ko-KR", { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (a, b) => (a == null || b == null) ? null : (a / b - 1) * 100;
let selYear = 2008;
const charts = [];

// ── 공통 플러그인 ─────────────────────────────
// 선택 연도 강조 띠 + 호버 세로선 + 오른쪽 끝 라벨 + IMF 전망 영역
const yearBand = {
  id: "yearBand",
  beforeDatasetsDraw(c, _a, o) {
    const x = c.scales.x, area = c.chartArea, ctx = c.ctx;
    if (o.projFrom != null) {
      const i = c.data.labels.indexOf(String(o.projFrom));
      if (i >= 0) {
        const x0 = x.getPixelForValue(i) - (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2;
        ctx.save(); ctx.fillStyle = css("--grid"); ctx.globalAlpha = .55;
        ctx.fillRect(x0, area.top, area.right - x0, area.bottom - area.top);
        ctx.globalAlpha = 1; ctx.fillStyle = css("--muted"); ctx.font = "12px system-ui, sans-serif";
        ctx.fillText("IMF 전망", x0 + 6, area.top + 14); ctx.restore();
      }
    }
    const i = c.data.labels.findIndex(l => parseInt(l) === selYear);
    if (i < 0) return;
    const step = c.data.labels.length > 1 ? x.getPixelForValue(1) - x.getPixelForValue(0) : 20;
    const cx = x.getPixelForValue(i);
    ctx.save(); ctx.fillStyle = css("--sel");
    ctx.fillRect(cx - Math.max(step, 8) / 2, area.top, Math.max(step, 8), area.bottom - area.top);
    ctx.restore();
  },
  afterDatasetsDraw(c, _a, o) {
    const ctx = c.ctx, area = c.chartArea;
    const act = c.tooltip && c.tooltip.getActiveElements();
    if (act && act.length && c.config.type === "line") {
      const px = act[0].element.x;
      ctx.save(); ctx.strokeStyle = css("--axis"); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, area.top); ctx.lineTo(px, area.bottom); ctx.stroke(); ctx.restore();
    }
    if (!o.endLabels) return;
    const placed = [];
    c.data.datasets.forEach((ds, di) => {
      const meta = c.getDatasetMeta(di);
      if (meta.hidden || ds.hidden || !ds.short) return;
      let k = ds.data.length - 1; while (k >= 0 && ds.data[k] == null) k--;
      if (k < 0) return;
      const pt = meta.data[k]; if (!pt) return;
      let y = pt.y;
      for (const p of placed) if (Math.abs(p - y) < 13) y = p + (y >= p ? 13 : -13);
      placed.push(y);
      ctx.save(); ctx.fillStyle = css("--ink2"); ctx.font = "600 11px system-ui, sans-serif";
      ctx.textBaseline = "middle"; ctx.fillText(ds.short, pt.x + 6, y); ctx.restore();
    });
  },
};
Chart.register(yearBand);

function baseOpts(extra = {}) {
  const ink2 = css("--ink2"), muted = css("--muted"), grid = css("--grid");
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: "index", intersect: false },
    layout: { padding: { right: extra.endLabels ? 58 : 8 } },
    onClick: (e, _els, c) => {
      const i = c.scales.x.getValueForPixel(e.x);
      const y = parseInt(c.data.labels[Math.round(i)]);
      if (y >= Y[0] && y <= LAST) setYear(y);
    },
    plugins: {
      legend: { position: "top", align: "start", labels: { color: ink2, boxWidth: 14, boxHeight: 3, usePointStyle: false, font: { size: 12 } } },
      tooltip: {
        backgroundColor: css("--surface"), titleColor: css("--ink"), bodyColor: ink2,
        borderColor: css("--axis"), borderWidth: 1, padding: 10, boxWidth: 10, boxHeight: 3,
        callbacks: extra.tip || {},
      },
      yearBand: { endLabels: !!extra.endLabels, projFrom: extra.projFrom },
    },
    scales: {
      x: { grid: { display: false }, border: { color: css("--axis") },
           ticks: { color: muted, maxRotation: 0, autoSkipPadding: 10, font: { size: 11 } } },
      y: Object.assign({ grid: { color: grid }, border: { display: false },
           ticks: { color: muted, font: { size: 11 } } }, extra.y || {}),
    },
  };
}
const line = (lab, short, data, color, more = {}) => Object.assign({
  label: lab, short, data, borderColor: color, backgroundColor: color,
  borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2,
  pointHoverBorderColor: css("--surface"), tension: 0, spanGaps: true,
}, more);

// ── 차트 만들기 ───────────────────────────────
const labels = Y.map(label);
function build() {
  charts.splice(0).forEach(c => c.destroy());
  const s1 = css("--s1"), s2 = css("--s2");
  const show10 = document.getElementById("show10y").checked;

  // ① 금리
  charts.push(new Chart(document.getElementById("cRates"), {
    type: "line",
    data: { labels, datasets: [
      line("미국 정책금리", "미국", M.usRate, s1),
      line("한국 정책금리", "한국", M.krRate, s2),
      line("미국 10년물", "미 10Y", M.us10y, s1, { borderDash: [5, 4], hidden: !show10 }),
      line("한국 10년물", "한 10Y", M.kr10y, s2, { borderDash: [5, 4], hidden: !show10 }),
    ]},
    options: baseOpts({ endLabels: true, y: { suggestedMin: 0, ticks: { color: css("--muted"), callback: v => v + "%" } },
      tip: { label: t => ` ${t.dataset.label}: ${fmt(t.raw)}%` } }),
  }));
  charts[0].options.scales.y.max = show10 ? 10 : undefined;

  // ② 금리차 (막대, 부호별 색)
  const spread = Y.map((_, i) => M.krRate[i] - M.usRate[i]);
  charts.push(new Chart(document.getElementById("cSpread"), {
    type: "bar",
    data: { labels, datasets: [{ label: "한국 − 미국", data: spread.map(v => +v.toFixed(2)),
      backgroundColor: spread.map(v => v >= 0 ? css("--pos") : css("--neg")), borderRadius: 4, borderSkipped: false,
      barPercentage: .78, categoryPercentage: .9 }] },
    options: Object.assign(baseOpts({ y: { max: 6, min: -3, ticks: { color: css("--muted"), callback: v => (v > 0 ? "+" : "") + v } },
      tip: { label: t => ` 금리차: ${t.raw > 0 ? "+" : ""}${fmt(t.raw)}%p ${t.raw < 0 ? "(미국이 더 높음)" : ""}` } }),
      { interaction: { mode: "index", intersect: false } }),
  }));
  charts[1].options.plugins.legend.display = false;

  // 원/달러, 달러인덱스
  charts.push(new Chart(document.getElementById("cKrw"), {
    type: "line", data: { labels, datasets: [line("원/달러", "", M.krw, s2)] },
    options: baseOpts({ tip: { label: t => ` 원/달러: ${fmt(t.raw, 0)}원` } }),
  }));
  charts[2].options.plugins.legend.display = false;
  charts.push(new Chart(document.getElementById("cDxy"), {
    type: "line", data: { labels, datasets: [line("달러인덱스", "", M.dxy, s1)] },
    options: baseOpts({ tip: { label: t => ` DXY: ${fmt(t.raw, 1)}` } }),
  }));
  charts[3].options.plugins.legend.display = false;

  // ③ 주가
  charts.push(buildStocks());

  // ⑥ IMF 물가
  charts.push(buildCpi());
  charts.forEach(c => c.update());
}

function buildStocks() {
  const raw = document.getElementById("rawStocks").checked;
  const base = +document.getElementById("baseYear").value;
  const bi = Y.indexOf(base);
  const idx = arr => arr.map(v => (v == null || arr[bi] == null) ? null : +(v / arr[bi] * 100).toFixed(1));
  const S = [["다우", M.dow, css("--s1")], ["나스닥", M.nasdaq, css("--s7")], ["코스피", M.kospi, css("--s2")], ["코스닥", M.kosdaq, css("--s4")]];
  const ds = S.map(([n, a, c]) => Object.assign(line(n, n, raw ? a : idx(a), c), { raw: a }));
  return new Chart(document.getElementById("cStocks"), {
    type: "line", data: { labels, datasets: ds },
    options: baseOpts({ endLabels: true,
      y: { type: "logarithmic", ticks: { color: css("--muted"), callback: v => {
        const s = String(v)[0]; return (s === "1" || s === "2" || s === "5") ? Number(v).toLocaleString("ko-KR") : ""; } } },
      tip: { label: t => {
        const r = t.dataset.raw[t.dataIndex];
        return raw ? ` ${t.dataset.label}: ${fmt(r, 0)}` : ` ${t.dataset.label}: ${fmt(t.raw, 0)} (지수 ${fmt(r, 0)})`; } } }),
  });
}

const CPI_SERIES = [
  ["USA", "미국", "--s1", true], ["KOR", "한국", "--s2", true], ["WEOWORLD", "세계", "--s3", true],
  ["ADVEC", "선진국", "--s4", false], ["CHN", "중국", "--s5", false], ["JPN", "일본", "--s6", false], ["EURO", "유로존", "--s7", false],
];
const cpiOn = Object.fromEntries(CPI_SERIES.map(s => [s[0], s[3]]));
function buildCpi() {
  const yrs = []; for (let y = 1980; y <= 2031; y++) yrs.push(String(y));
  const PROJ = 2026;
  const ds = CPI_SERIES.map(([k, n, c]) => line(n, n, yrs.map(y => IMF_CPI[k][y] ?? null), css(c), {
    hidden: !cpiOn[k], spanGaps: false,
    segment: { borderDash: s => (+yrs[s.p1DataIndex] > PROJ - 1 ? [5, 4] : undefined) },
  }));
  const ch = new Chart(document.getElementById("cCpi"), {
    type: "line", data: { labels: yrs, datasets: ds },
    options: baseOpts({ endLabels: true, projFrom: PROJ,
      y: { max: 20, min: -2, ticks: { color: css("--muted"), callback: v => v + "%" } },
      tip: {
        filter: t => !t.dataset.hidden,
        title: t => `${t[0].label}${+t[0].label >= PROJ ? " (IMF 전망)" : ""}`,
        label: t => ` ${t.dataset.label}: ${fmt(t.raw, 1)}%` } }),
  });
  ch.options.plugins.legend.display = false;
  ch.options.plugins.tooltip.filter = t => !t.dataset.hidden;
  return ch;
}
function cpiToggles() {
  const el = document.getElementById("cpiToggles"); el.innerHTML = "";
  CPI_SERIES.forEach(([k, n, c]) => {
    const b = document.createElement("button");
    b.className = cpiOn[k] ? "on" : ""; b.setAttribute("aria-pressed", cpiOn[k]);
    b.innerHTML = `<i style="background:var(${c})"></i>${n}`;
    b.onclick = () => { cpiOn[k] = !cpiOn[k]; cpiToggles(); const i = charts.length - 1; charts[i].destroy(); charts[i] = buildCpi(); };
    el.appendChild(b);
  });
}

// ── 연도 선택 → 상세 패널, 카드, 표 강조 ─────────
function setYear(y) {
  selYear = y;
  document.getElementById("year").value = y;
  document.getElementById("yearOut").textContent = label(y);
  const i = Y.indexOf(y), I = ISSUES[y] || {};
  const ch = (k, mode) => {
    const v = M[k][i], p = i > 0 ? M[k][i - 1] : null;
    if (v == null || p == null) return "";
    const d = mode === "pp" ? v - p : pct(v, p);
    const stock = ["dow", "nasdaq", "kospi"].includes(k);   // 주가만 상승=초록, 금리·환율은 중립색
    const cls = stock ? (d >= 0 ? "up" : "down") : "flat";
    return ` <em class="${cls}">${d >= 0 ? "▲" : "▼"}${fmt(Math.abs(d), mode === "pp" ? 2 : 1)}${mode === "pp" ? "%p" : "%"}</em>`;
  };
  const sp = M.krRate[i] - M.usRate[i];
  document.getElementById("detail").innerHTML = `
    <div class="lines">
      <div class="ttl"><i class="t ${I.tag}">${({crisis:"위기",tight:"긴축",ease:"완화",mixed:"혼조"})[I.tag] || ""}</i> ${I.title || ""}</div>
      <div><b>미국</b> ${I.us || ""}</div><div><b>한국</b> ${I.kr || ""}</div><div><b>시장</b> ${I.why || ""}</div>
    </div>
    <div class="stats">
      <div class="stat">미국 금리<span>${fmt(M.usRate[i])}%${ch("usRate", "pp")}</span></div>
      <div class="stat">한국 금리<span>${fmt(M.krRate[i])}%${ch("krRate", "pp")}</span></div>
      <div class="stat">금리차<span>${sp > 0 ? "+" : ""}${fmt(sp)}%p</span></div>
      <div class="stat">원/달러<span>${fmt(M.krw[i], 0)}${ch("krw")}</span></div>
      <div class="stat">달러인덱스<span>${fmt(M.dxy[i], 1)}${ch("dxy")}</span></div>
      <div class="stat">다우<span>${fmt(M.dow[i], 0)}${ch("dow")}</span></div>
      <div class="stat">나스닥<span>${fmt(M.nasdaq[i], 0)}${ch("nasdaq")}</span></div>
      <div class="stat">코스피<span>${fmt(M.kospi[i], 0)}${ch("kospi")}</span></div>
    </div>`;
  document.querySelectorAll(".issue").forEach(b => b.classList.toggle("on", +b.dataset.y === y));
  document.querySelectorAll("#dataTable tbody tr").forEach(r => r.classList.toggle("on", +r.dataset.y === y));
  charts.forEach(c => c.draw());
}

function issueCards() {
  const el = document.getElementById("issues");
  const TAG = { crisis: "위기", tight: "긴축", ease: "완화", mixed: "혼조" };
  for (const y of Y) {
    const I = ISSUES[y]; if (!I) continue;
    const b = document.createElement("button");
    b.className = "issue"; b.dataset.y = y;
    b.innerHTML = `<div class="yr">${label(y)}<i class="t ${I.tag}">${TAG[I.tag]}</i></div>
      <div class="tt"></div><p><b>美</b><span class="u"></span></p><p><b>韓</b><span class="k"></span></p><p><b>→</b><span class="w"></span></p>`;
    b.querySelector(".tt").textContent = I.title; b.querySelector(".u").textContent = I.us;
    b.querySelector(".k").textContent = I.kr; b.querySelector(".w").textContent = I.why;
    b.onclick = () => { setYear(y); window.scrollTo({ top: 0, behavior: "smooth" }); };
    el.appendChild(b);
  }
}

// ── 상관관계 ─────────────────────────────────
const VARS = [
  ["usRate", "미 정책금리", "pp"], ["krRate", "한 정책금리", "pp"], ["us10y", "미 10년물", "pp"], ["kr10y", "한 10년물", "pp"],
  ["krw", "원/달러", "pct"], ["dxy", "달러인덱스", "pct"], ["dow", "다우", "pct"], ["nasdaq", "나스닥", "pct"], ["kospi", "코스피", "pct"],
];
function series(k, mode, level) {
  const a = M[k];
  if (level) return a.slice(1);
  return a.slice(1).map((v, j) => (v == null || a[j] == null) ? null : (mode === "pp" ? v - a[j] : pct(v, a[j])));
}
function corr(a, b) {
  const x = [], y = [];
  a.forEach((v, i) => { if (v != null && b[i] != null) { x.push(v); y.push(b[i]); } });
  const n = x.length; if (n < 5) return null;
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; }
  return sxy / Math.sqrt(sx * sy);
}
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => "rgb(" + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",") + ")";
function renderCorr() {
  const level = document.getElementById("corrLevel").checked;
  // 1999년부터 (1997~98 외환위기 금리 폭등·폭락은 이상치라 제외)
  const S = VARS.map(([k, , m]) => series(k, m, level).slice(1));
  const pos = hex(css("--pos")), neg = hex(css("--neg")), mid = hex(css("--mid"));
  let h = `<thead><tr><th></th>${VARS.map(v => `<th>${v[1]}</th>`).join("")}</tr></thead><tbody>`;
  VARS.forEach((v, i) => {
    h += `<tr><th class="row">${v[1]}</th>`;
    VARS.forEach((w, j) => {
      const r = i === j ? 1 : corr(S[i], S[j]);
      if (r == null) { h += `<td>–</td>`; return; }
      const bg = r >= 0 ? mix(mid, pos, r) : mix(mid, neg, -r);
      const ink = Math.abs(r) > .55 ? "#ffffff" : css("--ink");
      h += `<td style="background:${bg};color:${ink}" title="${v[1]} × ${w[1]}: ${r.toFixed(2)}">${i === j ? "" : r.toFixed(2)}</td>`;
    });
    h += `</tr>`;
  });
  document.getElementById("corr").innerHTML = h + "</tbody>";

  const r = (a, b) => corr(S[VARS.findIndex(v => v[0] === a)], S[VARS.findIndex(v => v[0] === b)]);
  const word = v => { const a = Math.abs(v); const s = a >= .7 ? "강한" : a >= .4 ? "뚜렷한" : a >= .2 ? "약한" : "거의 없는";
    return a < .2 ? "관계 거의 없음" : `${s} ${v > 0 ? "같은 방향" : "반대 방향"}`; };
  const li = (a, b, name, hint) => { const v = r(a, b); return v == null ? "" :
    `<li>${name}: <b>${v.toFixed(2)}</b> (${word(v)}) — ${hint}</li>`; };
  document.getElementById("corrInsight").innerHTML = `<h4>읽는 법 (${level ? "수준" : "연간 변화"} 기준, 1999~2026)</h4><ul>
    ${li("usRate", "krRate", "미국 ↔ 한국 정책금리", level ? "금리 수준은 장기적으로 같이 오르내림" : "한은은 대체로 연준과 같은 방향 (2004·2014·2021처럼 엇갈린 해도 있음)")}
    ${li("us10y", "kr10y", "미 10년물 ↔ 한 10년물", "장기금리는 시장에서 바로 동조")}
    ${li("dxy", "krw", "달러인덱스 ↔ 원/달러", "글로벌 달러가 강해지면 원화도 약해짐")}
    ${li("krw", "kospi", "원/달러 ↔ 코스피", "환율이 오르는(원화 약세) 해에 코스피는 부진한 경향")}
    ${li("nasdaq", "kospi", "나스닥 ↔ 코스피", "한국 증시는 미국 기술주 흐름에 민감")}
    ${li("dow", "kospi", "다우 ↔ 코스피", "")}
  </ul>`.replace(" — </li>", "</li>");
}
function fxInsight() {
  const sp = Y.map((_, i) => M.krRate[i] - M.usRate[i]);
  const neg = Y.filter((_, i) => sp[i] < 0), negKrw = Y.map((_, i) => i).filter(i => sp[i] < 0).map(i => M.krw[i]);
  const posKrw = Y.map((_, i) => i).filter(i => sp[i] >= 0).map(i => M.krw[i]);
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const rKrwDxy = corr(series("krw", "pct").slice(1), series("dxy", "pct").slice(1));
  document.getElementById("fxInsight").innerHTML = `<h4>환율 포인트</h4><ul>
    <li>미국 금리가 더 높았던 해(${neg.length}년): 연말 환율 평균 <b>${fmt(avg(negKrw), 0)}원</b></li>
    <li>한국 금리가 같거나 높았던 해(${posKrw.length}년): 평균 <b>${fmt(avg(posKrw), 0)}원</b></li>
    <li>달러인덱스와 원/달러 연간 변화 상관 <b>${rKrwDxy.toFixed(2)}</b> — 원화 약세의 상당 부분은 '글로벌 달러 강세'</li>
    <li>위기의 해(1997·2008·2022)엔 금리차와 무관하게 환율이 급등</li></ul>`;
}

// ── 데이터 표 ────────────────────────────────
function dataTable() {
  const cols = [["usRate", "미 금리", 2], ["krRate", "한 금리", 2], ["us10y", "미 10Y", 2], ["kr10y", "한 10Y", 2],
    ["krw", "원/달러", 0], ["dxy", "DXY", 1], ["dow", "다우", 0], ["nasdaq", "나스닥", 0], ["kospi", "코스피", 0], ["kosdaq", "코스닥", 0]];
  let h = `<thead><tr><th>연도</th>${cols.map(c => `<th>${c[1]}</th>`).join("")}<th>美 물가</th><th>韓 물가</th></tr></thead><tbody>`;
  Y.forEach((y, i) => {
    h += `<tr data-y="${y}"><td>${label(y)}</td>${cols.map(([k, , d]) => `<td>${fmt(M[k][i], d)}</td>`).join("")}` +
      `<td>${fmt(IMF_CPI.USA[y], 1)}</td><td>${fmt(IMF_CPI.KOR[y], 1)}</td></tr>`;
  });
  document.getElementById("dataTable").innerHTML = h + "</tbody>";
}

// ── 시작 ─────────────────────────────────────
const sel = document.getElementById("baseYear");
Y.slice(0, -1).forEach(y => sel.add(new Option(y, y, y === 2000, y === 2000)));
document.getElementById("asof").textContent =
  `미 금리 ${MACRO_ASOF.usRate.slice(0, 7)}, 한 금리 ${MACRO_ASOF.krRate.slice(0, 7)}, 환율 ${MACRO_ASOF.krw}, 지수 ${MACRO_ASOF.kospi}`;
issueCards(); dataTable(); cpiToggles(); build(); renderCorr(); fxInsight(); setYear(selYear);

document.getElementById("year").addEventListener("input", e => setYear(+e.target.value));
document.getElementById("show10y").addEventListener("change", () => { build(); setYear(selYear); });
document.getElementById("rawStocks").addEventListener("change", () => { build(); setYear(selYear); });
sel.addEventListener("change", () => { build(); setYear(selYear); });
document.getElementById("corrLevel").addEventListener("change", renderCorr);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { build(); renderCorr(); setYear(selYear); });
})();

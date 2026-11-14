// 환율 여행 나침반 — data/travel/travel.json (scripts/fetch_travel.py)
//  물가 반영 지수: 매달 (원/현지통화) × 현지 물가 ÷ 한국 물가 = 실질 환율 → 기준 기간 평균과 비교
(() => {
const $ = id => document.getElementById(id);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmt = (v, d = 0) => v == null || !isFinite(v) ? "–" : Number(v).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
const kst = iso => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const mi = ym => +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1);          // "2026-11" → 월 번호
const ymOf = t => `${Math.floor(t / 12)}.${String(t % 12 + 1).padStart(2, "0")}`;
const tone = x => (x >= 2 ? "good" : x <= -2 ? "bad" : "flat");
const verdict = x => (x >= 15 ? "매우 유리" : x >= 5 ? "유리" : x > -5 ? "평소 수준" : x > -15 ? "불리" : "매우 불리");
const pctTxt = x => (Math.abs(x) < 0.05 ? "평소와 같음" : `${fmt(Math.abs(x), 1)}% ${x >= 0 ? "저렴" : "비쌈"}`);
const sgn = x => (Math.abs(x) < 0.05 ? "" : x >= 0 ? "+" : "−");
// 은/는: 이름의 마지막 한글 글자에 받침이 있으면 "은"
const topic = name => { const h = [...name].filter(c => c >= "가" && c <= "힣").pop(); return h && (h.charCodeAt(0) - 0xAC00) % 28 ? "은" : "는"; };

let D, base = 120, sortKey = "real", region = "전체", sel = null, chart = null;
const params = new URLSearchParams(location.search);
try { const s = JSON.parse(localStorage.getItem("fx-compass") || "{}"); base = s.base || base; sortKey = s.sort || sortKey; } catch (e) {}

fetch("../../data/travel/travel.json", { cache: "no-cache" })
  .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
  .then(d => { D = d; init(); })
  .catch(() => { $("loading").hidden = true; $("failed").hidden = false; });

// ── 물가: IMF 연평균 상승률 → 연도 지수(그 해 7월 값으로 봄) → 월별 로그 선형 보간 ──
const cpiCache = {};
function cpiFn(code) {
  if (cpiCache[code]) return cpiCache[code];
  const row = D.cpi[code] || {}, ys = Object.keys(row).map(Number).sort((a, b) => a - b);
  const pts = []; let lv = 0;
  ys.forEach((y, i) => { if (i > 0) lv += Math.log(1 + row[y] / 100); pts.push([y * 12 + 6, lv]); });
  return (cpiCache[code] = t => {
    if (pts.length < 2) return null;
    let k = 0; while (k < pts.length - 2 && t > pts[k + 1][0]) k++;
    const [t0, a] = pts[k], [t1, b] = pts[k + 1];
    return Math.exp(a + (b - a) * (t - t0) / (t1 - t0));
  });
}

// 여행지 하나의 지표 계산
function calc(d) {
  const s = D.fx[d.cur], nw = D.now[d.cur];
  if (!s || !nw || !D.cpi[d.imf] || !D.cpi.KOR) return null;
  const cd = cpiFn(d.imf), ck = cpiFn("KOR");
  const ts = s.m.map(mi), last = ts[ts.length - 1];
  const rer = ts.map((t, i) => s.c[i] * cd(t) / ck(t));
  const win = ts.map((t, i) => i).filter(i => ts[i] > last - base);
  const avgR = win.reduce((a, i) => a + rer[i], 0) / win.length;
  const avgF = win.reduce((a, i) => a + s.c[i], 0) / win.length;
  const tNow = mi(nw.time.slice(0, 7));
  const rNow = nw.rate * cd(tNow) / ck(tNow);
  const i12 = ts.indexOf(tNow - 12);
  return {
    d, s, ts, rer, avgR, avgF, from: ts[win[0]],
    rate: nw.rate * d.unit, time: nw.time,
    real: (1 - rNow / avgR) * 100,
    nom: (1 - nw.rate / avgF) * 100,
    yoy: i12 >= 0 ? (1 - rNow / rer[i12]) * 100 : null,
    rate12: i12 >= 0 ? s.c[i12] * d.unit : null,
    infl: (cd(tNow) / cd(tNow - 12) - 1) * 100, inflK: (ck(tNow) / ck(tNow - 12) - 1) * 100,
  };
}

function init() {
  $("loading").hidden = true; $("app").hidden = false;
  const regions = ["전체", ...new Set(D.dest.map(d => d.region))];
  $("regions").innerHTML = regions.map(r => `<button type="button" data-v="${r}">${r}</button>`).join("");
  $("regions").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { region = b.dataset.v; render(); } });
  $("base").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { base = +b.dataset.v; save(); render(); } });
  $("sort").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { sortKey = b.dataset.v; save(); render(); } });
  const pick = e => { const b = e.target.closest("[data-id]"); if (b) { select(b.dataset.id, true); } };
  $("rank").addEventListener("click", pick); $("top3").addEventListener("click", pick);
  sel = (params.get("d") || "").toUpperCase() || null;

  const bad = Object.entries(D.status || {}).filter(([, v]) => v !== "ok").map(([k]) => k);
  $("src").innerHTML = `출처: 환율 ${D.source.fx}, 물가 ${D.source.cpi} · 마지막 수집 ${kst(D.updated)} (한국시간)` +
    (bad.length ? ` · <b>${bad.join(", ")}</b>은 이번 수집에 실패해 이전 값을 써요` : "") +
    ` · 참고용 지표이며 여행 경비 전체(항공·숙박)를 뜻하지 않아요.`;
  render();
}
function save() { try { localStorage.setItem("fx-compass", JSON.stringify({ base, sort: sortKey })); } catch (e) {} }

function render() {
  document.querySelectorAll("#base button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.v === base)));
  document.querySelectorAll("#sort button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === sortKey)));
  document.querySelectorAll("#regions button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === region)));

  const all = D.dest.map(calc).filter(Boolean);
  const byReal = [...all].sort((a, b) => b.real - a.real);
  const baseTxt = base === 120 ? "10년" : "5년";

  $("top3").innerHTML = byReal.slice(0, 3).map((x, i) => `
    <button type="button" class="tcard" data-id="${x.d.id}">
      <span class="rk">${i + 1}위</span>
      <div class="cc big-cc" aria-hidden="true">${x.d.id}</div>
      <div class="nm">${x.d.name}</div>
      <div class="big ${tone(x.real)}">${fmt(Math.abs(x.real), 1)}%<small>${x.real >= 0 ? "저렴" : "비쌈"}</small></div>
      <div class="ln">${baseTxt} 평균보다 · 물가 반영<br>환율만 보면 ${pctTxt(x.nom)}</div>
    </button>`).join("");

  const key = { real: x => x.real, nom: x => x.nom, yoy: x => x.yoy ?? -999 }[sortKey];
  const list = all.filter(x => region === "전체" || x.d.region === region).sort((a, b) => key(b) - key(a));
  const scale = 40; // 막대 끝 = ±40%
  $("rank").innerHTML = `<li class="rank-head" aria-hidden="true"><span>#</span><span>여행지 · 지금 환율</span><span>물가 반영 (평소 대비)</span><span>물가 반영</span><span>환율만</span><span>1년 전보다</span></li>` +
    list.map((x, i) => {
      const w = Math.min(50, Math.abs(x.real) / scale * 50);
      return `<li><button type="button" class="row" data-id="${x.d.id}" aria-current="${x.d.id === sel}">
        <span class="n">${i + 1}</span>
        <span class="who"><b><span class="cc" aria-hidden="true">${x.d.id}</span>${x.d.name}<span class="tag ${tone(x.real)}">${verdict(x.real)}</span></b>
          <span>${x.d.unit > 1 ? x.d.unit : 1}${x.d.curName} = ${fmt(x.rate, x.rate < 10 ? 3 : x.rate < 100 ? 2 : 1)}원</span></span>
        <span class="bar" title="${pctTxt(x.real)}"><i class="${x.real >= 0 ? "good" : "bad"}" style="width:${w.toFixed(1)}%"></i></span>
        <span class="v real ${tone(x.real)}">${sgn(x.real)}${fmt(Math.abs(x.real), 1)}%<small>${Math.abs(x.real) < 0.05 ? "평소" : x.real >= 0 ? "저렴" : "비쌈"}</small></span>
        <span class="v nom ${tone(x.nom)}">${sgn(x.nom)}${fmt(Math.abs(x.nom), 1)}%<small>환율만</small></span>
        <span class="v yoy ${tone(x.yoy ?? 0)}">${x.yoy == null ? "–" : sgn(x.yoy) + fmt(Math.abs(x.yoy), 1) + "%"}<small>1년 전 대비</small></span>
      </button></li>`;
    }).join("");

  if (!sel || !all.some(x => x.d.id === sel)) sel = byReal[0].d.id;
  detail(all.find(x => x.d.id === sel), baseTxt);
}

function select(id, scroll) {
  sel = id;
  const u = new URL(location.href); u.searchParams.set("d", id); history.replaceState(null, "", u);
  render();
  if (scroll) $("detailBlock").scrollIntoView({ behavior: "smooth", block: "start" });
}

function lede(x, baseTxt) {
  const d = x.d, gap = x.nom - x.real;
  const mid = v => (Math.abs(v) < 0.05 ? "평소와 같고" : `${fmt(Math.abs(v), 1)}% ${v > 0 ? "싸고" : "비싸고"}`);
  const end = v => (Math.abs(v) < 0.05 ? "평소와 같아요" : `${fmt(Math.abs(v), 1)}% ${v > 0 ? "싸요" : "비싸요"}`);
  const flip = Math.sign(x.nom) !== Math.sign(x.real) && Math.abs(x.nom) >= 0.05 && Math.abs(x.real) >= 0.05;
  let s = `${d.name}${topic(d.name)} ${baseTxt} 평균과 비교해 ${d.curName} 환율만 보면 <b class="${tone(x.nom)}">${mid(x.nom)}</b>, 현지 물가 변화까지 반영하면 ${flip ? "오히려 " : ""}<b class="${tone(x.real)}">${end(x.real)}</b>.`;
  if (gap > 10 && x.real < 0) s += ` 통화 가치는 떨어졌지만 현지 물가가 그보다 훨씬 빠르게 올라, 원화로 쓰는 여행 경비는 평소보다 더 들어요.`;
  else if (gap > 10) s += ` 통화 가치는 떨어졌지만 현지 물가가 한국보다 빠르게 올라 체감 혜택은 환율만큼 크지 않아요.`;
  else if (gap < -10) s += ` 현지 물가가 한국보다 덜 올라서 환율보다 실제로 더 유리해요.`;
  if (d.peg) s += ` 홍콩 달러는 미국 달러에 고정돼 있어 미국과 거의 같이 움직여요.`;
  return s;
}

function detail(x, baseTxt) {
  if (!x) return;
  const d = x.d;
  $("dTitle").textContent = `${d.name} — ${verdict(x.real)}`;
  $("dLede").innerHTML = lede(x, baseTxt);
  $("dStats").innerHTML = `
    <div>지금 환율<b>${fmt(x.rate, x.rate < 10 ? 3 : x.rate < 100 ? 2 : 1)}원</b>${d.unit > 1 ? d.unit : 1}${d.curName}당</div>
    <div>1년 전 환율<b>${x.rate12 == null ? "–" : fmt(x.rate12, x.rate12 < 10 ? 3 : x.rate12 < 100 ? 2 : 1) + "원"}</b>월말 기준</div>
    <div>현지 물가 상승률<b>${fmt(x.infl, 1)}%</b>최근 1년 (IMF 기반)</div>
    <div>한국 물가 상승률<b>${fmt(x.inflK, 1)}%</b>최근 1년 (IMF 기반)</div>`;

  const real = x.rer.map(v => x.avgR / v * 100), nom = x.s.c.map(v => x.avgF / v * 100);
  const labels = x.ts.map(ymOf);
  const grid = css("--grid"), muted = css("--muted");
  const data = { labels, datasets: [
    { label: "물가 반영", data: real, borderColor: css("--good"), borderWidth: 2.2, pointRadius: 0, tension: .2 },
    { label: "환율만", data: nom, borderColor: css("--nom"), borderWidth: 1.6, borderDash: [5, 4], pointRadius: 0, tension: .2 },
  ] };
  const fromIdx = x.ts.indexOf(x.from);
  // 비교 기준 기간 밖은 옅게 칠하고, 100 기준선을 긋는다 (fromIdx는 차트 객체에서 읽음)
  const band = { id: "band", beforeDatasetsDraw(c) {
    const { ctx, chartArea: a, scales: { x: sx, y: sy } } = c, fromIdx = c.$fromIdx;
    const y100 = sy.getPixelForValue(100);
    ctx.save();
    if (fromIdx > 0) { ctx.fillStyle = grid; ctx.globalAlpha = .45; ctx.fillRect(a.left, a.top, sx.getPixelForValue(fromIdx) - a.left, a.bottom - a.top); ctx.globalAlpha = 1; }
    ctx.strokeStyle = muted; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(a.left, y100); ctx.lineTo(a.right, y100); ctx.stroke();
    ctx.restore();
  } };
  if (chart) { chart.data = data; chart.$fromIdx = fromIdx; chart.update("none"); return; }
  chart = new Chart($("cDest"), {
    type: "line", data, plugins: [band],
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", align: "end", labels: { color: muted, boxWidth: 18, boxHeight: 2 } },
        tooltip: { callbacks: { label: it => `${it.dataset.label}: ${fmt(it.parsed.y, 1)} (${it.parsed.y >= 100 ? "평소보다 " + fmt(it.parsed.y - 100, 1) + " 유리" : "평소보다 " + fmt(100 - it.parsed.y, 1) + " 불리"})` } },
      },
      scales: {
        x: { grid: { display: false }, border: { color: grid }, ticks: { color: muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 8, callback(v) { return this.getLabelForValue(v).slice(0, 4); } } },
        y: { position: "right", grid: { color: grid }, border: { display: false }, ticks: { color: muted } },
      },
    },
  });
  chart.$fromIdx = fromIdx; chart.update("none");
}
})();

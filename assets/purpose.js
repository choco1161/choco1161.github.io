// ───────────────────────────────────────────────
// 페이지 목적 카드: "이 페이지가 답하는 질문 · 이런 분께 · 여기서 알 수 있는 것"
//  - 내용은 assets/catalog.js 의 PURPOSE 에서 가져와요 (catalog.js 다음에 불러오기)
//  - 페이지에서 보여줄 자리에 <div data-purpose></div> 를 두면 그 자리에 그려요
//      data-purpose="compact"      → 한 줄 질문 버튼, 누르면 자세히 (전체화면 지도·3D 페이지용)
//      data-purpose-theme="dark"   → 어두운 페이지 (기본은 브라우저 설정 따라감)
//  - 페이지 자체 디자인과 섞이지 않도록 Shadow DOM 안에 그려요. 전역 이름은 만들지 않아요
// ───────────────────────────────────────────────
(function () {
  const C = window.CATALOG;
  const mountEl = document.querySelector("[data-purpose]");
  if (!C || !mountEl) return;
  const ROOT = new URL("..", document.currentScript.src).href;
  const here = location.href.split(/[?#]/)[0].replace(/index\.html$/, "");
  const me = C.PROJECTS.find(p => here === ROOT + p.area + "/" + p.path);
  const P = me && me.purpose;
  if (!P) return;

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const compact = mountEl.dataset.purpose === "compact";
  const theme = mountEl.dataset.purposeTheme; // "dark" | "light" | 없음
  const h = me.hue ?? 215;
  const KEY = "purpose-folded:" + me.area + "/" + me.path;
  let folded = false;
  try { folded = localStorage.getItem(KEY) === "1"; } catch (e) {}

  const light = `--card:#fff; --text:#1d1d1f; --muted:#6b6b70; --line:#e4e2dc; --soft:hsl(${h} 60% 96%); --acc:hsl(${h} 62% 40%);`;
  const dark = `--card:#201f1d; --text:#f1efea; --muted:#a09d96; --line:#36342f; --soft:hsl(${h} 30% 15%); --acc:hsl(${h} 75% 70%);`;
  const vars = theme === "dark" ? `:host{${dark}}` : theme === "light" ? `:host{${light}}`
    : `:host{${light}} @media (prefers-color-scheme: dark){ :host{${dark}} }`;

  const items = (P.get || []).map((t, i) => `<li><span class="no">${i + 1}</span>${esc(t)}</li>`).join("");
  const meta = `<p class="meta"><span class="tag">이런 분께</span>${esc(P.who)}${P.freq ? `<span class="dot" aria-hidden="true">·</span><span class="freq">⟳ ${esc(P.freq)}</span>` : ""}</p>`;

  const host = document.createElement("section");
  host.setAttribute("aria-label", "이 페이지의 목적");
  host.style.cssText = compact ? "display:block;pointer-events:auto;margin-top:8px;max-width:min(440px,calc(100vw - 32px))" : "display:block;margin:0 0 28px";
  const sh = host.attachShadow({ mode: "open" });

  const base = `
    ${vars}
    * { box-sizing: border-box; }
    .card { font: 15px/1.55 system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; color: var(--text); }
    .kicker { margin: 0; font-size: .74rem; font-weight: 700; letter-spacing: .06em; color: var(--acc); }
    .q { margin: 2px 0 0; font-size: 1.22rem; font-weight: 750; letter-spacing: -.015em; line-height: 1.4; word-break: keep-all; }
    .meta { margin: 8px 0 0; font-size: .86rem; color: var(--muted); display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
    .tag { font-size: .72rem; font-weight: 700; color: var(--acc); background: var(--card); border: 1px solid var(--line); border-radius: 999px; padding: 0 8px; }
    .freq { color: var(--text); font-weight: 600; }
    .dot { color: var(--line); }
    .gl { margin: 14px 0 6px; font-size: .74rem; font-weight: 700; color: var(--muted); letter-spacing: .04em; }
    ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    li { display: flex; gap: 8px; align-items: flex-start; font-size: .9rem; line-height: 1.45; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 9px 11px; word-break: keep-all; }
    .no { flex: none; display: inline-grid; place-items: center; width: 1.35rem; height: 1.35rem; border-radius: 50%; background: var(--acc); color: var(--card); font-size: .72rem; font-weight: 800; margin-top: 1px; }
    button { font: inherit; cursor: pointer; }
    @media (max-width: 680px) { ol { grid-template-columns: 1fr; } .q { font-size: 1.1rem; } }
  `;

  if (!compact) {
    sh.innerHTML = `<style>${base}
      .card { position: relative; background: var(--soft); border: 1px solid var(--line); border-left: 4px solid var(--acc); border-radius: 14px; padding: 16px 18px 16px; }
      .fold { position: absolute; top: 10px; right: 10px; border: 0; background: none; color: var(--muted); font-size: .78rem; padding: 4px 6px; border-radius: 6px; }
      .fold:hover { color: var(--acc); }
      .card.folded { padding: 10px 16px; }
      .card.folded .kicker, .card.folded .body { display: none; }
      .card.folded .q { font-size: 1rem; margin: 0; padding-right: 64px; }
      .q { padding-right: 52px; }
    </style>
    <div class="card${folded ? " folded" : ""}">
      <p class="kicker">이 페이지가 답하는 질문</p>
      <p class="q">${esc(P.q)}</p>
      <button type="button" class="fold" aria-expanded="${!folded}">${folded ? "펼치기 ▾" : "접기 ▴"}</button>
      <div class="body">${meta}<p class="gl">여기서 알 수 있는 것</p><ol>${items}</ol></div>
    </div>`;
    const card = sh.querySelector(".card"), btn = sh.querySelector(".fold");
    btn.addEventListener("click", () => {
      folded = !folded;
      card.classList.toggle("folded", folded);
      btn.textContent = folded ? "펼치기 ▾" : "접기 ▴";
      btn.setAttribute("aria-expanded", String(!folded));
      try { localStorage.setItem(KEY, folded ? "1" : "0"); } catch (e) {}
    });
  } else {
    // 전체화면 페이지: 질문 한 줄을 버튼으로, 누르면 아래로 자세히
    sh.innerHTML = `<style>${base}
      .pill { display: flex; gap: 8px; align-items: center; width: 100%; text-align: left; color: var(--text); background: var(--card);
        border: 1px solid var(--line); border-left: 3px solid var(--acc); border-radius: 10px; padding: 7px 10px; box-shadow: 0 4px 16px rgba(0,0,0,.18); }
      .pill:hover { border-color: var(--acc); }
      .pill .ic { flex: none; color: var(--acc); font-weight: 800; }
      .pill .t { flex: 1; font-size: .86rem; font-weight: 650; line-height: 1.35; word-break: keep-all; }
      .pill .ar { flex: none; color: var(--muted); font-size: .75rem; }
      .panel { margin-top: 6px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; box-shadow: 0 6px 22px rgba(0,0,0,.22); }
      .panel[hidden] { display: none; }
      .panel .meta { margin: 0; }
      .panel ol { grid-template-columns: 1fr; gap: 6px; }
      .panel li { padding: 6px 9px; font-size: .84rem; }
      .panel .gl { margin-top: 10px; }
    </style>
    <div class="card">
      <button type="button" class="pill" aria-expanded="false"><span class="ic">?</span><span class="t">${esc(P.q)}</span><span class="ar">자세히 ▾</span></button>
      <div class="panel" hidden>${meta}<p class="gl">여기서 알 수 있는 것</p><ol>${items}</ol></div>
    </div>`;
    const btn = sh.querySelector(".pill"), panel = sh.querySelector(".panel"), ar = sh.querySelector(".ar");
    btn.addEventListener("click", () => {
      const open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      ar.textContent = open ? "닫기 ▴" : "자세히 ▾";
    });
  }
  mountEl.replaceWith(host);
})();

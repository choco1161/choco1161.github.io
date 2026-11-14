// ───────────────────────────────────────────────
// 각 페이지 맨 아래에 "관련 페이지" 띠를 붙여요
//  - catalog.js 다음에 불러오기: <script src="../../assets/catalog.js"></script><script src="../../assets/related.js"></script>
//  - 페이지 자체 디자인과 섞이지 않도록 Shadow DOM 안에 그려요. 전역 이름은 하나도 만들지 않아요
// ───────────────────────────────────────────────
(function () {
  const C = window.CATALOG;
  if (!C) return;
  const ROOT = new URL("..", document.currentScript.src).href;
  const here = location.href.split(/[?#]/)[0].replace(/index\.html$/, "");
  const me = C.PROJECTS.find(p => here === ROOT + p.area + "/" + p.path);
  if (!me) return;
  const ind = C.industryOf(me);
  const rel = C.related(me, 3);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  const host = document.createElement("aside");
  host.setAttribute("aria-label", "관련 페이지");
  host.style.cssText = "display:block;position:relative;z-index:1;clear:both";
  const sh = host.attachShadow({ mode: "open" });
  sh.innerHTML = `
  <style>
    :host { --bg:#f4f3ef; --card:#fff; --text:#1d1d1f; --muted:#6b6b70; --line:#e2e0da; --accent:#7a4b2a; }
    @media (prefers-color-scheme: dark) { :host { --bg:#141312; --card:#1f1e1c; --text:#f1efea; --muted:#a09d96; --line:#34322f; --accent:#d9a273; } }
    .band { background: var(--bg); color: var(--text); border-top: 1px solid var(--line);
            font: 15px/1.5 system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; }
    .in { max-width: 1100px; margin: 0 auto; padding: 28px 16px 32px; }
    .head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 16px; margin-bottom: 14px; }
    h2 { margin: 0; font-size: 1.1rem; letter-spacing: -.01em; }
    nav { display: flex; gap: 16px; font-size: .88rem; }
    nav a { color: var(--muted); text-decoration: none; } nav a:hover { color: var(--accent); }
    .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .card { display: block; padding: 14px 16px; background: var(--card); border: 1px solid var(--line); color: inherit; text-decoration: none; }
    .card:hover, .card:focus-visible { border-color: var(--accent); outline: none; }
    .card b { display: block; font-size: .98rem; }
    .card span { display: block; color: var(--muted); font-size: .84rem; margin-top: 2px; }
    .why { color: var(--accent) !important; font-size: .76rem !important; margin-top: 6px !important; }
  </style>
  <div class="band"><div class="in">
    <div class="head">
      <h2>이어서 보면 좋은 페이지</h2>
      <nav>${ind ? `<a href="${ROOT}industry/${ind.id}/">${ind.icon} ${esc(ind.name)} 허브</a>` : ""}<a href="${ROOT}">메인 · 통합 검색</a></nav>
    </div>
    <div class="grid">${rel.map(({ p, shared }) => `
      <a class="card" href="${ROOT}${p.area}/${p.path}">
        <b>${esc(p.icon || "")} ${esc(p.title)}</b>
        <span>${esc((p.purpose && p.purpose.q) || p.tagline || p.desc)}</span>
        <span class="why">${shared.length ? shared.map(t => "#" + esc(t)).join(" ") : "같은 산업"}</span>
      </a>`).join("")}</div>
  </div></div>`;
  if (!rel.length) sh.querySelector(".grid").remove();

  const mount = () => document.body.appendChild(host);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();

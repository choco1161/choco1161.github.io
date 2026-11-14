// ───────────────────────────────────────────────
// 슬라이드형 넘김 (메인 · 산업 허브)
//  - 첫 화면과 각 블록을 한 화면짜리 슬라이드로 만들고, 스크롤하면 한 장씩 "착" 멈춰요 (CSS scroll-snap)
//  - 오른쪽 점 내비게이션, 화면에 들어올 때 내용이 떠오르는 효과, 페이지 타일은 가로로 넘기는 레일
//  - render*() 다음에 불러야 해요 (내용이 그려진 뒤 슬라이드를 셈)
// ───────────────────────────────────────────────
(function () {
  const slides = [...document.querySelectorAll("body.home > .hero, body.home .wrap > .block")]
    .filter(s => !s.hidden && getComputedStyle(s).display !== "none");
  if (slides.length < 2) return;

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const go = el => el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });

  document.documentElement.classList.add("deck");
  slides.forEach(s => s.classList.add("slide"));

  // 첫 화면 아래 "넘기기" 안내
  const cue = document.createElement("button");
  cue.type = "button"; cue.className = "deck-cue"; cue.setAttribute("aria-label", "다음 화면으로");
  cue.innerHTML = "<span>아래로 넘겨 보세요</span><i aria-hidden=\"true\">↓</i>";
  cue.addEventListener("click", () => go(slides[1]));
  slides[0].append(cue);

  // 오른쪽 점 내비게이션
  const dots = document.createElement("nav");
  dots.className = "deck-dots"; dots.setAttribute("aria-label", "화면 이동");
  slides.forEach((s, i) => {
    const h = s.querySelector("h2");
    const name = i === 0 ? "처음" : (h ? h.textContent.trim() : `${i + 1}`);
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("aria-label", name); b.dataset.name = name;
    b.addEventListener("click", () => go(s));
    dots.append(b);
  });
  document.body.append(dots);

  // 화면 가운데 줄에 걸친 슬라이드 = 지금 슬라이드
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      const i = slides.indexOf(e.target);
      [...dots.children].forEach((b, j) => b.toggleAttribute("aria-current", j === i));
      dots.classList.toggle("on-dark", i === 0);
    });
  }, { rootMargin: "-45% 0px -45% 0px" });
  slides.forEach(s => io.observe(s));

  // 페이지 타일: 가로로 한 장씩 넘기는 레일
  document.querySelectorAll(".deck .tiles").forEach(rail => {
    const items = [...rail.children].filter(c => c.classList.contains("tile"));
    if (items.length < 2) return;
    rail.classList.add("rail");
    rail.setAttribute("tabindex", "0");
    rail.setAttribute("aria-label", "페이지 목록, 좌우로 넘겨 보세요");

    const ctl = document.createElement("div");
    ctl.className = "rail-ctl";
    ctl.innerHTML = '<button type="button" aria-label="이전 페이지">←</button><span class="rail-n" aria-live="polite"></span><button type="button" aria-label="다음 페이지">→</button>';
    const [prev, n, next] = ctl.children;
    (rail.closest(".block")?.querySelector(".block-head") || rail.parentNode).append(ctl);

    const stepW = () => items[0].getBoundingClientRect().width + parseFloat(getComputedStyle(rail).columnGap || 0);
    const move = dir => rail.scrollBy({ left: dir * stepW(), behavior: reduce ? "auto" : "smooth" });
    prev.addEventListener("click", () => move(-1));
    next.addEventListener("click", () => move(1));

    const update = () => {
      const i = Math.min(items.length - 1, Math.round(rail.scrollLeft / stepW()));
      const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4;
      n.textContent = `${atEnd ? items.length : i + 1} / ${items.length}`;
      prev.disabled = rail.scrollLeft < 4;
      next.disabled = atEnd;
    };
    let raf = 0;
    rail.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });
    addEventListener("resize", update);
    update();
  });
})();

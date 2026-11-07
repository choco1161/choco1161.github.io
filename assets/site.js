// ───────────────────────────────────────────────
// 영역 목록: 영역을 추가하려면 여기에 한 줄 + 같은 이름의 폴더 만들기
// ───────────────────────────────────────────────
const AREAS = [
  { id: "macro",      icon: "🌐", name: "거시경제",       desc: "금리, 물가, 환율, 글로벌 경기 흐름" },
  { id: "korea",      icon: "🏛️", name: "한국경제",       desc: "성장률, 수출, 고용 등 국내 경제 지표" },
  { id: "realestate", icon: "🏠", name: "대한민국 부동산", desc: "집값, 전세, 청약, 정책 정리" },
  { id: "stocks",     icon: "📈", name: "주식",           desc: "시장 동향, 종목 분석, 투자 도구" },
  { id: "useful",     icon: "🧰", name: "유용한 페이지",   desc: "생활과 업무에 바로 쓰는 페이지" },
];

// ───────────────────────────────────────────────
// 메인 화면 구성 (위에서부터 순서대로)
//  - areas: 영역 카드를 보여주고, 누르면 영역 페이지로 이동
//  - pages: 그 영역의 작품을 메인에 바로 보여줌
// ───────────────────────────────────────────────
const SECTIONS = [
  { title: "💰 재테크",       areas: ["macro", "korea", "realestate", "stocks"] },
  { title: "🧰 유용한 페이지", pages: "useful" },
];

// ───────────────────────────────────────────────
// 작품 목록: 새 작품을 만들면 여기에 한 줄 추가 (최신이 위로)
// path는 영역 폴더 기준. 예) area: "macro", path: "rates/"
// ───────────────────────────────────────────────
const PROJECTS = [
  { area: "macro", icon: "📉", path: "rates-30y/", title: "한미 금리 30년",
    desc: "1997~2026 한미 금리 · 원/달러 · 달러인덱스 · 다우/나스닥/코스피 · IMF 물가 전망 · 연도별 이슈와 상관관계", date: "2026-11-07" },
  { area: "useful", icon: "🏥", path: "nursing-hospital-map/", title: "수도권 요양병원 지도",
    desc: "서울·경기·인천 요양병원 425곳 · 병상, 인력, 교통, 채용공고", date: "2026-11-03" },
];

function card(href, icon, name, desc, foot) {
  const a = document.createElement("a");
  a.className = "area";
  a.href = href;
  a.innerHTML = `<div class="icon"></div><div class="name"></div><div class="desc"></div><div class="count"></div>`;
  a.querySelector(".icon").textContent = icon;
  a.querySelector(".name").textContent = name;
  a.querySelector(".desc").textContent = desc || "";
  a.querySelector(".count").textContent = foot;
  return a;
}

// 메인 페이지: 섹션별로 카드 그리기
function renderHome(el) {
  for (const s of SECTIONS) {
    const sec = document.createElement("section");
    sec.className = "section";
    sec.innerHTML = `<h2></h2><div class="areas"></div>`;
    sec.querySelector("h2").textContent = s.title;
    const grid = sec.querySelector(".areas");

    if (s.areas) {
      for (const id of s.areas) {
        const a = AREAS.find(x => x.id === id);
        const n = PROJECTS.filter(p => p.area === id).length;
        grid.appendChild(card(id + "/", a.icon, a.name, a.desc, n ? `작품 ${n}개 →` : "준비 중 →"));
      }
    } else if (s.pages) {
      const items = PROJECTS.filter(p => p.area === s.pages);
      for (const p of items) grid.appendChild(card(`${s.pages}/${p.path}`, p.icon || "📄", p.title, p.desc, "열기 →"));
      if (!items.length) grid.innerHTML = `<div class="empty">아직 페이지가 없어요.</div>`;
    }
    el.appendChild(sec);
  }
}

// 영역 페이지: 제목과 작품 목록 그리기
function renderArea(areaId) {
  const a = AREAS.find(x => x.id === areaId);
  document.title = `${a.name} · Derek's Platform`;
  document.getElementById("title").textContent = `${a.icon} ${a.name}`;
  document.getElementById("desc").textContent = a.desc;

  const list = document.getElementById("list");
  const items = PROJECTS.filter(p => p.area === areaId);
  if (!items.length) {
    list.outerHTML = `<div class="empty">아직 작품이 없어요. 곧 채워질 예정!</div>`;
    return;
  }
  for (const p of items) {
    const li = document.createElement("li");
    li.innerHTML = `<a><span class="date"></span><div class="title"></div><div class="desc"></div></a>`;
    li.querySelector("a").href = p.path;
    li.querySelector(".date").textContent = p.date || "";
    li.querySelector(".title").textContent = (p.icon ? p.icon + " " : "") + p.title;
    li.querySelector(".desc").textContent = p.desc || "";
    list.appendChild(li);
  }
}

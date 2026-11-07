// ───────────────────────────────────────────────
// 영역 목록: 영역을 추가하려면 여기에 한 줄 + 같은 이름의 폴더 만들기
// ───────────────────────────────────────────────
const AREAS = [
  { id: "macro",       icon: "🌐", name: "거시경제",       desc: "금리, 물가, 환율, 글로벌 경기 흐름" },
  { id: "korea",       icon: "🏛️", name: "한국경제",       desc: "성장률, 수출, 고용 등 국내 경제 지표" },
  { id: "realestate",  icon: "🏠", name: "대한민국 부동산", desc: "집값, 전세, 청약, 정책 정리" },
  { id: "stocks",      icon: "📈", name: "주식",           desc: "시장 동향, 종목 분석, 투자 도구" },
];

// ───────────────────────────────────────────────
// 작품 목록: 새 작품을 만들면 여기에 한 줄 추가 (최신이 위로)
// path는 영역 폴더 기준. 예) area: "macro", path: "rates/"
// ───────────────────────────────────────────────
const PROJECTS = [
  { area: "macro", icon: "📉", path: "rates-30y/", title: "한미 금리 30년",
    desc: "1997~2026 한미 금리 · 원/달러 · 달러인덱스 · 다우/나스닥/코스피 · IMF 물가 전망 · 연도별 이슈와 상관관계", date: "2026-11-07" },
];

// 메인 페이지: 영역 카드 그리기
function renderAreas(el) {
  for (const a of AREAS) {
    const n = PROJECTS.filter(p => p.area === a.id).length;
    const link = document.createElement("a");
    link.className = "area";
    link.href = a.id + "/";
    link.innerHTML = `<div class="icon"></div><div class="name"></div><div class="desc"></div><div class="count"></div>`;
    link.querySelector(".icon").textContent = a.icon;
    link.querySelector(".name").textContent = a.name;
    link.querySelector(".desc").textContent = a.desc;
    link.querySelector(".count").textContent = n ? `작품 ${n}개 →` : "준비 중 →";
    el.appendChild(link);
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
    li.querySelector(".title").textContent = p.title;
    li.querySelector(".desc").textContent = p.desc || "";
    list.appendChild(li);
  }
}

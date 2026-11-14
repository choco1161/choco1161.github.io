// ───────────────────────────────────────────────
// 사이트 목록: 산업 → 영역 → 페이지
//  - 이 파일은 window.CATALOG 하나만 만들어요 (각 페이지 스크립트와 이름이 겹치지 않게)
//  - 새 산업: INDUSTRIES에 한 줄 + industry/아이디/index.html 만들기
//  - 새 영역: AREAS에 한 줄 + 같은 이름의 폴더 만들기
//  - 새 페이지: PROJECTS에 한 줄 (최신이 위로) + PURPOSE에 목적 한 줄
// ───────────────────────────────────────────────
window.CATALOG = (function () {
  const INDUSTRIES = [
    { id: "finance",    icon: "💹", name: "금융·투자",   hue: 215,
      desc: "금리, 환율, 거시경제와 주식 시장을 한곳에서" },
    { id: "realestate", icon: "🏠", name: "부동산",      hue: 28,
      desc: "매매 심리, 실거래 지수, 청약과 분양을 매일" },
    { id: "life",       icon: "🧰", name: "생활·헬스케어", hue: 175,
      desc: "여행, 의료 기관 정보처럼 생활에 바로 쓰는 데이터" },
  ];

  const AREAS = [
    { id: "macro",      industry: "finance",    icon: "🌐", name: "거시경제",       desc: "금리, 물가, 환율, 글로벌 경기 흐름" },
    { id: "korea",      industry: "finance",    icon: "🏛️", name: "한국경제",       desc: "성장률, 수출, 고용 등 국내 경제 지표" },
    { id: "stocks",     industry: "finance",    icon: "📈", name: "주식",           desc: "시장 동향, 종목 분석, 투자 도구" },
    { id: "realestate", industry: "realestate", icon: "🏠", name: "대한민국 부동산", desc: "집값, 전세, 청약, 정책 정리" },
    { id: "travel",     industry: "life",       icon: "✈️", name: "여행",           desc: "환율과 물가로 고르는 여행지" },
    { id: "useful",     industry: "life",       icon: "🧰", name: "유용한 페이지",   desc: "생활과 업무에 바로 쓰는 페이지" },
  ];

  // path는 영역 폴더 기준. tags = 관련 페이지를 잇는 열쇠말 (같은 태그가 많을수록 가깝게 연결)
  // art = 배경 그림 종류(towers·grid·candles·lines·dots), hue = 대표 색(0~360)
  const PROJECTS = [
    { area: "travel", icon: "🧭", path: "fx-compass/", title: "환율 여행 나침반",
      tagline: "지금 원화로 어디가 평소보다 쌀까",
      art: "dots", hue: 195, tags: ["환율", "여행", "물가"],
      desc: "일본·베트남·태국·유럽 등 18개 여행지 · 환율에 현지 물가까지 반영한 '평소 대비 저렴도' 순위 · 10년/5년 평균 비교와 추이", date: "2026-11-08" },
    { area: "macro", icon: "💱", path: "fx/", title: "원화 환율",
      tagline: "달러·엔·유로·위안, 오늘 원화 값과 흐름",
      art: "lines", hue: 195, tags: ["환율", "달러", "금리", "미국주식", "여행"],
      desc: "원/달러·100엔·유로·위안 환율 평일 하루 여러 번 갱신 · 전일 대비, 1개월~5년 추이와 고저 · 환전 계산기", date: "2026-11-08" },
    { area: "realestate", icon: "📜", path: "policy-timeline/", title: "부동산 정책 연표",
      tagline: "26년 부동산 대책을 집값·심리·금리 흐름 위에",
      art: "lines", hue: 12, tags: ["정책", "KB시세", "매수심리", "금리"],
      desc: "2000~2026 정부 부동산 대책 70여 건 연표 · KB 아파트 매매지수·매수우위·기준금리와 연동 · 정책 전후 효과와 정권별 성적표", date: "2026-11-08" },
    { area: "stocks", icon: "🏙️", path: "nasdaq-floor/", title: "나스닥 객장",
      tagline: "내 평단을 원화로 바꿔, 한 층씩 쌓아 올린 3D 객장",
      art: "towers", hue: 215, tags: ["미국주식", "나스닥", "환율", "포트폴리오"],
      desc: "평단을 원화로 바꿔 층으로 보여주는 3D 객장 · NVDA·TSLA·AAPL·RXRX·QQQ 종가와 환율 매일 갱신", date: "2026-11-07" },
    { area: "realestate", icon: "🏗️", path: "bunyang/", title: "분양",
      tagline: "청약 일정과 분양가를 주변 시세와 함께",
      art: "dots", hue: 28, tags: ["청약", "분양", "실거래", "지역"],
      desc: "청약홈 APT 분양 공고와 분양권 전매 실거래 매일 갱신 · 분양가를 주변 매매 시세와 비교", date: "2026-11-07" },
    { area: "realestate", icon: "📊", path: "region-index/", title: "광역권 지수",
      tagline: "권역별 수급과 시세 흐름을 매일 한눈에",
      art: "grid", hue: 28, tags: ["KB시세", "매수심리", "실거래", "지역"],
      desc: "KB 매수우위·가격지수와 실거래 매매 지수 매일 갱신 · 권역별 수급 온도계와 시군구 시세", date: "2026-11-07" },
    { area: "stocks", icon: "🗽", path: "daily-pick/", title: "오늘의 미국주식",
      tagline: "평일 아침, 미국주식 한 종목",
      art: "candles", hue: 150, tags: ["미국주식", "종목분석", "섹터"],
      desc: "평일 아침 미국주식 1종목 소개 · 주간·월간 성과 요약 · 매일 자동 갱신되는 누적 기록과 섹터 분포", date: "2026-11-07" },
    { area: "macro", icon: "📉", path: "rates-30y/", title: "한미 금리 30년",
      tagline: "1997년부터 지금까지, 금리와 시장의 30년",
      art: "lines", hue: 265, tags: ["금리", "환율", "물가", "미국주식", "나스닥", "코스피"],
      desc: "1997~2026 한미 금리 · 원/달러 · 달러인덱스 · 다우/나스닥/코스피 · IMF 물가 전망 · 연도별 이슈와 상관관계", date: "2026-11-07" },
    { area: "useful", icon: "🏥", path: "nursing-hospital-map/", title: "수도권 요양병원 지도",
      tagline: "서울·경기·인천 요양병원 425곳을 지도 위에",
      art: "dots", hue: 175, tags: ["요양병원", "의료", "지도", "수도권"],
      desc: "서울·경기·인천 요양병원 425곳 · 병상, 인력, 교통, 채용공고", date: "2026-11-03" },
  ];

  // 페이지 목적: 각 페이지 맨 위 '목적 카드'(assets/purpose.js)와 목록 카드에 쓰여요
  //  q = 이 페이지가 답하는 질문 · who = 이런 분께 · get = 여기서 알 수 있는 것 3가지 · freq = 갱신 주기(없으면 생략)
  //  새 페이지를 만들면 여기에도 한 줄 추가
  const PURPOSE = {
    "travel/fx-compass/": { q: "지금 원화로 어디를 여행하면 평소보다 쌀까?",
      who: "여행지를 고르는 중이거나 환전 시기를 보는 분",
      get: ["18개 여행지의 '평소 대비 저렴도' 순위", "환율만 볼 때와 현지 물가까지 볼 때의 차이", "나라별 10년 흐름과 1년 전 대비 변화"],
      freq: "평일 하루 4번 자동 갱신" },
    "macro/fx/": { q: "지금 달러·엔·유로·위안이 원화로 얼마일까?",
      who: "환전, 해외 결제, 해외주식 매수를 앞둔 분",
      get: ["4개 통화의 지금 환율과 전일 대비 변동", "1개월~5년 추이와 기간 최고·최저", "금액만 넣으면 바로 되는 환전 계산"],
      freq: "평일 하루 4번 자동 갱신" },
    "realestate/policy-timeline/": { q: "정부 부동산 대책은 정말 집값을 바꿨을까?",
      who: "정책이 집값에 주는 영향을 가늠하려는 실수요자",
      get: ["2000~2026 대책 70여 건이 언제, 무엇을 했는지", "대책 전후 집값·매수심리·금리의 움직임", "정권별 성적표와 지금의 정책 조합"] },
    "stocks/nasdaq-floor/": { q: "내 미국주식 평단, 원화로 치면 얼마일까?",
      who: "NVDA·TSLA·AAPL·QQQ 등을 가진 개인 투자자",
      get: ["평단 × 환율 = 원화 매수가를 층수로 한눈에", "최근 종가와 내 평단 사이의 거리", "오늘 환율로 다시 계산한 원화 가치"],
      freq: "종가·환율 매일 갱신" },
    "realestate/bunyang/": { q: "지금 청약할 만한 분양은? 분양가는 주변보다 비쌀까?",
      who: "청약을 준비하는 무주택자·갈아타기 수요자",
      get: ["예정·진행 중인 APT 청약 공고와 접수 일정", "84㎡ 분양가와 주변 매매 시세 비교", "분양권 전매 실거래로 본 웃돈 흐름"],
      freq: "매일 06:30 자동 갱신" },
    "realestate/region-index/": { q: "우리 권역 집값, 지금은 사는 쪽과 파는 쪽 중 누가 유리할까?",
      who: "매수·매도 시기를 보는 실수요자",
      get: ["KB 매수우위지수로 본 권역별 수급 온도", "KB 가격지수와 실거래 지수의 흐름", "시군구별 ㎡당 시세 비교"],
      freq: "매일 06:30 자동 갱신" },
    "stocks/daily-pick/": { q: "오늘 알아둘 만한 미국주식 한 종목은?",
      who: "미국주식을 공부하며 관심 종목을 넓히려는 분",
      get: ["평일 아침 대형주 1종목과 핵심 포인트", "소개 이후 주간·월간 성과", "지금까지 소개한 종목과 섹터 분포"],
      freq: "평일 아침 갱신" },
    "macro/rates-30y/": { q: "금리가 움직일 때 환율·주가·물가는 어떻게 따라왔을까?",
      who: "금리 흐름으로 시장을 이해하고 싶은 분",
      get: ["1997~2026 한미 기준금리·10년물 흐름", "금리차와 원/달러·주가지수의 관계", "연도별 주요 이슈와 앞으로 1~2년 시나리오"] },
    "useful/nursing-hospital-map/": { q: "수도권 요양병원, 어디가 가깝고 규모는 어떨까?",
      who: "요양병원을 알아보는 보호자와 가족",
      get: ["서울·경기·인천 요양병원 425곳의 위치", "병상·인력 규모와 교통", "병원별 채용공고"] },
  };
  PROJECTS.forEach(p => { p.purpose = PURPOSE[p.area + "/" + p.path] || null; });

  const area = id => AREAS.find(a => a.id === id);
  const industryOf = p => INDUSTRIES.find(i => i.id === (area(p.area) || {}).industry);

  // 관련 페이지: 겹치는 태그 1개 = 1점, 같은 산업 = 0.5점
  function related(p, n = 3) {
    return PROJECTS.filter(q => q !== p)
      .map(q => {
        const shared = (q.tags || []).filter(t => (p.tags || []).includes(t));
        const score = shared.length + (industryOf(q) === industryOf(p) ? 0.5 : 0);
        return { p: q, shared, score };
      })
      .filter(x => x.score > 0.5)
      .sort((a, b) => b.score - a.score || (b.p.date || "").localeCompare(a.p.date || ""))
      .slice(0, n);
  }

  return { INDUSTRIES, AREAS, PROJECTS, area, industryOf, related };
})();

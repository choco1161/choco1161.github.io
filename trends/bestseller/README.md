# 이번 주 서가 읽기

베스트셀러를 **분류 · 구성 · 읽으면 좋은 점** 세 칸으로 정리하고, 지금 마음 상태("오늘 슬퍼", "부자 되고 싶다")에 맞춰 책을 추천하는 정적 웹페이지입니다.

## 파일 구성

```
trends/bestseller/
├── index.html        # 화면과 동작 (데이터를 직접 담지 않음)
├── data/books.json   # 책 목록, 분류 체계, 마음 상태 키워드, 이번 주 흐름
└── README.md
```

화면은 `data/books.json`만 읽어서 그립니다. 책을 늘리거나 분류를 바꿀 때 HTML은 건드리지 않아도 됩니다.

## 어떻게 연결되어 있나

`books.json`의 `taxonomy`가 모든 기능을 잇는 중심입니다.

| 키 | 역할 | 쓰이는 곳 |
|---|---|---|
| `categories` | 대분류 15개 (소설, 인문·철학, 경제·경영 …) 와 색(hue) | 분야 필터, 띠지 색, 흐름 차트, 내 책 폼 |
| `forms` | 구성 형식 (장편 서사, 발췌 편역, 대담·인터뷰 …) | 형식 필터, 카드 태그 |
| `moods` | 독서 목적 (위로, 몰입, 돈 감각, AI·미래 …) | 마음 체크 추천 점수 |
| `states` | 감정 상태와 키워드, 연결할 `moods`, 건넬 말 | 마음 체크 입력 해석 |
| `weights` | 읽기 부담 1~3 | 부담 필터 |

흐름: 사용자가 "요즘 너무 지쳐" 입력 → `states`의 키워드(`지쳐`)와 일치 → `tired` 상태의 `moods: ["comfort","short"]` → 같은 `moods`를 가진 책을 점수순(동점이면 순위순)으로 3권 추천.

## 책 추가하기

`books` 배열에 아래 형식으로 넣습니다. `category`, `form`, `moods`는 반드시 `taxonomy`에 있는 `key`를 씁니다.

```json
{
  "id": "unique-id",
  "title": "제목",
  "author": "저자",
  "publisher": "출판사",
  "year": 2026,
  "category": "novel",
  "genre": "세부 장르",
  "form": "long",
  "weight": 2,
  "moods": ["immerse", "deep"],
  "ranks": { "kyobo": 3, "yes24": 5 },
  "oneLine": "한 줄 요약",
  "structure": ["구성 1", "구성 2"],
  "benefits": ["좋은 점 1", "좋은 점 2"],
  "forWhom": "이런 분께",
  "streak": "선택: 연속 1위 같은 판매 특징",
  "readers": "선택: 독자층",
  "caveat": "선택: 주의할 점",
  "sourceNote": "선택: 정보 출처 메모"
}
```

페이지의 **내 책 분류하기**에서 폼으로 정리한 뒤 **JSON 복사**를 누르면 위 형식 그대로 복사됩니다. 그 내용을 `books` 배열에 붙이면 됩니다. (폼에 넣은 책과 메모는 그 브라우저에만 저장됩니다.)

## 새 감정 상태 추가하기

`taxonomy.states`에 항목을 하나 더 넣으면 칩 버튼과 입력 해석에 바로 반영됩니다.

```json
{ "key": "excited", "label": "설렌다", "keywords": ["설레", "신나", "기대"], "moods": ["newform", "immerse"], "message": "들뜬 날엔 새로운 형식의 책을 열어 보기 좋습니다." }
```

## 매주 자동 갱신

`.github/workflows/bestseller.yml`이 매주 토요일 KST 09:30에 `scripts/fetch_bestseller.py`를 실행합니다.

1. 알라딘 Open API에서 주간 종합 베스트셀러 20권을 받습니다.
2. 이미 정리된 책은 ISBN·제목으로 찾아 순위(`ranks.aladin`)만 바꿉니다. 지난주 순위(교보·예스24 수동 기록 포함)는 지웁니다.
3. 처음 보는 책은 알라딘 분류(예: `국내도서>소설/시/희곡>일본소설`)로 대분류·장르·형식·마음 태그를 자동으로 붙여 추가합니다(`"auto": true`). 마음 체크 추천에도 바로 나옵니다.
4. 순위권에서 빠진 책도 서가에 남습니다. 서가는 주마다 늘어납니다.
5. `data/history.json`에 주차별 순위를 쌓고, 책마다 연속 주 수(`streakWeeks`)를 셉니다.
6. `insights`(이번 주 흐름)를 순위 데이터로 다시 씁니다.
7. 커밋하면 `deploy.yml`이 사이트에 배포합니다.

### 처음 한 번 할 일

1. https://www.aladin.co.kr/ttb/wblog_manage.aspx 에서 TTB 키를 무료로 발급받습니다.
2. GitHub `choco1161/project1` → Settings → Secrets and variables → Actions → New repository secret
   - Name: `ALADIN_TTB_KEY`
   - Secret: 발급받은 키
3. Actions → 베스트셀러 갱신 → Run workflow 로 한 번 돌려 봅니다.

키가 없으면 스크립트는 아무것도 바꾸지 않고 끝납니다.

### 자동 추가된 책 다듬기

`"auto": true`인 책은 카드에 '자동 분류' 표시가 붙습니다. `structure`, `benefits`, `forWhom`을 채우고 필요하면 `category`·`moods`를 고친 뒤 `auto` 줄을 지우면 정리된 책이 됩니다. 이후 자동 갱신은 순위만 바꾸고 내용은 건드리지 않습니다.

## 로컬에서 보기

`index.html`을 더블클릭하면 브라우저 보안 정책 때문에 `books.json`을 읽지 못합니다. 간단한 서버로 여세요.

```powershell
python -m http.server 8000
```

그다음 http://localhost:8000 을 엽니다.

## 사이트 연결

- 주소: https://choco1161.github.io/trends/bestseller/
- `assets/catalog.js`의 `PROJECTS`와 `PURPOSE`에 등록되어 트렌드 영역 목록, 목적 카드, 관련 페이지 띠에 나옵니다.
- `main`에 push하면 `deploy.yml`이 공개 저장소로 배포합니다.

## 출처

순위는 2026년 11월 교보문고·예스24 주간 베스트셀러 보도(경향신문, 파이낸셜뉴스, 로이슈, 싱글리스트)를 바탕으로 정리했습니다. 신간의 구성 정보는 출판사 소개와 보도 기준입니다.

# 기여하기 / Contributing

한국어와 영어 순서로 적었습니다. English follows the Korean.

---

## 가장 도움이 되는 기여는 "이 가게 지금 어떤가요"입니다

이 지도의 가치는 정확도가 아니라 **신선도**입니다. 아키하바라는 몇 달마다 가게가 바뀝니다.
2026년에만 토라노아나가 전 점포를 닫았고, BEEP이 이전했고, GiGO 1호관이 실크햇이 됐고,
트레카ONE이 있던 자리에 카드샵 CLIMAX가 들어왔습니다.

그래서 **직접 가보고 아는 사실**이 이 저장소에서 가장 귀한 정보입니다. 코드를 몰라도 됩니다.

### 1. 이슈로 알려주기 (개발 지식 필요 없음)

- 앱의 매장 카드 맨 아래 **오류 신고** 버튼을 누르면 매장 ID가 채워진 이슈가 열립니다.
- 또는 [이슈 새로 만들기](../../issues/new/choose)에서 상황에 맞는 양식을 고르세요.
  - 문 닫음 · 이전
  - 정보 수정 (영업시간, 층, 주소, 면세 등)
  - 새 매장 제보
  - 사진 제공

사진을 찍어 올려주시는 것도 큰 도움이 됩니다. 409곳 중 사진이 있는 곳은 아직 100곳뿐입니다.

### 2. 직접 고치기 (Pull Request)

매장 하나가 JSON 파일 하나입니다. `data/stores/<id>.json` 을 고쳐 PR을 보내주세요.
CI가 스키마와 교차 검증을 자동으로 돌리므로, 형식이 틀리면 바로 알려줍니다.

```bash
git clone <이 저장소>
cd otakuroad
npm install
npm run validate   # 데이터 검사
npm run dev        # http://localhost:4321/ko/
```

---

## 데이터를 고칠 때의 규칙

이 세 가지만 지켜주시면 됩니다.

### 출처 없이는 넣지 않습니다

모든 레코드에는 `source_urls` 가 최소 하나 있어야 하고, **직접 읽은 페이지**여야 합니다.
매장 공식 페이지가 1순위, 체인의 점포 목록이 2순위, 건물의 공식 플로어가이드가 3순위입니다.

구글 지도 링크는 출처가 아닙니다. 가게가 있다는 것을 발견하는 데는 써도 되지만,
영업시간이나 주소는 그 가게의 공식 페이지에서 옮겨 적어야 합니다.
(구글 Places 데이터는 약관상 비구글 지도에서 쓸 수 없기도 합니다.)

### 모르면 비워둡니다

영업시간을 못 찾았으면 `hours: null` 로 두세요. 앱은 "시간 미확인"이라고 표시합니다.
추측해서 채운 "영업중"은 없는 것보다 나쁩니다. 문 닫은 가게 앞에 사람을 보내니까요.

`confidence` 는 이렇게 씁니다.

| 값 | 의미 |
|---|---|
| `high` | 공식 페이지가 2026년 현재 그 주소에 있음을 확인해 줌 |
| `medium` | 신뢰할 만한 일본 디렉터리나 매장의 활성 X 계정이 확인해 줌 |
| `low` | 확인 못 함 — 빌드에서 제외됩니다 |

### 확인한 날짜를 갱신합니다

무엇이든 고쳤으면 `verified_at` 을 오늘 날짜(`YYYY-MM-DD`)로 바꿔주세요.
앱은 이 날짜를 카드에 그대로 보여줍니다. 사용자가 스스로 판단할 수 있게 하는 것이 목적입니다.

---

## 매장 하나가 어떻게 생겼는지

정본은 `src/data/schema.ts` 입니다. 자주 쓰는 필드만 추리면 이렇습니다.

```jsonc
{
  "id": "super-potato-akihabara",          // 파일 이름과 같아야 함. 한번 정하면 바꾸지 않음
  "name": { "ko": "슈퍼포테이토", "en": "Super Potato", "ja": "スーパーポテト秋葉原店" },
  "category": "retro_game",                 // 10개 중 하나. src/data/categories.ts
  "one_line": {                             // 무엇을 파는 곳인지. 한국어 60자, 영어 90자 이내
    "ko": "3·4층은 중고 레트로 게임 소프트와 본체, 5층은 레트로 오락실",
    "en": "Used retro game software and consoles on 3F-4F, a retro arcade on 5F"
  },
  "building_id": null,                      // 복합 빌딩 입주면 건물 id, 아니면 null
  "floors": ["3F", "4F", "5F"],             // 일본식 표기. 1층은 1F, 지하 1층은 B1F
  "location": { "lat": 35.699371, "lng": 139.770741 },  // 입주 매장이면 null (건물 좌표를 씀)
  "address_ja": "東京都千代田区外神田1-11-2 北林ビル3F・4F・5F",
  "hours": {
    "rules": [{ "days": ["mon","tue","wed","thu","fri"], "open": "11:00", "close": "20:00" }],
    "regular_holiday": { "ko": "연중무휴", "en": "Open year-round" },
    "source_url": "https://www.superpotato.com/shop/akihabara/"
  },
  "confidence": "high",
  "verified_at": "2026-09-05",
  "source_urls": ["https://www.superpotato.com/shop/akihabara/"]
}
```

몇 가지 함정:

- **층 번호는 일본식입니다.** 지상층이 1F입니다. OpenStreetMap 의 `level` 태그는 0부터 세므로
  `level=0` 이 1F, `level=-1` 이 B1F 입니다. 좌표를 OSM 에서 가져올 때 헷갈리기 쉽습니다.
- **입주 매장은 자기 좌표를 갖지 않습니다.** `building_id` 를 채우고 `location` 은 `null` 로 둡니다.
  건물 핀 하나가 층 목록을 여는 구조라서, 입주 매장이 따로 핀을 찍으면 지도가 겹칩니다.
- **성인 전용 매장은 수록하지 않습니다.** 일반 매장 안의 R-18 층은
  `adult_content: { "level": "floor", "floors": ["4F"] }` 로 표시합니다.
- **문 닫은 가게는 지우고 끝이 아닙니다.** `data/excluded.json` 에 이름과 날짜와 출처를 넣어주세요.
  그래야 다음에 OSM 에서 데이터를 다시 긁을 때 되살아나지 않습니다.

새 매장을 넣을 때는 기존 파일 하나를 복사해서 고치는 편이 빠릅니다.
`data/stores/k-books-akihabara-honkan.json` 이 입주 매장의 예, `super-potato-akihabara.json` 이
독립 매장의 예입니다.

---

## 검사가 무엇을 잡아주는지

`npm run validate` 는 스키마뿐 아니라 이런 것들을 봅니다. PR 에서도 자동으로 돕니다.

- id 가 파일 이름과 같은지
- 좌표가 아키하바라 범위(35.694–35.708 N, 139.765–139.780 E) 안인지
- `building_id` 가 실제로 있는 건물인지, 그 건물에 그 층이 있는지
- 영업시간 규칙이 서로 겹치지 않는지
- `verified_at` 이 미래가 아닌지, 180일보다 오래되지 않았는지
- `excluded.json` 에 있는 이름을 되살리고 있지 않은지

`npm run audit` 는 검사가 아니라 **의심 목록**입니다. 실패시키지 않고, 다시 확인해 볼 만한 패턴만 모아 보여줍니다 — 다른 매장과 똑같은 좌표, 다른 가게 이름이 붙은 OSM id, 건물과 다른 주소로 적힌 입주 매장, 규칙과 다른 시각을 말하는 영업시간 메모, 디렉터리 사이트나 아카이브 페이지밖에 출처가 없는 레코드 같은 것들입니다. 여기 나온다고 틀린 것은 아니고, 공식 페이지에서 다시 봐 달라는 뜻입니다.

---

## 라이선스

- 코드: MIT ([LICENSE](LICENSE))
- 데이터: ODbL v1.0 ([data/LICENSE-DATA.md](data/LICENSE-DATA.md))
- 사진: 사진마다 다름 ([public/photos/CREDITS.json](public/photos/CREDITS.json))

기여하시면 그 기여물도 같은 라이선스로 공개하는 데 동의하는 것으로 봅니다.
직접 찍은 사진을 올려주실 때는 어떤 라이선스로 주시는지 이슈에 적어주세요.
CC BY 4.0 이나 CC0 이면 가장 쓰기 좋습니다.

---

# Contributing (English)

## The most useful thing you can contribute is what the shop is like right now

This map's value is not accuracy, it is **freshness**. Akihabara turns over every few months:
in 2026 alone Toranoana closed every Akihabara branch, BEEP moved, GiGO Building 1 became Silk Hat,
and Card Shop CLIMAX took over the unit Toreca ONE left.

So **something you saw with your own eyes** is the most valuable thing in this repository.
You do not need to know how to code.

### 1. Open an issue (no development experience needed)

- The **오류 신고 / Report an error** button at the bottom of any store card opens an issue with
  the store id already filled in.
- Or [start a new issue](../../issues/new/choose) and pick the form that fits:
  closed or moved · fix an detail · suggest a new shop · offer a photo.

Photographs are especially welcome. Only about 100 of the 409 shops have one.

### 2. Fix it yourself (pull request)

One shop is one JSON file, `data/stores/<id>.json`. CI validates the schema and the cross-checks on
every pull request, so a formatting mistake tells you immediately.

```bash
npm install
npm run validate
npm run dev        # http://localhost:4321/en/
```

## Three rules for the data

**No source, no entry.** Every record needs at least one `source_urls` entry that you actually read.
The shop's own page first, then its chain's store list, then the building's official floor guide.
A Google Maps link is not a source — use it to discover that a shop exists, then take the details
from the shop's own page. (Google Places data also may not be used on a non-Google map.)

**If you do not know, leave it empty.** No opening hours found means `hours: null`, and the app
says "hours unconfirmed". A guessed "open now" is worse than nothing — it sends someone to a closed
shutter. Use `confidence: "low"` when you could not confirm the shop; low-confidence records are
kept out of the build.

**Update `verified_at`** to today whenever you change anything. The app prints that date on the
card so a visitor can judge for themselves how much to trust it.

## Gotchas

- Floor labels are Japanese style: the ground floor is `1F`, the basement is `B1F`. OpenStreetMap's
  `level` tag counts from zero, so `level=0` is `1F` and `level=-1` is `B1F`.
- A shop inside one of the curated buildings sets `building_id` and `floors` and leaves `location`
  as `null`; the building's single pin opens the floor list. A tenant with its own coordinates puts
  a duplicate pin on the map.
- Adult-only shops are not listed. An R-18 floor inside a general shop is recorded as
  `adult_content: { "level": "floor", "floors": ["4F"] }`.
- Closing a shop is not just deleting the file — add it to `data/excluded.json` with a date and a
  source, so re-seeding from OpenStreetMap cannot bring it back.

## Licence

Code MIT, dataset ODbL v1.0, photographs individually licensed. By contributing you agree to
publish your contribution under the same terms. If you offer your own photograph, say in the issue
which licence you are giving it under — CC BY 4.0 or CC0 are the easiest to use.

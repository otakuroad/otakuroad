# otakuroad

**아키하바라 서브컬처 매장 지도** — 핀을 누르면 2초 안에 무슨 가게인지, 지금 여는지,
어느 건물 몇 층인지가 보입니다. 한국어와 영어.

**A map of Akihabara's subculture shops.** Tap a pin and within two seconds you know what the shop
sells, whether it is open right now, and exactly which building and floor it is in. Korean and English.

매장 408곳 · 복합 빌딩 34곳 · 폐점 목록 92건 · 모두 공식 페이지를 근거로 손으로 확인했습니다.
408 shops, 34 multi-tenant buildings and 92 recorded closures, each checked by hand against a primary source.

---

## 왜 만들었나 / Why this exists

구글 지도는 아키하바라에서 두 가지를 못 합니다.

- 라디오회관 같은 건물에 핀 20개를 같은 좌표에 겹쳐 놓습니다. 몇 층에 뭐가 있는지는 안 알려줍니다.
- 정보가 오래됐는지 알 수 없습니다. 아키하바라는 몇 달마다 가게가 바뀌는 동네입니다.

그래서 이 지도는 **건물을 건물로 다룹니다.** 복합 빌딩은 핀 하나가 밖의 세로 간판과 같은 순서로
층 목록을 엽니다. 그리고 **모든 카드에 확인한 날짜와 출처를 적습니다.** 틀린 "영업중"은 없는 것보다
나쁘다는 전제로 만들었습니다.

Google Maps stacks twenty pins on one coordinate for a building like Radio Kaikan and never tells you
which floor anything is on, and it gives you no way to judge how stale it is. So this map treats a
building as a building — one pin that opens a floor list in the order of the signboard outside — and
prints the check date and the sources on every card.

## 지금 돌려보기 / Run it

API 키도, 백엔드도, 계정도 필요 없습니다. 클론하고 두 줄이면 됩니다.
No API keys, no backend, no account. Two commands.

```bash
npm install
npm run dev        # http://localhost:4321/ko/  (English: /en/)
```

```bash
npm run validate   # 데이터 검사 / validate the dataset
npm run check      # 타입 검사 / type-check
npm test           # 단위 테스트 / unit tests
npm run build      # 정적 빌드 → dist/ (899 pages)
```

## 데이터를 그냥 쓰고 싶다면 / Just want the data

매장 하나가 JSON 파일 하나입니다. `data/stores/` 를 그대로 가져다 쓰셔도 됩니다.
빌드하면 `src/generated/` 에 GeoJSON 도 나옵니다. ODbL 이므로 상업적으로도 쓸 수 있고,
출처 표시와 동일 조건 공개만 지켜주시면 됩니다.

One shop is one JSON file; take `data/stores/` as it is. The build also emits GeoJSON into
`src/generated/`. It is ODbL, so commercial use is fine with attribution and share-alike.

## 어떻게 만들어졌나 / How it is built

| | |
|---|---|
| 프레임워크 | Astro 7 (정적) + Svelte 5 아일랜드 하나 + TypeScript |
| 지도 | MapLibre GL, OpenFreeMap 타일 — 키 없음, 비용 없음 |
| 데이터 | 손으로 큐레이션한 JSON, zod 로 검증, CI 게이트 |
| 아이콘 | [Phosphor Icons](https://phosphoricons.com) fill (MIT), 쓰는 11개만 내장 |
| 호스팅 | 정적 파일이면 어디든 |

지도 화면만 자바스크립트를 씁니다. 매장·건물·카테고리 페이지 899개는 전부 미리 렌더된
정적 HTML 이라 자바스크립트가 없습니다.

Only the map screen ships JavaScript. The 899 store, building and category pages are prerendered
static HTML with none.

### 설계에서 눈여겨볼 것 / Design notes worth knowing

- **거리는 GPS 가 아니라 역 출구 기준입니다.** 아키하바라 빌딩 협곡에서 GPS 는 30m 씩 틀려서
  옆 건물을 가리킵니다. 그래서 전기가 출구에서 도보 몇 분인지로 안내합니다.
- **숫자 클러스터를 쓰지 않습니다.** 대신 겹치는 핀을 가장 중요한 핀에 접고, 탭하면
  "이 자리에 N곳" 목록이 나옵니다. 확대하면 스스로 펼쳐집니다.
- **영업 상태는 "오늘 휴무"와 "영업 종료"를 구분합니다.** 밤 10시에 정기휴일이라고 표시하면
  오늘 문을 열었다는 사실을 숨기게 됩니다.
- **사진에는 촬영 연도를 붙입니다.** 커먼즈 사진 중에는 2010년대 초반 것도 있어서, 지금 외관으로
  오해하면 안 됩니다. 자기 사진이 없는 입주 매장은 건물 외관을 "○○ 외관"이라고 명시해 보여줍니다.

## 참여하기 / Contributing

**가장 도움이 되는 건 "이 가게 지금 어떤가요" 입니다.** 코드를 몰라도 됩니다.

앱의 매장 카드 아래 **오류 신고** 버튼을 누르면 매장 ID 가 채워진 이슈가 열립니다.
문 닫음·이전, 정보 수정, 새 매장 제보, 사진 제공 양식이 준비돼 있습니다.

직접 고치실 분은 `data/stores/<id>.json` 하나만 고쳐 PR 을 보내주세요. CI 가 스키마와 교차 검증을
자동으로 돌립니다.

자세한 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md) 에 있습니다. 요약하면 셋입니다.
**출처 없이는 넣지 않고, 모르면 비워두고, 고쳤으면 확인 날짜를 갱신합니다.**

The most valuable contribution is what a shop is like right now, and it needs no coding: the report
button on any store card opens a prefilled issue. To edit directly, change one JSON file and open a
pull request — CI validates it. See [CONTRIBUTING.md](CONTRIBUTING.md); the rules come down to
no source no entry, leave unknowns empty, and update the check date.

사진이 특히 부족합니다. 408곳 중 약 100곳에만 이미지가 있습니다.
Photographs are the biggest gap: only about 100 of the 408 shops have one.

## 문서 / Documentation

- [docs/PLAN.md](docs/PLAN.md) — 기획서와 결정 로그. 왜 이렇게 만들었는지가 다 적혀 있습니다.
- [data/README.md](data/README.md) — 데이터 파일 구조와 규칙
- [CONTRIBUTING.md](CONTRIBUTING.md) — 기여 방법
- `src/data/schema.ts` — 데이터 계약의 정본

## 라이선스 / Licence

| | |
|---|---|
| 코드 / Code | MIT — [LICENSE](LICENSE) |
| 데이터 / Dataset | ODbL v1.0 — [data/LICENSE-DATA.md](data/LICENSE-DATA.md) |
| 사진 / Photographs | 사진마다 다름 / individually — [public/photos/CREDITS.json](public/photos/CREDITS.json) |
| 아이콘 / Icons | MIT (Phosphor Icons) |

지도 데이터 © OpenStreetMap contributors, 타일 OpenFreeMap.
Map data © OpenStreetMap contributors; tiles by OpenFreeMap.

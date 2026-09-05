# 데이터 라이선스 / Data license

`data/stores/`, `data/buildings/`, `data/excluded.json`, `data/glossary.json` 의 내용은
**Open Database License (ODbL) v1.0** 으로 공개합니다.
<https://opendatacommons.org/licenses/odbl/1-0/>

좌표와 일부 속성은 OpenStreetMap 에서 가져왔습니다.
The coordinates and some attributes are derived from OpenStreetMap.
**© OpenStreetMap contributors**, ODbL. <https://www.openstreetmap.org/copyright>

`data/osm/overpass-akihabara-*.json` 은 Overpass API 로 받은 OpenStreetMap 추출본이며 ODbL 을 따릅니다.

## 사진 / Photos

`public/photos/` 의 이미지는 각각 다른 라이선스를 따릅니다.
`public/photos/CREDITS.json` 과 각 매장 레코드의 `photo.credit` / `photo.license` / `photo.source_url` 을 보세요.
대부분 Wikimedia Commons 의 CC0 · CC BY · CC BY-SA 사진입니다.
Images under `public/photos/` are licensed individually; see `public/photos/CREDITS.json`.

## 편집 콘텐츠 / Editorial text

한국어·영어 설명문(`one_line`, `how_to_find`, `tips`, `floor_guide`)은 직접 작성한 것으로,
데이터셋과 함께 ODbL 로 제공합니다.
The Korean and English descriptions are written for this project and released with the dataset under ODbL.

## 코드 / Source code

저장소의 소스 코드는 MIT 입니다. 루트의 [LICENSE](../LICENSE) 를 보세요.
The source code in this repository is MIT licensed; see [LICENSE](../LICENSE).

## 기여물 / Contributions

기여해 주신 데이터는 ODbL, 코드는 MIT 로 공개됩니다.
직접 찍은 사진을 주실 때는 이슈에 라이선스를 밝혀 주세요. CC BY 4.0 이나 CC0 이 가장 쓰기 좋습니다.
Contributed data is published under ODbL and contributed code under MIT. If you offer your own
photograph, state the licence in the issue — CC BY 4.0 or CC0 are the easiest to work with.

## 아이콘 / Icons

마커·타일·칩에 쓰는 카테고리 아이콘은 **Phosphor Icons** (fill 스타일)입니다.
MIT License, Copyright (c) 2023 Phosphor Icons. <https://phosphoricons.com>
상업 이용이 가능하고 표시 의무는 없지만, 출처를 남겨 둡니다.
쓰는 11개 경로만 `src/lib/glyphs.ts`에 내장했고 런타임에 받아오지 않습니다.

The category icons on markers, tiles and chips are Phosphor Icons (fill weight), MIT licensed.
Only the eleven paths in use are vendored into `src/lib/glyphs.ts`; nothing is fetched at runtime.

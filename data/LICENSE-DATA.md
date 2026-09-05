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
데이터셋과 함께 ODbL 로 제공하되 별도 라이선스를 적용할 수 있습니다.

## 아이콘 / Icons

마커·타일·칩에 쓰는 카테고리 아이콘은 **Phosphor Icons** (fill 스타일)입니다.
MIT License, Copyright (c) 2023 Phosphor Icons. <https://phosphoricons.com>
상업 이용이 가능하고 표시 의무는 없지만, 출처를 남겨 둡니다.
쓰는 11개 경로만 `src/lib/glyphs.ts`에 내장했고 런타임에 받아오지 않습니다.

The category icons on markers, tiles and chips are Phosphor Icons (fill weight), MIT licensed.
Only the eleven paths in use are vendored into `src/lib/glyphs.ts`; nothing is fetched at runtime.

## 무엇을 바꿨나요 / What changed

<!-- 한 줄이면 충분합니다. 예: "트레이더 본점 영업시간을 공식 페이지에 맞춰 수정" -->

## 데이터를 고쳤다면 / If you touched the data

- [ ] `source_urls` 에 **직접 읽은** 페이지를 넣었습니다 (구글 지도 링크는 출처가 아닙니다)
      Added a page I actually read to `source_urls` (a Google Maps link is not a source)
- [ ] 모르는 값은 추측하지 않고 비워뒀습니다 (`hours: null`, `tax_free: null`)
      Left what I could not confirm empty rather than guessing
- [ ] `verified_at` 을 오늘 날짜로 바꿨습니다
      Updated `verified_at` to today
- [ ] 가게가 문을 닫았다면 `data/excluded.json` 에도 넣었습니다
      Added closed shops to `data/excluded.json` as well
- [ ] `npm run validate` 가 통과합니다
      `npm run validate` passes

CI 가 스키마와 교차 검증을 자동으로 돌립니다. 체크를 다 못 채우셔도 PR 을 열어주세요 — 같이 채우면 됩니다.
CI runs the schema and cross-checks for you. Open the PR even if you cannot tick everything; we can finish it together.

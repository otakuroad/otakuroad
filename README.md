# otakuroad

Akihabara subculture store map: a mobile-first web app that shows, within two seconds of tapping a pin, what a store sells, whether it is open right now, and exactly which building and floor it is in. Astro 7 (static) + Svelte 5 islands + TypeScript, MapLibre GL, ko/en UI with Japanese store names always shown.

- `npm run dev` — dev server (regenerates `src/generated/` from `data/` first)
- `npm run validate` — zod-validate `data/stores`, `data/buildings`, `data/excluded.json` and run cross-checks (CI gate)
- `npm run check` · `npm test` · `npm run build` — type-check, unit tests, static build (`build` runs `validate` + `build:data` first)

Data rules: [data/README.md](data/README.md). Product, IA and architecture decisions: [docs/PLAN.md](docs/PLAN.md). UI strings live in `src/i18n/{ko,en}.json`; the data contract is `src/data/schema.ts`.

License: TODO — not chosen yet (the dataset is planned to be ODbL; see the plan). Map data © OpenStreetMap contributors.

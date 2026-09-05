# data/

Single source of truth for otakuroad. Hand-curated, validated by `src/data/schema.ts` (zod) in CI.

| Path | What |
|---|---|
| `stores/<id>.json` | One store per file. Schema: `Store`. |
| `buildings/<id>.json` | Multi-tenant buildings (Radio Kaikan etc.). Schema: `Building`. |
| `excluded.json` | Closed / moved venues that OSM seeding must not resurrect. |
| `glossary.json` | Japanese → Korean / English naming rules. |
| `first-road.json` | Ordered "first time? walk this" list (store ids + one-line reasons). |
| `osm/overpass-akihabara-<date>.json` | Cached Overpass extract (named shops, cafés, arcades, buildings). ODbL, © OpenStreetMap contributors. Note: OSM `level` is 0-based (0 = Japanese 1F). |

Rules
- Every record has `verified_at` and at least one `source_urls` entry. No source, no publish.
- `confidence: low` records are excluded from the build.
- Text fields are `{ko, en}` objects; both are required. `name` also carries `ja`.
- Tenant stores (`building_id` set) have no `location`; they inherit the building's pin.
- Adult-only stores are not included. R-18 floors inside general stores use `adult_content.level = "floor"`.
- Dataset license: ODbL (see repo LICENSE-DATA once added). Editorial text may carry a separate license.

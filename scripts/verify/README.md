# scripts/verify — the re-verification harness

Used for the adversarial pass that re-read every bulk-collected record against primary sources
(wave 1: 192 shops, 2026-09-05/06). Nothing here runs in CI.

1. `npm run audit -- --json > /tmp/audit.json` — mechanical leads per store.
2. `node scripts/verify/make-batches.mjs ids.json 5 /tmp/batches /tmp/results /tmp/audit.json`
   writes one self-contained prompt file per batch of five shops (rules, evidence policy, result
   schema, the records themselves and their audit leads). Give each file to an agent with web access;
   it writes `/tmp/results/<id>.json` per shop and never touches the repo.
3. `node scripts/verify/check-evidence.mjs /tmp/results` re-fetches every `evidence_url` and checks
   that the quoted text is really on the page (handles Shift_JIS/EUC-JP, HTML entities, attribute
   values, JSON bodies, a 403 → crawler-UA retry, a curl fallback for bad certificate chains, and
   X's syndication feed via the fxtwitter mirror). Writes `/tmp/evidence-report.json`.
4. `node scripts/verify/apply-results.mjs /tmp/results [--kind stores|buildings] [--dry] [--approve id:path,…] [--skip id:path,…]`
   applies only the changes whose evidence verified (or that you approved by hand after reading the
   page yourself), merges `add_source_urls`, sets `confidence` and `verified_at`, and turns closures
   into an `excluded.json` entry plus a deleted record. Then `npm run validate && npm test && npm run build`.

Buildings: `node scripts/verify/make-building-batches.mjs all 5 /tmp/batches-b /tmp/results-b` writes the
same kind of prompt for `data/buildings/*.json`, listing each building's curated tenants so the agent can
check the floor guide against them; results carry `tenant_leads` (tenant on another floor, gone, renamed,
or a subculture shop with no record yet) which are handled by hand or by a follow-up store batch. Apply with
`--kind buildings` (no closures; only floors, uncurated_floors, hours_note, exit_hint, address_ja, name and
the two URLs can change).

Lessons from wave 1: x.com returns 402 anonymously, but `syndication.twitter.com/srv/timeline-profile/screen-name/<handle>`,
`cdn.syndication.twimg.com/tweet-result?id=<id>&token=a` and `api.fxtwitter.com/<handle>` are readable
(rate-limited after a handful of calls per IP). suruga-ya.jp, dorasuta.jp and gdm.or.jp sit behind
Cloudflare challenges; archived copies plus the operators' live store lists worked. Agents' WebSearch
quota is per session — expect it to run out; Yahoo Japan search pages fetched directly still give dated
snippets. Directory sites (torecamap, akibatoreka, akihabara-cardmap, tabelog) are leads, never evidence.

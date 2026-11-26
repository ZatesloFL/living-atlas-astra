# Lane: GPT Astra

Your notes and reports go here. Read `AGENTS.md` at the repo root first.

Standing direction adopted: [Ask the Atlas, file 31](../docs/shared/31-ask-the-atlas.md); [lane A acknowledgement](reports/2026-11-25-03.md). Future authorized surfaces address the house intelligence as the Atlas and begin with conversation; per-surface implementation orders come through Silver.

## Where the build lives

- Repo: ZatesloFL/living-atlas-astra
- Live Pages URL: https://zateslofl.github.io/living-atlas-astra/
- Critical navigation: [Addendum 2 navigation recovery](reports/2026-11-26-03.md): live catalog map, You are here, one-action return across panels and Page, and holder-first directions.
- Current lane A movement: [Visitor movement and Thing cards](reports/2026-11-26-02.md): same-Place flight/zoom, confirmed viewing spots and entrance return. Structural Exhibit hall publication is filed for lane B; physical phone checks remain with Nic.
- Latest lane A work: [Duet Part 2](reports/2026-11-25-09.md), B1–B4 landed: personal grants/initiative, confirmed Lens proposals, pre-flight in words, and Discovery-backed ask-to-go with visible exact-address refusals. [Part 1 and addendum](reports/2026-11-25-08.md) are complete: A4–A7, Atlas Map, real Discovery provenance, Mara’s figure, holder crossing receipts and setup Lens consistency. Proxy v8 preserves v7 audio and passed seven live Docent calls with zero incomplete rejections.
- Previous lane A fix: [Existing-profile Arrival entry](reports/2026-11-24-20.md), runtime `07b3411`: Manage offers See your space only before a starter claim; the same profile reaches its home and Drive without clearing data. 250 Node tests and 12 targeted Arrival browser checks pass; the three served runtime files match.
- Discovery round: [Discovery round and combined verification](reports/2026-11-24-19.md). The five part reports are [index](reports/2026-11-24-13.md), [search/preview/Docents](reports/2026-11-24-15.md), [trails/events](reports/2026-11-24-16.md), [presence](reports/2026-11-24-17.md), and [owner inbox](reports/2026-11-24-18.md). [main HEAD](https://github.com/ZatesloFL/living-atlas-astra/commits/main) includes the final filing.

File 29 is implemented using the shared catalog/crossing engine and standing resolvers. It consumes lane B's [Connected Sources landing](reports/2026-11-24-14.md), including current source views, badges and uploaded declaration references. Search and boards show paired declarations, actual three readings and named gaps; Preview does not cross; local Docent discovery quotes that same index through ai.request; trails/events and presentation-safe presence share the rules; the existing owner proposal inbox spans actual owned Places. 249 Node tests and 127 distinct browser checks pass, with targeted rechecks after the final label/question cleanup. Missing general publication/vouch metadata and the reserved priced-door contract remain filed; values are not invented and supplied prices fail closed. Phone appearance and 60 fps remain Partial for Nic through Silver.

Earlier completed work remains [Arrival](reports/2026-11-24-05.md) and [standing phases 1–3](reports/2026-11-24-11.md). ai-proxy version 5 and the boycott's grounded live path are unchanged by Discovery; [the last live verification](reports/2026-11-24-06.md) contains six accepted typed asks, zero incomplete rejections/fallbacks, $0.000983 measured spend and exact proxy captures. Lane B's upload gateway is live under dev holders (report 14). Real account/verification/guardian/presence rails remain later Second Look work. The Builder head-to-head is not authorized.

## Run and verify

No installation or compilation is needed for the static app. From the repository root, `npm start` serves `index.html` on port 8000. All runtime imports are local, including Three.js. Live processes do not survive environment restarts; restart this command when needed. Use this existing checkout; do not create a worktree for routine tasks.

- `npm test`: 313 Node tests covering content, crossings, identity, profiles and receipts, plus the private AI proxy, accounting, provider validation and the actual Staff/client/server path with local Postgres and injected providers, including six exact v5 proxy captures replayed offline.
- `ATLAS_PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright-core node tests/docent-asking-browser.cjs`: four local-only name, typed question, tour and hall checks. The manual live script and its explicit opt-in are documented in the current report.
- `ATLAS_PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright-core node tests/live-docent-browser.cjs`: shipped-origin client checks using local assets and intercepted proxy responses, with zero live calls. Covers both Page and 3D, fallback labels, local mode, mobile layouts and stale answers.
- `ATLAS_PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright-core node tests/browser-smoke.cjs`: 22 functional checks using the cloud machine’s existing Chromium and Playwright. Start the local server first. In another environment, provide the path to its installed Playwright module and optionally `ATLAS_CHROMIUM`.
- The ◈ button in the app toggles fps, draw calls, scene, and rendering resolution. The display uses actual elapsed time; a software renderer’s numbers do not predict Pixel performance.
- Profiles, preferences, the last-used profile, and local receipts persist in localStorage when allowed. Unsaved developer overrides, position, and temporary door confirmations reset on reload. Blocked storage falls back to an explicitly labeled in-memory session. There is no login or profile sync; the AI proxy and private upload gateway are live backend integrations; durable account rails remain future work.
- `ATLAS_PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright-core node tests/tier-a-browser.cjs`: 16 round-2a checks, including native long-press touch events and first-run/reload behavior. Both browser suites accept `ATLAS_URL` if the server uses a different port.
- Historical work: A0, Tiers A/B/C, round 2c G2/G1/G3/G4 and authorized simulated D/E. Nic confirmed the pre-2c Pixel baseline; new physical visual/fps results remain Partial. The [G3 report](reports/2026-11-16-02.md) and current [G4/file-16 report](reports/2026-11-23-01.md) record the fixes and phone checklists. Earlier reports remain historical evidence; they do not authorize a builder comparison or later rounds.

## Report template

Copy this into a new `reports/YYYY-MM-DD-NN.md` each session.

```
# Report YYYY-MM-DD-NN (GPT Astra)

## Summary
Two or three sentences: what you built or changed this session.

## Build
Repo: | Live URL: | Commit:

## Tier A: polish and profiles
| Item | Pass / Partial / Fail | Note |
|---|---|---|
| Tier 1 fixes: signs, 1956 occlusion, portrait framing, Atlas labels | | |
| Identity: two independent axes and badges | | |
| First-run setup | | |
| Profiles: saved, remembered, switcher, radial wheel, switch receipts | | |
| Test panel with persistent TEST MODE banner | | |
| Teen cap without verification | | |

## Tier B: travel and access
| Item | Pass / Partial / Fail | Note |
|---|---|---|
| Atlas travel with doors respected | | |
| Waypoint and compass | | |
| Address bar | | |
| Pins, recents, home | | |
| Public / listed / hidden rooms | | |
| Grants with scope and expiry | | |
| Made and credential groups with individual overrides | | |
| Knock, invite, guest pass, key group | | |
| Room ledger entries and Who’s been here | | |

## Tier C: audience versions, style, layers
| Item | Pass / Partial / Fail | Note |
|---|---|---|
| Audience versions and “other versions exist” label | | |
| Style control per item | | |
| Layers: pins, preview, integrate, type filters | | |
| Propose-to-author merge | | |
| Preview as, split compare, lens diff | | |

## Phone checklist for Nic
Exactly what to tap, where to walk, and what should happen.

## Performance on the Pixel
Expected fps in studio / Tallahassee, draw calls, anything likely to stutter.

## Design choices worth comparing
What you did differently from the vision board, and why.

## Known problems
What's broken or rough.

## Next
What you'd do next with one more session.
```

- A0 diagnostics and safe mode: `?safe` disables post-processing/shadows. `tests/startup-browser.cjs` runs 19 recovery checks with the same environment variables as the other browser suites. Nic confirmed Pixel startup. Diagnostics now identifies the active quality level and offers a guarded full-quality retry; see report `2026-11-12-04.md`.

- `ATLAS_PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright-core node tests/content-browser.cjs`: 14 A6 checks covering Page-only startup, same-content rendering, Lens/Depth/Trust, form/place continuity, late/failing content and a data-only new room. It accepts `ATLAS_URL`. `?page` opens the independent reader; `?safe&form=3d` retries safe 3D even with a saved Page preference.

- `tests/tier-b-browser.cjs`: eight access/travel browser checks (same Playwright and ATLAS_URL environment variables). `tests/polish-browser.cjs`: five diagnostics/labels checks. Access receipts, grants, pins and recents are browser-local simulation.

- `tests/tier-c-browser.cjs`: nine audience/style/layer/creator checks, including a native touch divider drag, reload persistence, owner merge and split full-bloom validation. Same Playwright and ATLAS_URL variables. Layer merges are browser-local and credited in the room ledger; creator preview does not switch the saved profile.

- Completed order: round 2c G2 → G1 → G3 → G4, then authorized simulated round 3 D/E. Reports `2026-11-12-06` through `2026-11-12-11` cover each goal/tier. `tests/hud-browser.cjs` checks both Pixel orientations for HUD intersections; default local test URL is port 8003. Brief 08 records Nic’s Level 1 baseline: 60 fps, DPR 1.65, 17–22 draws.

- `tests/fast-travel-browser.cjs`: five pre-flight/fade/arrival/cancel/waystation/window checks. Default local URL port 8003; same Playwright module variable. Report `2026-11-12-07`.

- `tests/kit-browser.cjs`: five exhibit/player/budget checks (port 8003 by default). Report `2026-11-12-08`; sample assets generated locally, no archival media connected.

- `tests/page-design-browser.cjs`: four Page-only presentation, sticky bar, layer and responsive checks. Report `2026-11-12-09`. Current Page controls are behind Places/Settings; older scripts with visible dropdowns or the retired floating Page button document earlier UI checkpoints.

- `tests/community-browser.cjs`: five Town Square/discovery/trail/event/privacy/persistence checks. Report `2026-11-12-10`. Discovery opens from the location chip, physical kiosks or Page → Discover.

- `tests/staff-browser.cjs`: four simulated staff, proposal, hiring and Page/receipt checks. `tests/render-budget-browser.cjs`: three full-bloom/shadow scene-budget and picking checks, covering Square/History/Studio plus Commons/Night Market/After Dark views. Same Playwright module and URL variables; port 8003 default. Report `2026-11-12-11`.

- Historical round 2b proposal: [report -12](reports/2026-11-12-12.md). The original SQL, common builder schema and ten synthetic requests remain in `lane/proposals/`. Later reports and operator receipts record approval, implementation and activation; current work is the file-17 hall above.

- `tests/kit-regression-browser.cjs`: nine additional G3 checks for glyph zoom, native video events/rebinding, capture-track cleanup, Lens changes, lightbox/source lifecycle, stale speech events, Child filtering, consistent procedural artwork and independent rotated kit instances. Same Playwright module and local port 8003 as the original kit suite; no external requests or live AI.

- `tests/page-reading-browser.cjs`: eight G4 checks for reading anchors/focus, late hero media, responsive notes, readable components, audience/consent gates and local-only defaults. `tests/staff-standing-browser.cjs`: three fresh/legacy-store/expiry/revocation checks; `tests/staff-standing.test.js`: five local-store grant/receipt tests. Same local server and Playwright configuration as above.

- `tests/interior-browser.cjs`: 13 hall checks, including physical exhibit taps, entry/exit receipts and presence, media distance, audience switching, Page return and Lens-hide recovery. `tests/interior-recovery-browser.cjs`: five maximum-scale/reuse/newspaper/legacy-save/door-barrier checks. Same Playwright module variable and local port 8003. [File-17 report and phone checklist](reports/2026-11-23-02.md).

- `ATLAS_URL=http://127.0.0.1:8000/ ATLAS_PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright-core node tests/docent-reliability-browser.cjs`: four Page/Staff selection checks, all local. `scripts/verify-cold-walk.cjs` uses the same variables and walks a fresh root through actual keyboard/visible controls, without test hooks or the Places list. [File-19 report](reports/2026-11-23-04.md) names all six live receipts and the separate manual, explicit-opt-in live harness; normal tests never make paid calls.

- Arrival: `tests/arrival-browser.cjs` (seven UI/registration/persistence checks), `tests/arrival-doors-browser.cjs` (three owner-choice/raise checks), and `scripts/verify-cold-walk.cjs` (fresh root → owned starter → public campus → hall, no test hooks). Use the same Playwright module and local server variables. `tests/arrival.test.js`, `tests/arrival-policy.test.js` and `tests/paired-proxy.test.js` cover durable records, canonical ownership, references, paired policy/cascade checks and protocol compatibility. No normal test makes a paid request.

- Standing: `tests/standing-browser.cjs` covers 13 record, facet, grant, knock, Lens and versioned-display flows. `tests/standing-records.test.js`, `tests/standing-facets.test.js` and `tests/standing-policy.test.js` cover derivation, contests, privacy, gate composition and scoped authority. The published derivation is `lane/standing-derivation.md`. Use the same local server/Playwright variables; no paid calls.

- Discovery: `tests/discovery-browser.cjs` (six search/card/preview/Docent/Knock/Enter checks), `tests/presence-browser.cjs` (two presentation/privacy checks), and `tests/discovery-inbox-browser.cjs` (two owner/proposal/receipt checks). Use `ATLAS_URL` and `ATLAS_PLAYWRIGHT_MODULE` as above. Node suites `discovery-index`, `discovery-answer`, `discovery-sources`, `discovery-presence` and `discovery-inbox` test catalog/resolver composition and boundary behavior. No normal test makes a paid AI call. Combined results and served hashes: [Discovery evidence](evidence/discovery-2026-11-24.json).

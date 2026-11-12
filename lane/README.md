# Lane: GPT Astra

Your notes and reports go here. Read `AGENTS.md` at the repo root first.

## Where the build lives

- Repo: ZatesloFL/living-atlas-astra
- Live Pages URL: https://zateslofl.github.io/living-atlas-astra/
- Latest commit: [main HEAD](https://github.com/ZatesloFL/living-atlas-astra/commits/main) · locally tested app build [415905f](https://github.com/ZatesloFL/living-atlas-astra/commit/415905f8db28691244f2c2d55889d4442e9d2e77). The session report is committed afterward as documentation.

## Run and verify

No installation or compilation is needed for the static app. From the repository root, `npm start` serves `index.html` on port 8000. All runtime imports are local, including Three.js. Live processes do not survive environment restarts; restart this command when needed. Use this existing checkout; do not create a worktree for routine tasks.

- `npm test`: 32 Node tests for typed content, late-loading fallbacks, crossing rules, independent identity settings, content ceilings, profile storage, hash-chained receipts, and Atlas label separation.
- `ATLAS_PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright-core node tests/browser-smoke.cjs`: 22 functional checks using the cloud machine’s existing Chromium and Playwright. Start the local server first. In another environment, provide the path to its installed Playwright module and optionally `ATLAS_CHROMIUM`.
- The ◈ button in the app toggles fps, draw calls, scene, and rendering resolution. The display uses actual elapsed time; a software renderer’s numbers do not predict Pixel performance.
- Profiles, preferences, the last-used profile, and receipts persist in localStorage when allowed. Unsaved developer overrides, position, and temporary door confirmations reset on reload. Blocked storage falls back to an explicitly labeled in-memory session. There is no login or backend.
- `ATLAS_PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright-core node tests/tier-a-browser.cjs`: 16 round-2a checks, including native long-press touch events and first-run/reload behavior. Both browser suites accept `ATLAS_URL` if the server uses a different port.
- Current round: A0 and v4 Tier A including A6. Tier B starts after the phone startup/Tier A checkpoint; see `reports/2026-11-12-03.md`. Earlier reports remain as history.

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

- A0 diagnostics and safe mode: `?safe` disables post-processing/shadows. `tests/startup-browser.cjs` runs 19 recovery checks with the same environment variables as the other browser suites. Pixel startup confirmation is still required; see report `2026-11-12-03.md`.

- `ATLAS_PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright-core node tests/content-browser.cjs`: 14 A6 checks covering Page-only startup, same-content rendering, Lens/Depth/Trust, form/place continuity, late/failing content and a data-only new room. It accepts `ATLAS_URL`. `?page` opens the independent reader; `?safe&form=3d` retries safe 3D even with a saved Page preference.

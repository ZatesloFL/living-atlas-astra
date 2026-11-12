# Lane: GPT Astra

Your notes and reports go here. Read `AGENTS.md` at the repo root first.

## Where the build lives

- Repo: ZatesloFL/living-atlas-astra
- Live Pages URL: https://zateslofl.github.io/living-atlas-astra/
- Latest commit: [main HEAD](https://github.com/ZatesloFL/living-atlas-astra/commits/main) · verified app build [4481f76](https://github.com/ZatesloFL/living-atlas-astra/commit/4481f76b1d7d1be6cc8b30ffa3f672fce3aba9a5). The session report is committed afterward as documentation.

## Run and verify

No installation or compilation is needed for the static app. From the repository root, `npm start` serves `index.html` on port 8000. All runtime imports are local, including Three.js. Live processes do not survive environment restarts; restart this command when needed. Use this existing checkout; do not create a worktree for routine tasks.

- `npm test`: 11 Node tests for crossing rules, identity checks, embedded limits, display filters, and private-room data.
- `ATLAS_PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright-core node tests/browser-smoke.cjs`: 22 functional checks using the cloud machine’s existing Chromium and Playwright. Start the local server first. In another environment, provide the path to its installed Playwright module and optionally `ATLAS_CHROMIUM`.
- The ◈ button in the app toggles fps, draw calls, scene, and rendering resolution. The display uses actual elapsed time; a software renderer’s numbers do not predict Pixel performance.
- State is in memory and resets on reload. There is no login, backend, or persistence.
- Tier 2 is gated on Nic’s confirmation that tier 1 works smoothly on his Pixel. See the exact test route in `reports/2026-11-12-01.md`.

## Report template

Copy this into a new `reports/YYYY-MM-DD-NN.md` each session.

```
# Report YYYY-MM-DD-NN (GPT Astra)

## Summary
Two or three sentences: what you built or changed this session.

## Build
Repo: | Live URL: | Commit:

## Tier 1: walk and see
| Item | Pass / Partial / Fail | Note |
|---|---|---|
| Studio and Tallahassee load, connect, game-quality at 60 fps | | |
| Touch controls feel good | | |
| Four edge types behave differently | | |
| Crossing check by dimension (pass / door with reason / not rendered) | | |
| Lens: View as, content presets + Advanced, Show me | | |
| Info cards with content chips | | |
| Atlas + "Show what others see" | | |
| Private room shows doorway and address only | | |

## Tier 2: change things
| Item | Pass / Partial / Fail | Note |
|---|---|---|
| Build: Style, Substance (4 permission states, forks, diff), Connect | | |
| Ledger: History + Verify chain | | |
| Depth, Trust from, Style presets, Quiet mode | | |

## Tier 3: the rest
| Item | Pass / Partial / Fail | Note |
|---|---|---|
| Contest flow end to end | | |
| Narrate and Text forms | | |
| Bus boycott time slider | | |
| Intro cards | | |
| Stretch: drop a ready-made room into homestead | | |

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

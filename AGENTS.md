# Living Atlas: instructions for the builder (GPT Astra)

You are the sole builder of the Living Atlas prototype. (An earlier plan for a parallel second builder was dropped.) Nic is the owner; his phone testing is the final word on look, feel and performance.

## Read first, in order

1. `docs/shared/01-concept.md`: what Living Atlas is and why. Read for intent.
2. `docs/shared/02-build-brief.md`: what to build (v3). Read for exact requirements.
3. `docs/shared/03-vision-board.md`: visual direction and screen-by-screen UI.
4. `docs/shared/04-decisions-and-open-questions.md`: what's settled, what isn't, what's out of scope.
5. `docs/shared/05-brief-v4-round-2a.md`: round 2a (done). v4 builds on v3; where they differ, v4 wins.
8. `docs/shared/08-brief-round-2c-arrival-and-presentation.md`: **the current round** (fast travel with pre-flight and fade, HUD zones, bus boycott exhibit, designed Page). Do it before rounds 3 and 4.
6. `docs/shared/06-brief-round-3-queued.md`: **queued.** Read it for direction so your 2a work doesn't block it, but don't start it until Nic says go.
7. `docs/shared/07-brief-round-4-connected-sources-queued.md`: **queued.** Don't build it yet, but A6's block model must already support its source pointers (see its last section).
9. `docs/shared/09-brief-builder-gus-queued.md`: **queued** (Build mode and Atlas Gus). Don't build it yet, but round 2c's exhibits must be reusable components with behaviors as data (see its section "What round 2c must already do").
10. `docs/shared/10-ai-and-server-plan-queued.md`: **next after round 2c, before round 3** (Supabase, AI proxy, model routing, voice). Nic has created the Supabase project and added the provider keys as Edge Function secrets. **One part applies now:** every AI-touching feature goes through the single `ai.request` interface with a `simulated` provider (see its "Do this now" section).
11. `docs/shared/11-round-2b-proxy-approval-checklist.md`: **the approval gate for round 2b.** When you propose the round 2b proxy plan, answer its checks 1-11 in order in a lane report, each with evidence, then stop for Nic's approval. No schema changes or deployments before his go.
12. `docs/shared/12-simplification-and-unification-crossing-engine.md`: **standing design direction** (the crossing engine: five primitives, one verb, declare→measure→show the gap, one grant object, pre-flight for all plans). Adopt its vocabulary in all new work and proposals, including the round 2b plan; map existing records onto it only at natural refactors and log mappings in `lane/decisions.md`. It does not interrupt round 2c or pull queued rounds forward.

13. `docs/shared/13-project-bridge-second-look-rails.md`: **standing design direction** (Second Look projects as backed Things: backing not copying, the `backing_ref` slot, Atlas never mints backing identity). Add the slot at the next natural data-model touch and log it in `lane/decisions.md`; it does not interrupt round 2c, pull queued rounds forward, or authorize any live integration yet.

`docs/shared/` is the source of truth. **Never edit anything in `docs/shared/`.** Where the vision board and the brief differ, the brief wins. If something there is unclear or wrong, say so in `lane/questions.md`; don't work around it silently.
14. `docs/shared/14-database-operator-silver.md`: **standing rule from round 2b on.** Silver, not you, applies migrations and deploys to Supabase. Your job is to hand Silver complete, reviewable files and a model-check endpoint it can run.

## Where things go

- **App code:** repo root. The app must be served at `index.html` via GitHub Pages. Three.js is vendored in `vendor/three/`; no runtime CDN. Generate all assets in code.
- **Your lane (reports and notes):** `lane/`. Write your notes and reports only there.
  - `lane/README.md`: fill in "Where the build lives".
  - `lane/decisions.md`: one line per call the brief didn't settle, with the reason.
  - `lane/questions.md`: anything unclear or wrong in `docs/shared/`.
  - `lane/reports/YYYY-MM-DD-NN.md`: a new report per work session, using the template in `lane/README.md`. Never overwrite old reports.

## Rules

1. Target: Chrome on a Google Pixel phone, portrait first, landscape working. 3D-game visual quality, stable 60 fps.
2. Work the current round's goals in order (round 2c: G2 HUD zones first, then G1, G3, G4). Make each solid before starting the next.
3. Push commits directly to `main` with clear messages so GitHub Pages updates. If you can't push to main, open a PR and tell Nic.
4. No backend, login or live AI until round 2b (file 10) starts. From then: Supabase is the only backend; provider keys exist only as Edge Function secrets and must never appear in the repo, page, logs or reports; schema changes and deployments are proposed to Nic and applied only after he approves. **You write the code; you never apply it.** Migrations (each with a rollback file) go in `supabase/migrations/`, the function in `supabase/functions/ai-proxy/`; Silver applies and deploys them after Nic approves (see file 14). Never connect to the live Supabase project yourself. Local-only mode must keep working. Visitors still can't create new rooms from scratch until round 5.
5. You can't see the app running. After each tier, tell Nic exactly what to check on his phone. His feedback is the source of truth for visuals, feel and frame rate. Anything you couldn't verify yourself is Partial until he confirms it.
6. Only stop and ask for something that truly blocks the build. Otherwise make the most reasonable call, log it in `lane/decisions.md`, and keep going.
7. Privacy: sample content about Nic stays at the level in the brief. No family details beyond the private-room doorway, no home address, no named private people.

## Done for this round

The checklist at the end of the current brief (round 2c: `08-brief-round-2c-arrival-and-presentation.md`), each item reported Pass / Partial / Fail in your report, with the live Pages URL.

# Living Atlas: instructions for the builder (GPT Astra)

You are one of two builders working on the same prototype in parallel. The other builder works in a separate repo from the same instructions. Nic (the owner) compares the results.

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

`docs/shared/` is the source of truth. **Never edit anything in `docs/shared/`.** Where the vision board and the brief differ, the brief wins. If something there is unclear or wrong, say so in `lane/questions.md`; don't work around it silently.

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
4. No backend, login or live AI. Visitors view and make permitted edits; no creating new rooms from scratch.
5. You can't see the app running. After each tier, tell Nic exactly what to check on his phone. His feedback is the source of truth for visuals, feel and frame rate. Anything you couldn't verify yourself is Partial until he confirms it.
6. Only stop and ask for something that truly blocks the build. Otherwise make the most reasonable call, log it in `lane/decisions.md`, and keep going.
7. Privacy: sample content about Nic stays at the level in the brief. No family details beyond the private-room doorway, no home address, no named private people.

## Done for this round

The checklist at the end of the current brief (round 2c: `08-brief-round-2c-arrival-and-presentation.md`), each item reported Pass / Partial / Fail in your report, with the live Pages URL.

# 25 — Builder round (round 5) (work order, Astra lane B)

Build order. Filed by Silver for Astra, 2026-11-24, on Nic's go.
Implements brief 09 (file 09, the Builder) under files 20–23.
Runs IN PARALLEL with file 24 (Arrival round, lane A) under the
partition at the end of this order — read it before touching
shared surfaces. This lane starts in a NEW worker; its first act
is the full AGENTS.md reading order (items 1–25), then this order.

## The round in one line

Build mode becomes real: a member composes a place from a governed
kit — talk, place, tune — as a draft they preview and publish,
inside the same laws (Lens, grants, receipts, budgets) as
everything else in the Atlas.

## First deliverable: the kit data contract

Before any UI: the kit format — how a Place, its rooms/Things,
layout, fixtures, exhibits, and helper attachments are expressed
as data a draft can hold. It generalizes what already exists (the
file 17 interior kit, G3 exhibits, authored Places). Lane A's
starter place (file 24) must be expressible in this format; treat
that as the contract's first test. Land the contract as a short
design note in the lane report for Silver's review before building
machinery on it.

## Scope

1. **Visit / Build mode split.** Build mode has the blueprint look
   from brief 09: fly/orbit camera, the member's own places and
   drafts listed, no visitor Lens filtering inside your own draft
   (you see your whole place; the Lens governs visiting, not
   owning).
2. **The kit drawer.** Everything already provable goes in as
   pieces: spaces and shells (incl. the interior kit), the G3
   exhibit forms, fixtures, and helper attachments (a Docent for
   your place, under the standing/leased grant rules of file 16).
   Pieces carry their content scores as data (owner-declared at
   publish, file 20 judging unchanged).
3. **The inspector.** Select, move, rotate, resize within piece
   limits; style from the existing style system; per-piece
   settings. Everything is data — no user code, ever (brief 09
   governance).
4. **Draft → preview → publish.** Building happens in a draft.
   Preview renders the draft as a visitor would meet it (Lens
   checks, pre-flight, door choices per file 20). Publish is a
   receipted act that makes the draft the live place; the previous
   version's records remain (reset law, file 23: re-projection
   never destroys data or capabilities).
5. **Three ways to build.** Place pieces by hand; tune them in the
   inspector; and talk — the Atlas primary assists in Build mode.
   THIS ROUND the primary's build help is scripted proposals in
   brief 09's pattern (propose records; the member approves;
   receipts name the proposer). Refer to the primary by role
   descriptor only ("your building assistant") — **do not coin a
   proper name for it in code or copy** (file 21: naming comes
   last, and it is Nic's). Live model proposals via the proxy's
   builder route are a later step, not this round.
6. **Behaviors as data.** When → If → Then rules from brief 09,
   chosen from menus, stored as records, receipted like everything
   else. Ship the mechanism with the brief's example behaviors;
   no scripting surface.
7. **The Build button becomes honest.** `src/build-ui.js` becomes
   the real Build HUD. The existing "Preview the audience" creator
   tool moves inside Build mode as one of its panels (it was
   always a Build-mode tool, brief 09) — the button that opens
   Build mode now opens Build mode.
8. **Budgets are law.** The per-room performance budget binds the
   kit: pieces declare their cost, the drawer shows it, a draft
   over budget cannot publish until fixed. 60 fps on a phone is
   rule one (brief 09). Draw-call ceilings from files 17–19 stand.
9. **AI-generated assets** (if any piece generates imagery this
   round): labeled as generated, owner confirms content scores
   before publish, never presented as authentic artifacts
   (brief 09). When in doubt, leave generation out and ship the
   kit with authored/procedural pieces.

## Partition (parallel with file 24 — binding)

- Lane B (this order) OWNS: `src/build-ui.js`, kit and inspector
  modules, draft/preview/publish machinery, the HUD mode shell.
- Lane A OWNS: onboarding/profile/interview code, seed and
  starter-place data, `src/staff.js`, `src/rules.js`, Lens and
  crossing surfaces.
- Neither lane edits the other's surfaces. A needed change on the
  other lane's surface is filed through Silver in the lane report's
  FOR FILING section — never edited directly, never worked around
  with a parallel implementation.
- Push discipline: fetch main before every push; small commits;
  if main moved under you, rebase your understanding before
  pushing, and say so in the report. Silver verifies each landing
  and runs the regression suites; a red suite stops the other
  lane's next push until triaged.
- Dev mode (AGENTS.md rule 4) applies to this lane identically:
  guardrails, synthetic test data only, no cap/price/route-model/
  secret changes, every live action logged in the lane report.

## Acceptance

- A member can enter Build mode on their own place, compose a
  room from kit pieces, preview it as a visitor (Lens and doors
  behaving per file 20), and publish it — receipted end to end.
- The starter place from lane A opens in Build mode and can be
  edited and re-published without data loss.
- Over-budget drafts refuse publish with the costs named.
- Existing suites green; new coverage for draft/publish, kit
  contract, and budget enforcement.
- Report per landing, FOR FILING section included. Nic's device
  checks come from Silver's rundown, not from Astra.

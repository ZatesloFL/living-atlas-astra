# 24 — Arrival round (work order, Astra lane A)

Build order. Filed by Silver for Astra, 2026-11-24, on Nic's go.
Implements file 23 (onboarding) and the visiting half of file 20
(the Lens is a vote). Runs IN PARALLEL with file 25 (Builder round,
lane B) under the partition at the end of this order — read it
before touching shared surfaces.

## The round in one line

A new person arrives, is interviewed, and ends up standing in a
starter place that is theirs — with their Lens set their way, a
Drive room, and a workshop — instead of landing as a tourist in
Town Square with a form to fill in.

## Scope

1. **"See your space" arrival flow.** Replace the bare first-load
   profile form with the file 23 sequence: questions → interview →
   Lens → rooms. The profile-first order itself stays (file 19
   decision: deliberate, a local form, not an account gate). The
   flow's framing and first screen promise the person's own space
   taking shape, not a tour.
2. **No people-search — removed, not simulated.** There is NO
   internet search on real people in this round and no placeholder
   or simulated version of one (Nic, 2026-11-24: "Don't fake it,
   just remove it"). Do not build the offer, the marking UI, or any
   stub of it. The interview and the sources the person provides
   are the only inputs about them. (File 23 as amended governs.)
3. **The interview.** Hobbies and interests, and the local-area
   question as an explicit opt-in (include my local area: yes/no —
   never defaulted). Answers become records the starter place is
   built from; anything not answered is "not set yet," never filled
   in by assumption.
4. **The starter place — three inputs, furnished lightly.**
   (a) What the person provided in the interview. (b) Model
   knowledge about their declared hobbies and interests.
   (c) Sources the person provides. Model-built furnishings are
   proposals, visibly the system's work — the person keeps, edits,
   or removes them; they are never presented as facts about the
   person. The starter is a starting point: the person does the
   real building (file 25). Do not over-build on their behalf.
5. **Public selection.** During arrival, the person can browse
   already-created, publicly shared Places and Things and include
   selections in their starter place. Inclusion is by reference:
   the original's owner, scores, and standing are unchanged; the
   included item is Lens-checked like anything else; the owner's
   grant rules, including revocation, still govern it. Nothing is
   copied into the person's estate.
6. **Three starts.** (a) The starter place built as above;
   (b) from scratch (an empty claimed place); (c) from a template
   (ship at least one template beyond the generated starter). The
   generated starter place is expressed as DATA in the Builder
   round's kit format (file 25's first deliverable) — if the kit
   format cannot express the starter place, file that gap through
   Silver as a Builder defect; do not invent a parallel format.
7. **The two standard first rooms**, as authored Places in the
   starter place:
   - The **Drive room**: the personal archive shell — the person's
     photos/things live here; this round ships the room, its
     organization surface, and honest "archive not synced" style
     states where sources are not yet connected (round 4 territory,
     do not build sync).
   - The **workshop**: Second Look's premises in-world (file 23).
     This round ships the room and the front-end reference surface
     (what it is, the free Second Look account explanation, product
     and pricing presentation as static honest copy) — the live
     Second Look backing is file 13 bridge work, not this round.
     No fake live data: if it is not connected, it says so.
8. **Lens at arrival (file 20).** The Lens setup inside onboarding
   leads with per-dimension sliders (amount × graphicness in plain
   words); age presets survive only as quiet starting positions.
   The surface speaks in dimensions, never age labels.
9. **File 20 visiting rules.** Ratings cascade: crossings check the
   scores of the exact room/Thing being entered, at every nesting
   level, against the visitor's current space. Two-sided doors:
   an owner may set an entrance threshold, or admit below-threshold
   visitors to the visibly filtered rendering — the owner's declared
   choice is shown at pre-flight; filtered renderings are visibly
   filtered, never silently rewritten. A visitor may raise a
   dimension for one Place at its door, within hard limits,
   receipted. District polish caps (the History Quarter pattern)
   are removed as a mechanism — zoning stays, toning goes.
10. **Regression floor.** Files 16–19 behavior unregressed: standing
   Docents, the hall, named helpers, typed asks, the reliability
   fixes. The existing test suites stay green; add coverage for the
   arrival flow, cascade checks, and door choices.

## Partition (parallel with file 25 — binding)

- Lane A (this order) OWNS: onboarding/profile/interview code,
  seed and starter-place data, `src/staff.js` seeding for new
  Places, `src/rules.js` and the crossing checks, Lens surfaces.
- Lane B OWNS: `src/build-ui.js`, the kit, inspector, draft/publish
  machinery, the HUD mode shell.
- Neither lane edits the other's surfaces. A needed change on the
  other lane's surface is filed through Silver in the lane report's
  FOR FILING section — never edited directly, never worked around
  with a parallel implementation.
- Push discipline: fetch main before every push; small commits;
  if main moved under you, rebase your understanding before
  pushing, and say so in the report. Silver verifies each landing
  and runs the regression suites; a red suite stops the other
  lane's next push until triaged.

## Acceptance

- A fresh profile can walk the whole arrival: form →
  interview → Lens → starter place, ending standing in
  their own place with a Drive room and a workshop, every
  un-answered thing honestly "not set yet."
- Grok's cold walk still works (his standing suite is the check).
- Door pre-flight shows threshold vs filtered-admission correctly
  on a Place of each kind; a receipted at-door raise works and
  expires with the visit.
- Report per landing, FOR FILING section included, per standing
  lane practice. Nic's device checks come from Silver's rundown,
  not from Astra.

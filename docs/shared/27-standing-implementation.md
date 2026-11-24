# 27 — Standing implementation (build order, Astra lane A)

Build order. Filed by Silver for Astra, 2026-11-24, on Nic's go.
Implements file 26 (standing + the canonical lexicon). Lane A
owns this order under the standing partition (files 24/25):
rules, Lens, crossings, records are lane A surfaces. It queues
**behind file 24's Lens/crossing landing** — standing rules plug
into crossings, so that landing lands first. Phase 1 (records)
may begin alongside file 24's remaining work at lane A's
discretion; phases run in order.

## The order in one line

Make standing real: measurements (Steward and audience) become
first-class records, the four facets are derived from receipts,
and doors, knocks, and the Lens can consult the readings — all in
file 26's words, and no others.

## Phase 1 — Measurement records

1. **Measurement as a record type**: measurer (with identity tier
   and relationship to the Place: owner / designate / independent
   / audience), the thing measured, per-dimension both dials
   (file 20's ruling), the declaration it was checked against, the
   resulting gap, timestamp, receipt. Steward readings and
   audience readings are the same record type with different
   measurer classes.
2. **Audience reading capture**: a verified visitor with a
   crossing receipt for a thing may file one audience reading per
   thing, per-dimension both dials plus words; editable, with
   edits receipted and the display marked "edited." Anonymous
   presences cannot file readings.
3. **The three-reading info card**: Declared · Steward · Audience
   shown side by side wherever scores are shown. Where no Steward
   or audience reading exists, the slot says so honestly
   ("unmeasured"), never a filled-in guess.
4. **Contest + re-measurement**: a contested measurement queues a
   re-measurement; the outcome supersedes by receipt (the original
   stays in history). Audience-vs-declaration divergence past a
   threshold queues a Steward re-measurement automatically.

## Phase 2 — Facets and readings

5. **Facet derivation**: declaration, measurement, helper, and
   commitment facets computed from receipts by a published,
   recomputable derivation (the derivation rule ships in the repo
   as a document, so anyone can check a reading against the
   receipts). Helper facet consumes the AI proxy's validation
   receipts that already exist.
6. **Readings**: each facet exposes a current reading weighted
   toward recent history, with the full record one tap away.
   "Unmeasured" is the reading for actors/places with no relevant
   receipts — rendered as such, never as zero or as a warning.
7. **Surfaces**: an actor's record view (their facets, browsable
   per file 26's privacy map); a Place's declaration record at its
   door and on its info card; an agent's badge showing its
   operator's record beside its own.

## Phase 3 — Standing at work

8. **Door standing rules**: owners may add facet-based admission
   rules to a door (e.g. auto-admit helpers whose helper reading
   is clean; require a declaration reading for agents acting for
   owners). Rules are declared door terms, shown at pre-flight.
   The Atlas's own public places ship with no standing
   requirements; starter templates ship with none.
9. **Knock carries the record**: a knock presents the knocker's
   relevant facets to the owner; hiring/admission UI uses file
   26's words only.
10. **Lens standing preferences**: visitors may add standing
    preferences to their Lens (warn/filter by a Place's
    declaration gap history; optionally consult audience readings
    where no Steward has measured).
11. **Steward grants**: an owner may appoint a Place Steward by
    grant — a named human, an agent they operate, or a template
    agent they configure — scoped powers (measure, contest,
    admit, exclude from display), leased or standing, revocable,
    receipted; the appointment lands on the owner's commitment
    record; readings filed under it display the delegation chain.

## For lane B (filed through Silver, per the partition)

Kit contract v2 must carry, per Thing/Place: the declaration
(both dials), plus references to its measurement records and its
declaration-record reading, so drafted and published places
participate in standing without a parallel shape. Lane A files
the exact slot request in its first report under this order if
v2 has not already allowed for it.

## Out of scope

Commerce mechanics (priced doors, paid leases — file 26 records
the model; the payment/lease machinery is a later order),
discovery surfacing of standing (round 3), any staff review
tooling (there is none, by design), and any change to caps,
routes, models, or prices (dev-mode guardrails stand).

## Acceptance

- A published thing can be measured by a Steward and rated by a
  visitor who crossed into it; its info card shows all three
  readings or honest "unmeasured" slots.
- A contested measurement re-measures and the record visibly
  repairs.
- A creator who under-declares accumulates a visible declaration
  gap; a door with a standing rule and a Lens with a standing
  preference both respond to it.
- A template Steward appointed by grant files a reading that
  displays its full delegation chain.
- All UI copy uses file 26's lexicon verbatim. Existing suites
  green; new coverage for derivation, contests, and door rules.
- Report per landing, FOR FILING section included.

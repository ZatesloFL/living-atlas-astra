# 19 — Docent reliability: typed answers that finish, Staff that follows the Place, and the front door

Filed by Silver for Astra, 2026-11-23. Source: Grok's file 18 regression
run (2026-11-24 00:28 UTC), reconciled by Silver against
`atlas_ai.call_receipts`. Three items, in priority order.

## Item 1 — Typed answers are truncating (evidence attached)

Grok typed "What bus service did residents boycott?" at the boycott.
The live path triggered — this was not an environment block — but the
answer never reached him. Server receipt **`bcf259bd`**
(2026-11-24 00:28:31 UTC): **rejected**, failure class
**`provider_output_incomplete`**, 512 output tokens of which **458 were
reasoning tokens**. The model's answer envelope ran out of room
mid-answer; validation refused the incomplete output; the client fell
back to "Simulated · live helper unavailable" — the honest label, and
the correct behavior.

The same typed question passed in your file 18 run (receipt `83a2c739`,
accepted, 190 micro-USD). So this is variance: typed questions make the
guide model reason longer, and sometimes the answer doesn't fit.

- Give the typed-answer path enough output headroom that answers
  complete — how is your call (budget, reasoning steering, route
  config within your dev-mode authority; caps and prices do not move).
- The evidence validator does not change. A complete answer that cites
  loosely still gets rejected; an incomplete one still gets refused.
  The fix is that answers finish, not that the gate widens.
- Acceptance: run the boycott typed question at least five times, plus
  the off-topic don't-know ("What is the airspeed of a swallow?").
  Every run ends accepted or as an honest don't-know; none rejected
  `provider_output_incomplete`. Name the receipts in the report.

## Item 2 — The Staff surface doesn't follow Places selection

Grok, cold: picking a Place from the Places list did not reliably
switch the active Staff surface — it stayed on the previous Place until
he clicked "Enter this Page." A first-time visitor asking "who helps
here?" can be shown the wrong Place's helpers with no sign anything is
stale.

- Make the Staff surface follow the selected Place, or make the step
  that commits the switch unmistakable in the UI. A visitor should
  never see one Place's staff while standing in another without the
  interface saying so.
- Acceptance: switching Places updates the Staff heading and helpers to
  the newly selected Place without requiring Enter, or the report
  explains the deliberate design and shows the cue that was added.

## Item 3 — The onboarding step stands in front of the museum

Grok's cold walk: starting cold at the root, the "Make yourself at
home" profile step appeared before the campus, and his unassisted walk
to the boycott hall never completed in 3D — he finished via the Page
route. If a first-time visitor must complete a profile before they can
walk anywhere, the museum door has a form in front of it.

- Confirm whether that ordering is intended. If a first visitor should
  be able to walk first and set up a profile when it matters, move the
  gate; if the profile-first order is deliberate, say so in the report
  and log the call in `lane/decisions.md` — the finding then closes as
  designed behavior, and Grok's cold-walk expectation gets updated.
- Either way, the cold path root → boycott hall door should be walkable
  without the Places list as a crutch; report what a cold visitor hits,
  in order.

## Unchanged

Helper names and records (file 18); grounding and the validator;
standing grants (file 16); the hall and interior kit (file 17); Page
content and audiences; proxy routes, models, prices and caps beyond
item 1's output-headroom fix. No voice work.

## Acceptance checks

- Item 1: five typed boycott asks + one don't-know, receipts named,
  zero `provider_output_incomplete` rejections.
- Item 2: Staff follows Places selection (or the added cue is shown).
- Item 3: the cold path is walked in the report, in order, with the
  profile gate's intended place stated and logged.
- File 16/17/18 suites pass unregressed.
- Nic's checks follow in the report: type the boycott question a few
  times on the phone and see Live every time; switch Places and watch
  Staff keep up.

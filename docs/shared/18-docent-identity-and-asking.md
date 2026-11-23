# 18 — Docents with their own names, a real ask box, and a phone that reaches the live path

Filed by Silver for Astra, 2026-11-23. Source: Nic testing the shipped
build (file 16 + G4 + file 17) on desktop and phone the same day. His
words: "the docents are kind of confusing, they are all named silver and
dont doo much. cant chat/voice with them from what I see."

Three items. Voice is explicitly out of scope — it is a separate design
question tied to real agents arriving via Second Look, and Nic has not
ruled on it. Do not build voice in this round.

## Item 1 — Every helper has its own name

Today there is one seed record — `docent-silver`, display name
"Docent Silver" — assigned to thirteen Places, and a Curator named
"Docent Silver · Curator" in eight more. One demo agent wearing every
hat in every room reads as a bug, and "Silver" is the name of Nic's own
assistant, which makes it worse.

- Give each Place's Docent its own helper record with its own name,
  plausible for that Place and its owner (the boycott's Docent is the
  boycott's guide, not a global agent). Same for the Curator where one
  is seeded. No helper is named Silver.
- Names are data on the helper record and show everywhere the helper
  appears: Staff panel, answer byline, badges, tour proposals.
- Existing stores must heal on load the way file 16's re-issue did —
  nobody clears site data. Grants, roles, capabilities and Places
  coverage stay equivalent per Place.
- Hard constraint: the boycott Docent's standing grant and live path
  must not regress. The live wiring currently keys on the helper id
  `docent-silver` at place `boycott` (see `src/staff-ui.js`); however
  you restructure the records, the boycott Docent still answers live,
  still standing, and receipts keep flowing. The file 16 regression
  suite (fresh / lapsed / revoked, expired-lease labels) passes
  unchanged in spirit.

## Item 2 — A real ask box

The Docent panel today offers exactly three preset question buttons and
no text input anywhere. Add one.

- A text input in the Docent panel: the visitor types their own
  question. The three preset chips stay as starters.
- Grounding does not move: context is built from the Place's readable
  blocks under the visitor's Lens, the answer cites admitted blocks or
  honestly says the blocks available in this view don't cover it, and
  the provenance labels stay exactly as they are (Live · grounded
  answer / Simulated · …). The evidence validator is not weakened for
  free text — that was the round 2d line and it holds.
- Live free text applies where live already applies (the boycott
  Docent, through the proxy). Elsewhere the local simulation answers
  typed questions from local blocks under the same honesty rules.
- Keep it a single-question ask for this round: no conversation
  threading, no memory of prior questions. A sane input length cap;
  spend stays bounded by the existing proxy caps.
- Design risk, stated plainly: if the validator cannot hold on
  arbitrary questions through the proxy path, ship the input with
  local-simulation answers and report the live part as blocked with
  evidence. Do not ship a live free-text path that cites loosely.

## Item 3 — Why does the phone fall back to simulated?

Evidence: Nic's desktop ask at the boycott on 2026-11-23 14:37 ET
returned Live · grounded answer (server receipt `950a2c1c`). His phone
ask at the same Place the same afternoon returned
"Simulated · local helper," and no receipt reached the server — the
live path from his phone has never landed. Grok's fresh-profile cold
walk also read Simulated.

- Diagnose where the phone's attempt dies: session creation, holder
  state, origin, network, browser class — reproduce with a phone-class
  browser or user agent, instrumented enough to name the step.
- Fix it if the cause is client-side. If the cause is environmental
  (a specific browser or webview), name it with evidence and state the
  supported path.
- Acceptance: a live receipt attributable to a phone-class run at the
  boycott, or a named cause with the evidence attached. A fresh-profile
  run should also reach live, since Grok's suite depends on it.

## Unchanged

Page form and content; audience versions and the evidence catalog;
grants model and file 16 standing behavior beyond item 1's renaming;
proxy routes, models, prices and caps; the interior kit and hall;
Second Look surfaces. No migrations expected; if item 1 needs one, the
dev-mode rules apply (timestamped, rollback committed first, logged).

## Acceptance checks

- Two or three Places opened in sequence show differently named
  Docents, each answering under its own name; no "Silver" helper
  anywhere in the Staff surfaces.
- A typed question at the boycott returns a Live · grounded answer
  citing admitted blocks; a typed question the blocks don't cover
  returns the honest don't-know; receipts exist for both.
- Preset chips still work; tour proposals still work; file 16 and
  file 17 suites pass (standing grants, arrivals, hall presence).
- Item 3's diagnosis is in the report with its evidence, and the
  phone-class live receipt is named if achieved.
- Nic's phone checks follow in the report: ask the boycott Docent a
  typed question on the phone and see the Live label; spot-check
  helper names in two other Places.

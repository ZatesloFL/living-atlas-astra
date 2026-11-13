# 15 — Round 2d work order: make live AI answer, then wire the client

From Silver (operator), filed 2026-11-13 with Nic's approval. This is the
current round; it takes priority over the remaining round 2c items (G3, G4),
which stay queued after it. Work the two items in order — item 2 is pointless
until the Docent can actually answer.

## Where things stand (read the receipts first)

Stages A and B are complete. Evidence: `lane/ops/2026-11-13-01.md` and
`lane/ops/2026-11-13-02.md` — read both before starting.

- `ai-proxy` v1 is deployed and the master switch is **on**.
- Live routes: builder → `claude-opus-5-5`, guide → `claude-haiku-5-5`,
  background → `claude-haiku-5-5`, heavy → `claude-fable-5-2`,
  builder_challenger → `gpt-6.1-sol`, all with verified prices and the
  report-12 caps.
- Function URL: `https://ftnxmuenqfqkodizyekk.supabase.co/functions/v1/ai-proxy`
- The shipped client still runs local-only. The dormant proxy transport was
  built for this round.

## Item 1 — Diagnose and fix the rejected Docent answers

Silver's Stage B test call (guide job, agent `docent-silver`, Place
`boycott`, question "What is this Place?", visible blocks `[lead]`) reached
the provider and settled honestly, but the answer **failed evidence
validation**: HTTP 502 `BAD_PROPOSAL`, receipt
`ec6966d8-7a25-4251-b51d-daf5a5b0dd73` (474 input / 399 output tokens,
result `rejected`). The answer text is stored nowhere — by design — so
diagnose by reproduction, not by looking for the lost answer.

- Reproduce the guide flow locally with realistic provider-shaped
  responses and find where a real Haiku-shaped answer breaks
  `validateAnswer`: schema shape, claim grounding, block citation, length,
  something else. Name the root cause in your report with fixture evidence.
- Fix the cause. In bounds: the server-built guide prompt, the answer
  schema and its instructions, the context the client passes (for example,
  which blocks are visible).
- **Hard rule: do not weaken the evidence validator or the grounding
  requirements to make answers pass.** If the validator itself has a bug —
  it rejects answers that are in fact grounded in the visible blocks — fix
  the bug and prove both directions in tests: grounded answers now pass,
  the old failure shapes still fail.
- Tests must cover the full path with a mocked provider: reserve →
  propose → validate → accept, plus the rejection shapes staying rejected.

## Item 2 — Wire the client to the live proxy

- Use the dormant `createProxyTransport` / `createAI` wiring. One
  `ai.request` interface (file 10); AI only proposes; the host validates.
- Send IDs and a narrowed Lens only — never page text that the server can
  resolve from its own catalog. Bootstrap a session through `/session`;
  present the session bearer exactly as the function expects.
- Honest fallback, labelled in the UI: master off, `AI_OFF`, quota
  reached, provider failure, or a rejected proposal all yield the
  validated simulated result with its provenance shown — "Simulated ·
  live helper unavailable" or "Simulated · live limit reached". A live
  answer shows as live. Never let a simulated answer wear a live label.
- Local-only mode keeps working untouched when the transport is
  unconfigured, unreachable, or switched off. The function URL is public
  by design and is the only endpoint the client knows; no keys, no other
  URLs.
- Respect crossing: if the visitor has moved on while a request is in
  flight, drop the stale result (the README's cancellation/revalidation
  requirement).

## Boundaries

- File 14 stands: you never touch live Supabase — no schema, config, or
  deploy actions. If item 1's fix changes function code, hand Silver the
  files, say plainly in your report that a redeploy is needed, and stop
  there; Silver deploys with Nic's go. Client changes ship through Pages
  as usual.
- No route, price, cap, or grant changes in this round.
- The builder head-to-head is **not** in this round. It still needs its
  own approval.
- If proving item 1 needs a live retest call, stop and say so in your
  report. Silver runs it under Nic's approval. Never ask Nic to run
  scripts or carry files.
- For context only: the runtime and route config leases expire
  2026-12-13. Renewal is Silver's job, not yours.

## Done

Both items committed to `main`, tests green, and a lane report with
Pass / Partial / Fail per item: the root cause for item 1 with its fixture
evidence, anything that needs a redeploy or a live retest flagged for
Silver, and — per the standing rule — exactly what Nic should check on
his phone. Then stop.

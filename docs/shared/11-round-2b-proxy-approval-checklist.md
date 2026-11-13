# Brief: round 2b proxy approval checklist (gate for file 10)

**Filed by Silver for Nic, 2026-11-12.** Source: Claude's project record
`review/project-record-2026-11-12` §8 + `docs/shared/10-ai-and-server-plan-queued.md`.

**The gate:** Astra finishes round 2c (G3, G4), then proposes the round 2b AI
proxy plan in a lane report and **stops**. No schema changes, no deployments,
no live-AI build until Nic approves the proposal against every check below.
Each check needs evidence in the proposal, not just a claim.

## The six approval checks (from the project record)

1. **No key values anywhere.** The proposal names secrets by name only
   (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ALLOWED_ORIGINS`). No key value —
   or fragment — appears in the plan, the repo, the page, Codex, logs, or
   lane reports. Evidence: the proposal states where each secret lives
   (Supabase Edge Function secrets only) and confirms a repo scan for values.
2. **Origin lock.** The proxy accepts calls only from
   `https://zateslofl.github.io` (the Pages origin for this repo).
   Evidence: the exact allowlist value in the plan's proxy config section.
3. **Per-session rate limits.** The plan states concrete per-session and
   per-user limits/quota numbers for AI calls, and what the visitor sees
   when a limit is hit. Evidence: the numbers, not "rate limits will be added."
4. **Logs hold no secrets and no visitor text.** The call log records only:
   job, model, agent, tokens, and whether the result was accepted or
   rejected. No prompts, no visitor text, no keys, no private identity
   details. Evidence: the exact log record shape in the plan.
5. **Additive tables only.** Any Supabase schema in the proposal is new
   tables/columns only — nothing existing is altered or dropped — and every
   schema change is listed for Nic's approval before it is applied.
   Evidence: the full proposed schema diff, marked additive.
6. **Automatic fallback to simulated.** If the proxy is down, over quota,
   or a provider errors, the app falls back to the `simulated` provider
   automatically, and local-only mode keeps working with no account.
   Evidence: the fallback path described step by step.

## Checks from file 10 that the proposal must also answer

7. **One interface.** All AI goes through the single
   `ai.request({ job, context, schema, agentId })` interface; swapping
   providers or models requires no UI or rules-engine changes.
8. **AI only proposes.** Every AI result is validated against its schema
   and the rules engine, shown as a proposal, and logged with which model
   and agent produced it. Nothing an AI returns edits content directly.
9. **Structured context only.** No screen sharing / screenshots. Context is
   structured app state, limited to what the asking agent's scope allows;
   no private identity details beyond that scope.
10. **Routing is config, not code.** Model routing (builder / guide /
    background / heavy) lives in server config so it can change without a
    release, and the plan includes the 10-request builder head-to-head
    (Claude Opus 5.5 vs GPT-6.1 Sol) as its first task after the proxy
    exists — scored on first-try valid records, retries, and Nic's
    preference, reported in the lane.
11. **Dedicated keys, spending limits set.** One dedicated key per provider
    for Living Atlas, with the provider-side spending limit named in the
    plan. Bring-your-own-key (later) is stored server-side in the member's
    own Second Look backend — never in this app or repo.

## Approval flow

- Astra's proposal = one lane report answering checks 1–11 in order,
  each marked Pass / Partial / Fail with its evidence.
- Nic approves, approves with changes, or sends it back. Silver verifies
  the proposal against this checklist and reports the gaps to Nic.
- Only after Nic's go: schema applied, proxy deployed, head-to-head run.
- Hard stops remain: anything needing the server, a new secret, or one of
  Nic's open decisions (which AI feature leads the public demo; default
  lens for brand-new public visitors) waits for Nic.

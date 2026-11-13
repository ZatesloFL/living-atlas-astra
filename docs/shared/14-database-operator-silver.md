# Note for Silver: you run the database, Astra writes the code

**Written by Claude for Silver, at Nic's request, 2026-11-13.**

## Why this split

Nic prefers that the model writing the code is not the model changing the
live database. So from round 2b onward the work divides cleanly:

- **Astra (Codex)** writes everything as files in this repo: migration SQL,
  rollback SQL, Edge Function source, seed config, tests. Astra never connects
  to the live Supabase project and never applies or deploys anything.
- **Silver (ChatGPT, Supabase plugin)** is the operator. You review what Astra
  wrote, apply it to the live project after Nic approves, verify it, and write
  a receipt. You do not edit Astra's code. If something is wrong, you stop and
  say so; Astra fixes it.
- **Nic** approves each step before you run it. Nothing goes live on the
  plugin's own initiative.

This is the Sterling pattern applied to ourselves: Astra proposes, the checks
in file 11 validate, Nic approves, you apply, and the receipt is logged.

## Where things are

- Astra's design: `lane/reports/2026-11-12-12.md` (round 2b proposal).
- Proposed schema: `lane/proposals/round-2b-schema.proposed.sql`.
- Approval checks: `docs/shared/11-round-2b-proxy-approval-checklist.md`.
- When Astra finishes the build, the files to apply will be under
  `supabase/migrations/` and `supabase/functions/ai-proxy/`, each migration
  with a matching rollback file. Apply only files from a commit Nic names.

## What needs Nic's separate approval, and what doesn't

Nic's approval of a stage covers every step listed in that stage, including
creating and removing short-lived operator access the stage needs. He is not
a courier for operator files and does not run scripts.

These still need their own, separate yes from Nic, because each changes the
real risk: turning on the master config or any route; allowing any
generation call; running the builder head-to-head; changing quota or dollar
caps or provider spending limits; adding, replacing or rotating a provider
key or any other secret; and any rollback once real call receipts exist.

## Stage A, one sequence (supersedes earlier step lists)

Run against the commit Nic names. Steps are in this order on purpose: the
full-undo rollback works only until the first grant receipt exists, so the
one step that creates a grant comes last.

1. **Inventory.** Record Nic's approval and the commit. List the project's
   schemas, tables, functions, Edge Functions and secret **names** (never
   values). Confirm `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and
   `ALLOWED_ORIGINS` exist, and that `atlas_ai` and `ai-proxy` do not.
2. **Additive review.** Compare `20261113120000_atlas_ai.sql` with that
   inventory. It may create only the `atlas_ai` schema and its own nine tables,
   indexes and permissions. If it would touch anything existing, stop.
3. **Apply and verify.** Apply that forward file only (never the `rollback/`
   folder). Run `supabase/operators/verify-stage-a.sql`. Confirm `atlas_ai` is
   not in the Data API's exposed schemas and public roles are denied.
4. **Deploy switched off.** Deploy `ai-proxy` exactly as `supabase/README.md`
   describes, master disabled, every route null.
5. **Off-state smoke test.** Exact Pages origin gets `AI_OFF`; any other
   origin gets `ORIGIN_DENIED`; no call receipts or counters appear; the live
   site still works in local-only mode. *Up to here, a failure means full
   undo.*
6. **Model check (Silver, end to end).** In Silver's own private workspace:
   generate the one-time grant with `prepare-model-check.mjs`; apply only the
   fingerprint SQL; run `run-model-check.mjs` against the function URL;
   revoke the grant right away (or confirm its expiry if revoke isn't
   available); delete the local `grant.json`. Report only model names and
   available / unavailable / unknown for `claude-opus-5-5`,
   `claude-haiku-5-5`, `claude-fable-5-2` and the exact GPT-6.1 Sol ID. No
   generation call. **If Silver's workspace can't run Node or can't reach the
   function URL, skip this step and record "deferred to Stage B".** Don't
   route it through Nic. Stage A is proven without it; model IDs only matter
   when routes are set.
7. **Receipt and stop.** Write `lane/ops/YYYY-MM-DD-NN.md` (format below),
   leave everything switched off, and stop.

## Stage B (only after Nic reads the Stage A receipt and says go)

1. If the model check was deferred, run it now as Stage A step 6.
2. Set routes to the verified IDs and enable the master config, with the
   caps exactly as in report 12.
3. One Docent test call. Confirm the receipt row holds only job, model, agent,
   tokens, cost and accept/reject (no visitor text), and the counters moved.
4. Receipt, then stop. The builder head-to-head is a separate approval.

## What changed on 2026-11-13 (for Silver)

- Stage A is now one numbered list, and this file's order is the one to
  follow if `supabase/README.md` differs.
- The off-state smoke test moved ahead of the model check, so full undo
  stays possible for every step but the last.
- Silver runs the model check end to end under the Stage A approval; Nic
  doesn't hold `grant.json` or run scripts. If Silver can't run it, it
  defers to Stage B instead.
- Silver revokes the grant and deletes `grant.json` when done.
- Dual control (Nic's separate yes) is reserved for the list above.

## Hard rules

- Never read back, print, paste or log a key value, anywhere: not in chat,
  receipts, the repo or the plugin's output.
- Don't create names with the `SUPABASE_` prefix.
- Don't change the schema by hand in the dashboard or with ad-hoc SQL. If a
  fix is needed, Astra writes a new migration and Nic approves it.
- Every change has a rollback. If any verification step fails, run the
  matching rollback, record it, and report.
- No changes to anything belonging to Second Look or any other project in
  this Supabase account.

## Receipt format

Add one file per run at `lane/ops/YYYY-MM-DD-NN.md` with: the commit you
applied, what Nic approved and when, the live inventory before, each step
with pass/fail, the model check results, anything rolled back, and the
state left behind (on or off). Short and factual.

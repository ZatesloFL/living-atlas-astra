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

## What to do, in order

**Stage A: set up with everything switched off.**

1. Read the live project before touching it: list existing schemas, tables,
   functions and the names (not values) of Edge Function secrets. Confirm
   `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and `ALLOWED_ORIGINS` exist. Write
   this inventory into your receipt.
2. Check the migration against the live inventory. It must be additive only:
   it creates the private `atlas_ai` schema and its nine tables and alters or
   drops nothing that already exists (file 11, check 5). If it would touch
   anything existing, stop and report.
3. Apply the migration. Confirm all nine tables exist and that `atlas_ai` is
   not exposed through the public API.
4. Deploy `ai-proxy` with the master config **disabled** and every model
   route **null**.
5. Run the function's model check. It asks Anthropic and OpenAI, using the
   stored keys, which models those keys can reach, and returns only names and
   availability. Report whether these exact IDs come back:
   `claude-opus-5-5`, `claude-haiku-5-5`, `claude-fable-5-2`, and the exact
   ID matching GPT-6.1 Sol. Do not make any generation call.
6. Smoke-test the switched-off state. A request from the Pages origin should
   get a clean "AI is off" answer. A request from any other origin should be
   refused. The live site at https://zateslofl.github.io/living-atlas-astra/
   should still work in local-only mode.
7. Write your receipt (see below) and stop.

**Stage B: turn it on (only after Nic reads the Stage A receipt and says go).**

8. Set the routes to the verified model IDs and enable the master config,
   with the quota and dollar caps exactly as in report 12.
9. Make one Docent test call, confirm it lands as a receipt row holding only
   job, model, agent, tokens, cost and accept/reject (no visitor text), and
   confirm the quota counters moved.
10. Receipt, then stop. The builder head-to-head is a separate approval.

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

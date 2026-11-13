# Round 2b: files for Silver

Astra writes; Silver applies the implementation commit Nic names (latest handoff:
`lane/reports/2026-11-13-05.md`). This directory has no linked project, credentials,
deployment workflow, live URL or auto-activation. Do not run these files against
Second Look or another project. The shipped browser singleton remains simulated.

Round 2d's current provider-envelope fix is
[`lane/reports/2026-11-13-05.md`](../lane/reports/2026-11-13-05.md). Silver's
[receipt 04](../lane/ops/2026-11-13-04.md) confirms both migrations are applied
and the v3 retest failed at `provider_content_invalid`, before answer validation.
This handoff handles documented Anthropic thinking metadata and needs a
**function-only redeploy and one approved retest; no SQL application**.
The dropped live payload's exact block type remains unobserved.
The Stage A sequence below records the completed initial deployment from
`1ff544b`, as documented in `lane/ops/`. Neither Stage A nor the diagnostics
migration should be repeated on that installation. Client wiring waits for an
accepted live answer in Silver's operator receipt.

## Files

- `migrations/20261113120000_atlas_ai.sql`: atomic additive forward migration.
  Creates exactly nine tables and nine indexes in the new private `atlas_ai`
  schema. Existing-name collisions abort; never use an IF NOT EXISTS workaround.
- `migrations/20261113204500_ai_failure_class.sql`: additive diagnostic upgrade
  to the existing private call-receipt table; no backfill or configuration change.
- `migrations/rollback/20261113204500_ai_failure_class.rollback.sql`: after
  redeploying the prior bundle, removes only an unused diagnostic column. Retains
  it whenever a recorded classification or an in-flight call exists.
- `migrations/rollback/20261113120000_atlas_ai.rollback.sql`: operational rollback,
  intentionally outside the top-level forward migration glob. Disables master
  and routes, clears model IDs, revokes leases and receipts each grant revocation
  once. Preserves schema, receipts, pending spend and other resources.
- `migrations/rollback/20261113120000_atlas_ai.full-undo.sql`: guarded full undo
  for an unused first installation with **zero call and zero grant Receipts**,
  no leases/calls/accounting activity, and disabled null routes. Drops only the
  nine known tables and the new schema, in dependency order and without CASCADE.
- `functions/ai-proxy/`: complete function bundle. Upload **every file** in this
  directory, including the JSON fixtures, `catalog.js`, `kit.js`, `deno.json`
  and `deno.lock`. `index.ts` is the entry point.
- `config.toml`: the sole deployment setting, `verify_jwt=false`. The function
  authenticates its own random bearer leases; it does not use Supabase Auth.
- `operators/verify-stage-a.sql`: read-only assertions and non-secret evidence.
- `operators/verify-failure-diagnostics.sql`: read-only upgrade assertions and
  recent minimal receipt metadata, including the fixed failure class.
- `operators/prepare-model-check.mjs`: offline preparation of an operator lease.
- `operators/run-model-check.mjs`: sends that lease only to `/models` and prints
  model names and availability. Never generates text or changes configuration.
- `operators/revoke-model-check.mjs`: offline SQL generator to revoke that grant,
  its sessions and its private holder, preserving receipts and counters.

## Round 2d thinking-envelope fix (Silver)

After Nic approves report 05's implementation commit and one retest, redeploy
the complete 12-file `functions/ai-proxy/` bundle with the existing settings.
Both required migrations are already applied per receipt 04. Change no routes,
prices, caps, grants or secrets. Record the new function version and commit.

The Anthropic adapter accepts only answer `text` blocks plus well-formed
`thinking` and `redacted_thinking` metadata. Haiku 5.5 defaults to thinking with
its display omitted, which can produce an empty thinking string and an opaque
signature ahead of the answer. The metadata's contents are never parsed as an
answer, logged, stored, returned or reused. Unknown blocks, tools, malformed
metadata and metadata-only responses still fail closed. Completion checks,
guide-only fence handling and strict visible-block/verbatim-quote validation
remain in force. No request setting or output cap changes, no automatic retry.

`usage.output_tokens` remains the total billed output, including thinking.
`usage.output_tokens_details.thinking_tokens`, when reported, populates the
existing `reasoning_tokens` field without adding another charge. An absent/null
breakdown or count is NULL (unknown), not zero. An invalid breakdown/count, or a
count exceeding total output, rejects with unknown usage and retains the full
cost reservation. A measured total-output overrun still disables the master.
There is no schema change or historical receipt backfill.

Run the single approved `/session` → `/request` check with guide/docent-silver,
boycott, the current catalog revision, visible blocks `[lead]`, and “What is this
Place?”. Success requires a non-empty grounded answer citing lead and an accepted,
measured receipt with NULL `failure_class`. Rejection records the fixed class
and matching receipt metadata. Confirm full output-token cost and settled quota
counters. Do not retain the question, answer, thinking metadata or raw response;
write the new operator receipt and stop. Client wiring remains blocked until
success is proved; local fixtures alone do not establish live acceptance.

If this function-only change needs rollback under Nic's applicable approval,
redeploy the complete prior v3 bundle from
`a7f3b4d75b94a8f24c07ea8dd76421263b123c10`. Leave both applied migrations,
receipts, counters and configuration intact. No rollback SQL is needed for this
change; permanent receipts still forbid full schema undo.

## Round 2d diagnostics upgrade (completed; reference)

Silver's receipt 04 confirms this upgrade and its classified retest are complete.
The following describes the already-applied migration and its compatibility;
report 05 needs only the function redeploy above.

After Nic approves the implementation commit in report 04, Silver applies only
`20261113204500_ai_failure_class.sql` to the existing installation, then runs
`operators/verify-failure-diagnostics.sql`. The original Stage A migration is
already applied. Forward migrations sort by their UTC timestamps; the new file
follows `20261113120000_atlas_ai.sql`. It adds `failure_class text` and two CHECK
constraints to `atlas_ai.call_receipts`; all existing row values remain unchanged.
The original nine tables, RLS and permissions stay in place.

Silver then redeploys the complete 12-file function bundle from the approved
commit, keeping its existing settings, routes, caps and secrets. The new code
checks for the nullable diagnostic column before its database write operations.
If deployed ahead of the migration, it returns LIVE_UNAVAILABLE before any paid
dispatch; it never proceeds without being able to write the diagnostic receipt.
The older bundle can run with the added nullable column during deployment.

Silver makes one separately approved scoped Docent retest, records the HTTP
status, receipt ID and fixed `failureClass` response field if rejected, and reads
back `failure_class` in the corresponding receipt. Confirm measured/reserved
cost and counters as usual. No question, answer, error message, provider body,
headers or credentials go into the operator receipt. Then stop and return the
classification to Astra. This upgrade does not claim to fix the unknown live
cause and does not activate the browser transport.

The diagnostic field is a closed list, never free text:

| Class | Failed check |
|---|---|
| `provider_key_missing` | The configured provider credential was unavailable internally. |
| `provider_request_failed` | Fetch failed or returned a non-success HTTP status. |
| `provider_response_invalid` | The bounded outer response was not a valid JSON object. |
| `provider_usage_invalid` | Required token counts were missing or invalid. |
| `provider_output_incomplete` | The provider did not report a completed output. |
| `provider_content_invalid` | The provider content structure/type was unsupported. |
| `proposal_json_invalid` | Output text, after the existing guide fence handling, was not one JSON document. |
| `proposal_schema_invalid` | The Docent answer failed the existing shape, excerpt count or quote-length/type checks. |
| `evidence_block_not_visible` | An excerpt's block ID did not resolve to a permitted visible block. |
| `evidence_quote_not_exact` | A quote was not an exact substring of that permitted block's body. |
| `builder_validation_failed` | The existing builder schema/host validator rejected a proposal. |
| `dispatch_recheck_failed` | Config, route, lease or authorization recheck prevented dispatch. |
| `result_recheck_failed` | Config or authorization no longer allowed acceptance at settlement. |
| `accounting_bound_exceeded` | Observed usage/cost exceeded the reserved envelope; the existing master-off safeguard applied. |
| `reservation_expired` | An undispatched reservation expired; no provider spend occurred. |
| `dispatch_outcome_unknown` | A dispatched call expired without a settled result; its reservation remains conservative spend. |
| `unclassified_rejection` | A rejected internal result had no recognized class. Arbitrary strings become this fixed value. |

Accepted receipts always have NULL. Historical receipts, and receipts written by
the older bundle, may also have NULL; nothing is inferred or backfilled. Rejected
calls written by this bundle have one class. Accounting bound overruns take
precedence; a final acceptance recheck can override an otherwise valid answer.
Idempotent settlement retains the first permanent receipt and its class.

For a rollback, Silver first redeploys the v2 bundle from `5b290c0`, confirms that
deployment and allows its in-flight calls to finish. Under the applicable Nic
approval, the matching diagnostic rollback SQL can then run. It leaves every
receipt row and every recorded classification intact: if a class or in-flight
call exists, it retains the nullable column for compatibility with v2. Otherwise
it removes just the unused column and its constraints. Its final Boolean result
states whether the column remains. The SQL is idempotent and never changes
routes, grants, config, counters or migration history. If the column remains,
the diagnostic migration stays applied; do not reapply it. If it was removed,
Silver reconciles only that migration through the supported history tool and
records the action. The original full-undo guard still forbids removing this
installation now that permanent receipts exist.

## Original Stage A, in file 14's order

[File 14](../docs/shared/14-database-operator-silver.md) governs this sequence.
Nic's Stage A approval covers all seven steps, including creating and removing
the short-lived operator grant. Silver runs every script in Silver's own private
workspace and keeps `grant.json` there until deletion. No operator file or script
is handed to Nic. Separate approval is still required for activation, generation,
the builder comparison, quota/spending-limit changes, secret changes, or rollback
after real call receipts exist.

1. **Inventory and approval (Silver).** Record Nic's approval and the exact
   implementation SHA. In the Living Atlas project, inventory schemas, tables,
   SQL functions, Edge Functions and secret **names**, never values. Confirm
   `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ALLOWED_ORIGINS`. Check that `atlas_ai`
   and `ai-proxy` do not already exist. If either exists, stop: this migration
   must not reuse it and this deployment must not overwrite it. Confirm the
   documented, platform-injected database binding is available to Edge Functions
   without reading it back. No new secret or name starting with `SUPABASE_` is
   created. If that binding is unavailable, stop and return to Astra.
2. **Compare the migration with the inventory.** Only the new schema's own tables
   get RLS/permissions. No existing schema, extension, role, Auth, cron, trigger,
   RPC, table or public API configuration is changed. The additional accounting
   fields described below are part of the reviewed CREATE TABLE statements.
3. **Apply the forward SQL only.** Never recursively apply the rollback folder.
   Run `operators/verify-stage-a.sql`. Confirm the actual Data API exposed-schema
   list excludes `atlas_ai`; a missing SQL setting alone is not evidence. Check
   anon/authenticated access is denied, all nine tables have RLS, and no public
   policies exist. Preserve the query results as non-secret receipt evidence.
4. **Deploy the disabled bundle.** Use function name `ai-proxy`, entry `index.ts`,
   the complete manifest above, its pinned dependencies/lock and
   `verify_jwt=false`. Do not set routes or enable the master. The only custom
   secrets read are the three existing names; the existing platform DB binding
   is consumed only inside deployed code. The allowlist must be exactly
   `https://zateslofl.github.io`; an extra comma, slash, wildcard or origin causes
   the function to stay off. Verify with behavior; never read back its value.
5. **Off-state smoke test (no bearer needed).** POST `{}` with JSON content type
   and the exact Pages Origin to `/request`: expect HTTP 503 and
   `{"code":"AI_OFF","message":"AI is off"}`. Repeat `/session`: same off state.
   Repeat with absent Origin, `null`, another origin, a subdomain or trailing
   slash: expect 403 `ORIGIN_DENIED`. OPTIONS with exact Origin, requested method
   POST and only authorization/content-type headers returns 204. A public or
   forged bearer must never reach the model-list APIs. Open the static site and
   check simulated Guide/Staff and Page still work; there is no configured proxy
   URL or new public control in the shipped client. Confirm call/grant receipts,
   leases and quota counters are still empty. Inspect platform logging/retention
   settings without dumping bodies or keys; application code emits no request
   logs. **Up through this step, failure uses full undo.** The next step creates
   the first permanent grant receipt and closes that rollback path.
6. **Model check (Silver, end to end).** If Silver's workspace cannot run Node or
   reach the function URL, skip this step and record **"deferred to Stage B"**.
   Stage A is proven without it. No new Edge Function secret is required: the
   bearer is a per-run lease. Under the existing Stage A approval, Silver runs:

   ```sh
   node supabase/operators/prepare-model-check.mjs work/private-model-check
   ```

   This writes `issue-model-check.sql` (hashes only) and mode-0600 `grant.json`
   (a short-lived bearer). Silver applies **only the generated SQL** through the
   authorized database operation. The dedicated grant has authority
   `operator-model-check`, scope `look`, job `model-check`, agent
   `operator-model-check`, Place `ai-proxy` and schema `atlas-model-check-v1`.
   Its limits are **max_calls 4, max_microusd 0**, shared across all its sessions.
   The session expires in 30 minutes within a 24-hour grant. It works while the
   master is off and carries no generation capability. Never paste/upload/commit
   the grant file or bearer. Silver then runs:

   ```sh
   node supabase/operators/run-model-check.mjs '<approved-function-url>' work/private-model-check/grant.json
   ```

   `<approved-function-url>` is Silver's verified project URL ending in
   `/functions/v1/ai-proxy`. No actual project URL is in this repository. The
   function reads stored keys internally and only GETs
   `https://api.anthropic.com/v1/models` and `https://api.openai.com/v1/models`.
   Anthropic pagination is followed, bounded to 20 pages; incomplete/error
   results are `unknown`, never falsely `unavailable`. Names are matched exactly.
   Four metadata checks maximum per grant prevent repeated polling; each check
   can list both providers, including bounded pagination.

   The Claude rows check `claude-opus-5-5`, `claude-haiku-5-5`,
   `claude-fable-5-2`. OpenAI's list is not a marketing-name directory: first
   return `GPT-6.1 Sol (exact ID unverified)` plus exact listed GPT-6.1 IDs. Silver
   must establish the Sol mapping from official documentation, then rerun with
   that **documented exact ID as the final argument**. If no mapping is supported,
   record unverified and leave the route off. Never guess from this chat's model
   or choose a substitute. A listed model does not establish price, API features,
   account spending controls or generation permission.

   Immediately after the check, including a failed check, Silver generates:

   ```sh
   node supabase/operators/revoke-model-check.mjs work/private-model-check/grant.json
   ```

   Silver applies **only** the generated `revoke-model-check.sql`. It validates
   the dedicated grant, revokes its sessions and holder, and writes one
   `operator-model-check` revocation receipt. Reapplying that SQL is safe; it
   keeps the original receipt and counters. It never changes master/routes or
   revokes another grant. Confirm revocation, then delete the private bearer:

   ```sh
   rm -- work/private-model-check/grant.json
   ```

   If revocation is unavailable, confirm expiry and record that fact before
   deleting `grant.json`. If the check could not complete, record the reason
   and "deferred to Stage B" after cleanup. Report only model names and
   available / unavailable / unknown; retain no provider response bodies.
7. **Receipt and stop.** Write `lane/ops/YYYY-MM-DD-NN.md`: implementation commit,
   Nic's approval/time, inventory, each check Pass/Fail, names/availability,
   unresolved facts, rollback if used, and state left **off**. Stage B and the
   builder comparison each need separate approval. Astra has run none of them.

## Verification failure / rollback

The forward migration is one transaction: failure before COMMIT rolls back its
additions. Its filename is exactly `20261113120000_atlas_ai.sql` (UTC
`YYYYMMDDHHMMSS_name.sql`); later forward files must use later timestamps. Both
rollback filenames retain that same timestamp, but live in the excluded rollback
subdirectory. Only the forward file belongs in Supabase's ordered migration set.

For an otherwise unused failed first installation, Silver can use
`20261113120000_atlas_ai.full-undo.sql`. It takes exclusive locks, refuses any call
or grant Receipt, refuses leases/call activity or nonzero accounting, and requires
master/routes still off with IDs null. It drops the nine known tables then the
schema, without CASCADE; unexpected dependencies abort the entire transaction.
If the schema is already absent because the forward transaction rolled back, it
is a no-op. It is intentionally stricter than simply finding zero model-call
Receipts: a model-check grant already creates a permanent grant Receipt.

After **any** Receipt exists (including step 6's grant receipt), use
`20261113120000_atlas_ai.rollback.sql`, the access-off rollback. It preserves
data and receipts and records model-check revocations as `operator-model-check`.
Rollback after real call receipts exist needs Nic's separate approval, per file 14.
With either rollback, Silver
also removes the newly deployed `ai-proxy` function. Since
preflight forbids replacement of an existing function, no prior deployment is
lost. Save a receipt and stop for Astra to fix files. The access-off rollback never drops
permanent Receipts or the schema. Full undo drops only an unused empty schema;
if Supabase recorded the forward migration, Silver must reconcile only that
migration history entry via the supported tool under the Stage A approval, receipt it, and
never modify the platform history tables with ad-hoc SQL. Unknown provider billing stays reserved/spent;
removing a function cannot undo an already dispatched request. Stage A itself
makes no generation request.

## Accounting and configuration contract

The approved tables are retained. Additional columns in their initial creation:
`routing_config.billing_contract` stores reviewed provider/token-bound evidence;
`call_leases.accounting` snapshots job/model/agent/rates/bounds for crash-safe
settlement; `call_receipts.cost_microusd` and `cost_basis` implement file 14's
cost receipt requirement. No request text, prompt hash, answer, headers,
credentials or personal identity is stored. Only fixed synthetic benchmark
prompt hashes may appear in the reviewed route contract. Financial windows and
anonymous leases are temporary; call/grant Receipts are permanent.

Money is integer **micro-USD** (1,000,000 = $1), rounded upward per attempt. Call
Receipts have exactly: id, time, job, model, agent, five token-count fields,
cost_microusd, cost_basis, validation_passed, result and the constrained nullable
failure_class. `accepted` means schema
and scope validation passed, never human publication. Missing usage is null;
`cost_basis=reserved` means conservative unreconciled spend, not a provider bill.

Every writer locks the runtime row first, then routes and quota rows in a fixed
order. This deliberately serializes the short admission/settlement transactions
at the approved small scale; provider I/O is always outside those transactions.
Reservation includes every applicable bucket. A replay never regenerates; its
response is REQUEST_PENDING or REQUEST_COMPLETED plus receiptId, with no answer
cache. Call leases occupy a concurrency slot for one minute; crashes are settled
on a bounded cleanup pass, retaining a dispatched attempt's full cost. Uncertain
rows require separate reviewed reconciliation, never an automatic refund. Expired
leases are invalid even before cleanup. No public cleanup endpoint exists.

Quotas are the report-12 values: session 4/rolling minute, 10/30 minutes, 1 in
flight; holder 20/$0.25/UTC day and 2 sessions; public 100/$1/day and 4 in flight;
100 new holders/day; benchmark 40/$10/grant and 1 in flight; all jobs $10/day,
$20/provider/calendar month. Anonymous holders are quota handles, never people
or backed identities; resetting storage can obtain another holder, bounded by
project ceilings. An Origin header can be spoofed and cannot distinguish sites
sharing the GitHub Pages origin. It is not authentication.

**No activation instructions are being executed.** Before Stage B, Silver must
verify exact IDs, prices (including cache categories), endpoint behavior and
output/reasoning caps, dedicated keys and actual provider spending controls.
The `billing_contract` must contain api (`anthropic-messages` or
`openai-responses`), `input_tokens_per_byte` (conservative, at least 1),
`overhead_tokens`, `output_includes_reasoning: true`, and `evidence_url` for the
verified contract. Unknowns leave routes off. Native tools, streaming, extended
thinking settings, explicit caching and automatic retries are not requested.
Models may still think by default; the adapter handles documented thinking
metadata as described above. Total output, including thinking, is covered by the
provider's verified maximum output bound and is billed once in full.
An observed bound overrun stops the master and records the measured cost.

The full fixed builder prompt exceeds the 12,000-token cap under a one-token-per-
byte conservative estimate. It therefore requires documented per-prompt input
bounds before any separately approved comparison. `synthetic_input_bounds` maps
SHA-256 of each exact synthetic prompt to a verified upper token count; changed
fixtures invalidate the match. This never applies to visitor questions. Otherwise
the byte bound is used and an oversized prompt is refused, never truncated or
sent without a reservation. Large guide contexts similarly fall back safely
when the whole prompt cannot fit the approved cap. No price or tokenization fact
has been invented to make an unverified route runnable.

## Local checks (no Supabase connection)

```sh
npm ci
npm test
node scripts/build-ai-catalog.mjs --check
deno check --config supabase/functions/ai-proxy/deno.json supabase/functions/ai-proxy/index.ts
```

Tests construct an isolated Postgres cluster bound to 127.0.0.1 using pinned
`embedded-postgres`; they never read a database URL, linked project or provider
key. Provider calls use injected mocks. Deno dependencies and Node test packages
are pinned with lockfiles. The catalog generator imports only existing authored
app records and emits the public boycott variants, plus the fixed kit fixtures;
no private Place or real backing is bundled. Local generation is never called.
The CLI failed while trying to create its home configuration directory, so the
migration filename was created directly; no CLI project link/push/deploy was run.

The dormant `createProxyTransport` and `createAI` factories allow future wiring
without UI/rules changes. `ai=createAI()` remains the shipped local-only singleton.
An eligible configured transport sends IDs and a narrowed Lens only; off/failed/
quota responses return validated simulation, with bounded reason metadata and a
60-second-or-longer circuit. Cancellation/staleness drops the result. A future
activation must supply current-view cancellation/revalidation and expose the
existing provenance to users; this commit does not connect the browser to a
project or introduce the public live-question UI.

## Public documentation consulted

These are documentation reads only, not project or provider-account access:
[Supabase changelog](https://supabase.com/changelog.md),
[CLI v3 changes](https://supabase.com/changelog/supabase-cli-v3),
[default Edge Function bindings](https://supabase.com/docs/guides/functions/secrets),
[Postgres connections](https://supabase.com/docs/guides/functions/connect-to-postgres),
[Anthropic model list](https://platform.claude.com/docs/en/api/models/list),
[Anthropic API versioning](https://platform.claude.com/docs/en/api/versioning),
[Messages](https://platform.claude.com/docs/en/api/messages/create),
[thinking behavior](https://platform.claude.com/docs/en/build-with-claude/thinking),
[Messages content and usage types](https://platform.claude.com/docs/en/api/http/messages),
[OpenAI model list](https://developers.openai.com/api/reference/resources/models/methods/list),
[Responses](https://developers.openai.com/api/reference/resources/responses/methods/create).
The Anthropic adapter pins version `2026-10-21`. Database connections require
certificate-verified TLS; no insecure fallback is provided. Live project/runtime
compatibility is Silver's Stage A check, never inferred from mock results.

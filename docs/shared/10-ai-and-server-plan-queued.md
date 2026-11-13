# Brief: AI and server plan (round 2b, QUEUED)

**Status:** queued until Nic sets up Supabase and the provider keys. One part applies **now** (see "Do this now"). Everything else is for when the server exists.

## Do this now (rounds 2c and 3)

Every feature that will later use AI (Gus proposals, Docent answers, Steward flags, Maintainer proposals, content-score suggestions, generated transcripts/alt text, mediator) must call **one internal interface**, not scripted text inline:

```
ai.request({ job: "builder" | "guide" | "background" | "heavy",
             context,        // structured app state (see below)
             schema,         // the record shape the answer must match
             agentId })      // which agent is asking
  -> { proposal, model, agentId, receiptData }
```

For now the only provider is **`simulated`**, which returns the existing scripted answers. When the server exists, swapping the provider must require no UI or rules changes. Everything an AI returns is a **proposal**: it's validated against the schema and the rules engine, shown to the owner or visitor as proposed, and logged with which model and agent produced it.

## No screen sharing: structured context

The app knows exactly what's on screen. AI calls receive **structured context**, not screenshots: current room and address, selected object, visible components, the visitor's lens and profile (never private identity details beyond what the agent's scope allows), the draft being edited (in Build mode), recent actions, and the relevant content blocks. That's more reliable than vision and keeps the model swappable.

## Server (when Nic says go)

- **One Supabase project for Living Atlas**, separate from members' per-member Second Look projects.
- **Edge Function: AI proxy.** Holds provider keys as secrets (never in the repo, Codex, or the page), routes each job to its model, enforces rate limits and per-user quotas, logs every call (job, model, agent, tokens, result accepted or rejected).
- Then, in order: login (email magic link + Google), profiles table (saved views follow the user across devices), then grants, groups and the ledger, with **row-level security** enforcing grants in the database itself.
- A **local-only mode** keeps working with no account and the `simulated` provider.
- **Bring your own AI:** a user may connect their own provider key or their own private tools via their own connectors. Keys and private connections are stored server-side in that member's own Second Look backend. Governance is identical whatever the model: it only proposes; schema and rules validate; owner approves; receipts record model and agent.

## Model routing (starting point, to be decided by a test)

| Job | Needs | Start with | Test against |
|---|---|---|---|
| `builder` (Gus: rooms, behaviors, styles from plain English) | Reliable structured output, careful reasoning | Claude Opus 5.5 | GPT-6.1 Sol |
| `guide` (Docent, voice tours, visitor Q&A) | Speed, natural conversation | Claude Haiku 5.5 or Sonnet 5.5 | GPT-6.1 Terra |
| `background` (alt text, transcripts, score suggestions, imports) | Cheap at volume | Claude Haiku 5.5 | GPT-6.1 Terra |
| `heavy` (big imports, complex rooms; rare) | Top reasoning | Claude Fable 5.2 or GPT-6 Astra | n/a |

Routing lives in server config, not code, so it can change without a release.

**The deciding test (first task once the proxy exists):** write 10 realistic Gus requests (e.g. "make the bus interactive: tap a seat, hear that seat's story"). Run each through both builder candidates. Score: valid records that pass the schema and rules engine on the first try, number of retries, and Nic's preference on the results. Report in the lane.

## Voice

- **Start with a pipeline:** speech-to-text → the `guide` model → text-to-speech (ElevenLabs, including Nic's cloned voice where appropriate and labeled). Works with any model.
- **Upgrade only if turn-taking feels slow on the Pixel:** speech-to-speech (a realtime voice model or ElevenLabs conversational agents) for faster replies and interrupting the guide mid-sentence. Same proxy either way.
- Voice is just another form of the same structured context and proposals; agents speaking are still badged as agents.

## Media generation

Images, 3D models, sound effects, music and voices come from dedicated generation services behind the same proxy, labeled AI-generated in provenance, content-scored, and approved like any other proposal.

## Done looks like (when started)

`ai.request` interface with `simulated` and real providers · Supabase project with the AI proxy (secrets, routing config, quotas, call log) · login, profiles sync, grants/groups/ledger with row-level security · local-only mode still works · bring-your-own-key path stored server-side · the 10-request builder test reported · voice pipeline for the Docent.

# 13 — The Project Bridge: Second Look Projects as Things in the Atlas

Filed by Silver for Nic, 2026-11-12. **Standing design direction, not a new round.** It does not interrupt round 2c, does not pull any queued round forward, and authorizes no live integration yet (Nic's standing ruling: the Second Look fit is future-only until he says build it). What applies now is vocabulary, one data slot, and one prohibition. If anything here conflicts with the briefs as you read them, flag it in `lane/questions.md` rather than working around it.

## The premise

Nic designed the Atlas to ride on Second Look's user and project rails. The two systems are one anatomy in two worlds:

| Second Look | Living Atlas |
| --- | --- |
| Project (`project_ref`) | A Thing with a backing |
| Member / Build | A person with verified backing |
| Agent credential (`whoami`) | An agent, always badged |
| Project contract (purpose, what done looks like) | A crossing declaration (file 12: declare) |
| Runs, check-ins, reports | Measurements (file 12: measure) |
| Missed deadline, failed run | The gap, shown as a door (file 12: show the gap) |
| Status: Draft → ready → active | Crossing states: uncrossable yet → declared → open |
| Public project page | A window crossing |
| Formalization with Gus; approvals | A door crossing |
| `project_versions`; forks of a base | Lineage; `basedOn` |
| Run receipts | Ledger receipts |

## The bridge, in three rules

1. **Backing, not copying.** When a Thing in the Atlas *is* a Second Look project, its backing resolves to that project's `project_ref`, and its live state — status, contract, latest receipts — is read from Second Look at view time, never duplicated into Atlas data. One object, two worlds. A copied project is a fork that will lie; a backed Thing can't drift from its source.
2. **The write-back.** When an Atlas-born idea becomes a real Second Look project (an agent files it with `send_to_gus`; the member formalizes it with Gus), the resulting `project_ref` is written back into the Atlas record as its backing reference. That write-back is the moment the two records become the same thing.
3. **Atlas never mints backing identity.** Backing always resolves to a Second Look build, member or agent credential — or it is honestly "none" (local, simulated, unbacked). Do not build a parallel account, membership or agent-identity system inside the Atlas, in any round. Rounds 3–5 (agents, connected sources, Builder Gus) are exactly where this could quietly split; this rule is the guard.

## The one concrete step

At the next natural touch of the content/identity data model — not as a special task — add a **`backing_ref`** slot to records that can be backed (rooms, things, people, agents):

```json
"backing_ref": { "system": "second-look", "ref": "<project_ref or credential id>" }
```

Default `null`, displayed honestly as unbacked. Log the addition in `lane/decisions.md`. That is the entire build obligation of this file for now.

## Worked example (real, verified 2026-11-12)

Claude filed the Living Atlas itself into Second Look via `send_to_gus`. It sits in Nic's account as a Draft: project_ref `cb116cba-c3df-4077-bb16-cc799039361d`, status `needs_setup`. When Nic formalizes it with Gus, that ref becomes the `backing_ref` of the Atlas's own record about itself — the first backed Thing, and the pattern for every project that follows.

## Explicitly not now

- No live calls from the Atlas app to Second Look; no auth work; no Atlas-side schema for this yet. The round 2b gate (file 11) still governs all backend work.
- Local-only mode keeps working exactly as it does today, with `backing_ref` null everywhere.
- Nothing here changes round 2c's goals or their order.

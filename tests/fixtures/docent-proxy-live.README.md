# Real deployed proxy captures

These fixtures contain real responses to fixed synthetic questions through the deployed Living Atlas `ai-proxy`. Receipt IDs are inside each unmodified proxy response. Metadata and client validation results surround the response; session credentials and headers are absent.

- `overview`, `sources`, `rules`: initial v4 captures, November 16, 2026. Report `lane/reports/2026-11-16-01.md`.
- `typed`, `unknown`: file 18's typed-question and abstention captures. Report `lane/reports/2026-11-23-03.md`.
- `reliability`: file 19's six v4 calls with the approved 2,048 output-token allowance. Report `lane/reports/2026-11-23-04.md`.
- `arrival`: November 24 v5 captures from the served paired-Lens client, five typed boycott asks and the swallow abstention. Runtime `7000dce`, served landing `0e8ddc5`. Six accepted receipts; no incomplete rejection or fallback. Report `lane/reports/2026-11-24-06.md`.

These are **proxy response fixtures**, not raw provider envelopes. `docent-haiku-*.json` remain constructed synthetic provider envelopes. The proxy's no-provider-body retention/return design is unchanged.

`tests/ai-client.test.js` replays the initial three captures and the six v5 captures offline through production client evidence and provenance validation. It makes no live calls. Historical wire requests stay unchanged in their fixtures; the original three replay cases adapt only the outgoing client request to the current catalog and paired Lens, never the recorded response.

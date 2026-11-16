# Real deployed proxy captures

`docent-proxy-live-*.json` were captured on 2026-11-16 from three synthetic
questions through the deployed Living Atlas ai-proxy v4. Receipt IDs are inside
each unmodified proxy response. Metadata and client validation results surround
the actual response; session credentials are deliberately absent.

These are **proxy response fixtures**, not raw provider envelopes. Existing
`docent-haiku-*.json` remain constructed synthetic provider envelopes. Nothing
changed the proxy's no-provider-body retention/return policy.

`tests/ai-client.test.js` replays these captures offline against the public
catalog and production client transport/validation. It makes no live calls.
See lane/reports/2026-11-16-01.md for accounting and limitations.

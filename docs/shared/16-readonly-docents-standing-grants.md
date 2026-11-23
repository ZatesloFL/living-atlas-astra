# 16 — Read-only helpers stand: the look-scope grant ruling

Filed by Silver, 2026-11-23. Ruling by Nic, from live testing the same day.
Companion to file 12 (the crossing engine): this narrows how one scope of
grant is issued. It does not amend the core law.

## The finding that prompted this

The seeded Docent's grant is a 7-day lease, issued once into the visitor's
local store at first seed. Nic's store seeded around 2026-11-12/13, so the
lease lapsed around 2026-11-19/20. On 2026-11-23 the boycott Staff panel
reported "No active helper grant for this Place" — true, but
indistinguishable from never having had a Docent, with no renewal path for
a visitor. The Docent worked on 2026-11-16 (live receipt on file) and then
silently vanished. A Place's most basic helper should not rot.

## The ruling

- A helper whose grant scope is **look** — read-only: answer and tour
  Docents — holds a **standing grant by default**: issued without expiry,
  always on once attached to a Place.
- Standing is not irrevocable and not unaccountable. The grant is still
  owner-issued (or platform-seeded for sample Places), still revocable at
  any time, still Place-bounded, and every action under it still writes a
  receipt. Declared vs measured is still tracked.
- Helpers with **suggest-or-higher** capabilities (note, flag, curate,
  connect, and future custom agents) keep the current model exactly:
  leased grants, owner approval flows, expiry. Richer settings and owner
  management for advanced agents are a later build, explicitly out of
  scope here.

## Why this is safe inside file 12

- A read-only Docent answers only from content the visitor's own Lens
  already lets them read — its context is assembled under that Lens, so
  the grant guards no content the visitor cannot already see.
- The crossing is still declared, measured, and receipted; only the term
  changes, and only at the lowest scope. Hard floors are untouched.
- Live AI spend stays bounded by the ai-proxy caps, unchanged.
- The access store already supports non-expiring grants
  (`expires` null reads as standing in the permission check).

## What Astra changes

1. Seed look-scope helpers (docent-silver today) with standing grants —
   no 7-day lease.
2. Existing visitor stores whose Docent lease has already lapsed (seed
   marked initialized, helper expired) get the Docent's grant re-issued
   as standing on load. Nobody should have to clear site data to get the
   Docent back.
3. For leased helpers, the Staff panel distinguishes **expired** from
   **never granted**, and names the owner's renewal path.
4. Nothing else moves: file 12's law, the proxy's live-eligibility rule
   (docent-silver at boycott), routes, prices, and caps are unchanged.

## Acceptance checks

- Fresh store: the boycott Staff panel lists Docent Silver on a standing
  grant; Ask this Docent works live.
- A store seeded before this change, with the Docent lease lapsed: on
  load, the Docent is back without clearing site data.
- Seeded suggest-scope helpers still expire on their leases, and the
  panel labels them expired rather than absent.
- Revoking the standing Docent grant still removes the Docent, and
  answers under the standing grant still write receipts.
- Tests cover: a standing helper is never filtered out as expired; an
  expired leased helper is labelled expired.

## Sequencing

Small fix. Astra's call whether it lands before G4 or with it; it does
not displace the G4 presentation audit Nic has already green-lit.

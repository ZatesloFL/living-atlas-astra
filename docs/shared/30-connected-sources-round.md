# 30 — Connected sources round (round 4)

**BUILD ORDER — lane B**, running in parallel with file 29 (lane A) under the
binding partition at the end of this order. Implements file 07, plus Nic's rider of
2026-11-24: sources are fed three ways, uploads are real, video is never uploaded,
every user carries a storage allotment, and egress is instrumented from day one.
Where file 07 assumed a simulated-only round (real connections needed a server that
didn't exist yet), the proxy and the Second Look rails now exist — this order builds
the model to its real shape, the simulated sources as its proving ground, and the
upload pipeline for real.

## 1. The source model (file 07, unchanged shape)

- A **source** is a connection attached to a Place by its owner:
  `source: { id, owner, kind: "drive" | "collection-db" | "notion" | "sheet" | "public-api" | "upload" | "mock", connector, scope, syncMode: "live" | "indexed" | "snapshot", rightsDefault, status, lastSync }`.
- **Adapters** turn source records into Things/blocks; every block keeps its pointer:
  `source: { sourceId, itemId, url, syncedAt, rights }`. **Mappings** say how a
  source fills a room; in the prototype a mapping may be hand-authored, and the
  propose → approve → receipt shape (AI proposes, owner approves) is the contract
  the real version fills. Places carry `sources: []` and a mapping reference, in
  the kit contract alongside the v2 declaration, standing, and door-term fields.
- Renderers never assume content is local: a referenced block may arrive late or
  fail, and shows a graceful, honest placeholder — never a silent blank and never a
  stale copy dressed as live.

## 2. Three feeding modes (Nic, 2026-11-24)

- **Live reference** — fetched when viewed, cached briefly (file 07's "live"). The
  Thing's home is the source; the Atlas holds the pointer.
- **Fed by the source** — the source pushes, or the Atlas indexes on a cadence
  (file 07's "indexed"): metadata held for search and layout, media streamed from
  the source.
- **Upload** — the person hands us the file itself. **An upload is file 07's
  snapshot mode with the person as the source**: frozen, hash-stamped, receipted,
  its home here on the Atlas's own rails. File 07's "never copies" was always about
  other people's systems; hosting what an owner hands us is a home, not a copy.
  Uploaded Things are labeled **"uploaded copy, as of [date]"** wherever their
  backing shows; if the owner edits the original at home, our copy does not move
  until they re-upload, and the label is what keeps that honest.
- Real third-party OAuth connections (a person's actual Drive or Notion) remain
  Second Look backend work — credentials live server-side per member, never in the
  page (file 07; file 28 rails). This round builds everything around them so a live
  connector slots into the same records without rework, and labels simulated
  sources as simulated wherever they appear.

## 3. The upload pipeline (real, this round)

- Storage: Supabase Storage on the Atlas project. **Media rules: photos, text, and
  audio upload directly. Video is never uploaded** — a video Thing is a reference
  (YouTube, Vimeo, or another host) rendered in an embedded player in the Atlas.
- **Allotment: every user gets 1 GB of uploaded space** (Nic's ruling, 2026-11-24).
  Usage is accounted per user and shown to them honestly ("you've used X of your
  1 GB"). The allotment is data, not a hard-coded constant: the paid add-on seam
  (file 22's reserved storage seam, opened for uploads by Nic's ruling) raises it
  by grant later — **no pricing is designed in this round**.
- Declarations for uploaded Things: the AI proposes scores from the content, the
  owner confirms (the standing rule for generated/uploaded assets). An upload is
  unpublished until declared; publishing runs the ordinary machinery — catalog
  registration, standing references, door terms.
- Deleting an upload is a receipted owner act that removes the hosted copy; the
  Thing's record shows its state honestly afterward.

## 4. Permissions and rights follow the source (file 07)

- A private source item appears only to people who could see it at the source.
  Rights metadata drives controls: public-domain items may be style "open";
  rights-reserved items are "fixed."
- No write-back to any source without a scoped grant, receipted.
- When a reference dies or rights change, the Thing's state changes with it and
  shows honestly — a referenced Thing never leaves a silent surviving copy behind.
  (Hosted uploads are the deliberate exception: they persist until the owner
  deletes them, because the owner made us the home.)

## 5. Proving ground (file 07 Tier F, kept)

- **Mock gallery collection**: a JSON collection database in the repo, an adapter,
  and a mapping into a gallery Place — adding a record adds a plinth with no
  renderer edits. Rights metadata drives style control. The gallery carries the
  **verified organization** badge (file 07's tier; recorded as badge data here —
  real organization verification is later Second Look work under file 28).
- **Mock Drive room**: the file 24 Drive room shell gets this round's machinery —
  folders as alcoves, files as preview blocks, light edits against the mock
  (rename, move, comment), "Open in Google Docs" with "Return to room." The
  arrival surface itself stays lane A's; if the starter-room seed needs a change,
  file it through Silver — do not edit lane A's seed.
- Sync-mode switch per source (live / indexed / snapshot), a snapshot writing a
  hash-stamped receipt. **Source badge** on every sourced block: origin, last
  synced, rights. Optional if it verifies from the browser first: one real,
  keyless public museum API (file 07 suggests the Art Institute of Chicago).

## 6. Egress and storage instrumentation

- Meters exist from day one: per-user storage against allotment; per-Place and
  per-source served bytes where the prototype can measure them; an operator view
  (a report or panel) that shows both. The meter's *shape* is the deliverable —
  growth should appear on a dashboard before it appears on an invoice.
- Serve sized previews for images (a small preview in place; the full original on
  open) — the egress lever that costs nothing. Video egress is the hosts' problem
  by design (§3), never ours.

## Partition (binding, both orders)

Lane B owns: source records, adapters and mappings, the upload pipeline and
storage accounting, source badges, the mock sources, egress instrumentation, and
the kit/catalog integration of sourced Things. Lane A owns file 29's surfaces; the
arrival and Lens surfaces stay hers. Neither lane edits the other's surfaces;
needed changes file through Silver in the report's FOR FILING section, never
worked around. Fetch main before every push; small commits; dev mode (AGENTS
rule 4) applies unchanged.

## Regression floor and acceptance

Kit contract v2 (paired declarations, standing references, `admission.ageRule` and
standing-rule door terms) unregressed; files 16–19 and the file 25 machinery green.
Report per section, Pass / Partial / Fail: a mock record added with no renderer
edit appears in the gallery; an uploaded photo lands inside the allotment with its
declaration confirmed and its "uploaded copy" label showing; a video reference
plays in its embedded player and consumes no Atlas storage; a killed reference
shows its honest state; the operator view shows storage and served bytes moving.

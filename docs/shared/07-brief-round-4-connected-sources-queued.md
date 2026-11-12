# Brief: round 4, connected sources (QUEUED, do not start until Nic says go)

**Status:** queued behind round 3. Read it now only so the A6 content-block model leaves room for it (see "What A6 must already support" below). Real connections need OAuth and a small server, which arrive with round 2b's proxy; until then everything here is simulated.

## The principle

**Living Atlas doesn't own the content; it shows it.** A gallery's database stays the gallery's. A person's Google Drive stays Drive. Living Atlas holds a **reference** plus enough metadata to render and govern it. The source is the source of truth, and the source is the citation.

## Building blocks

### Sources
A **source** is a connection attached to a room by its owner: a Google Drive folder, a museum collection database, a Notion workspace, a spreadsheet, a public API. Connectors use **MCP** where available, the same standard agents use, so one plumbing system serves both rooms and agents.

```
source: { id, owner, kind: "drive" | "collection-db" | "notion" | "sheet" | "public-api" | "mock",
          connector, scope, syncMode: "live" | "indexed" | "snapshot",
          rightsDefault, status, lastSync }
```

### Adapters
An adapter turns source records into **content blocks** (A6). An artwork record becomes an infobox, image and citation; a Drive file becomes a document block with preview, owner and modified date. Every block keeps a pointer back to its source item.

### Mappings
A mapping says how a source fills a room: "each artwork is a plinth on a gallery wall, ordered by date," or "this Drive folder is a reading room; subfolders are alcoves." Mappings use A6 layout hints. In production an AI proposes a mapping from the source's fields and the owner approves it (propose, then approve, with a receipt). When the source changes, the room changes; nobody rebuilds anything.

### Sync modes (per source)
- **Live:** fetched when viewed, cached briefly (e.g. Drive).
- **Indexed:** metadata copied for search and layout; media streamed from the source (e.g. a large collection).
- **Snapshot:** a frozen, hash-stamped copy, recorded in the ledger. Serves the preservation mission when sources may disappear. A deliberate owner choice, since it takes control away from the live source.

## Permissions follow the source

- A private Drive file appears only to people who can see it in Drive. Hidden room visibility plus the source's own sharing keeps private content out of the shared world.
- Rights metadata maps to controls: public-domain items can be style "open"; rights-reserved items are "fixed."
- **No write-back** to a source unless the owner grants it, scoped, with receipts.
- Credentials live on the server (per member, the Second Look backend), never in the page. Request the narrowest scope (for Drive, files the user picks rather than the whole drive).

## View and edit in-app as much as possible

1. **View in place:** previews of docs, PDFs, images, video and sheets as blocks (a readable panel in 3D; the document itself in Page form).
2. **Light edits in place** via the provider's API: rename, move between alcoves, comment, tag, share.
3. **Full edit opens the provider's editor** (e.g. Google Docs) with a "Return to room" link; on return the room picks up the change and the ledger notes it.
4. **Embedded editing** only where the provider officially supports it.

## New identity tier

**Verified organization** (a museum, library, city department), with named staff as members. Lets visitors trust that "this record comes from the actual collection."

## Agents

- **Maintainer** agents watch sources: changes, broken links, rights changes, and propose re-syncs.
- **Living Atlas as an MCP server** (later): people's own agents can visit rooms, read structured content, and help curate under the usual rails.

## Tier F: what to build when this round starts (simulated)

- **Mock gallery collection:** a JSON "collections database" in the repo, an adapter, and a mapping into a gallery room. Adding a record to the mock database adds a plinth with no renderer edits. Rights metadata drives style control.
- **Mock Drive private room:** hidden visibility, owner-only grant; folders as alcoves, files as preview blocks; light edits (rename, move, comment) against the mock; "Open in Google Docs" with "Return to room."
- **Sync mode switch** on each source (live / indexed / snapshot), with a snapshot writing a hash-stamped ledger entry.
- **Source badge** on every sourced block: where it came from, last synced, rights.
- **Verified organization** badge on the gallery.
- Optional: one real public museum API that needs no key (for example the Art Institute of Chicago's open collection with IIIF images). Check it works directly from the browser first; skip it if not.

## What A6 must already support (do this now, in round 2a)

- Blocks may carry an optional `source: { sourceId, itemId, url, syncedAt, rights }` pointer.
- Rooms may carry a `sources: []` list and a `mapping` reference.
- Renderers must never assume content is local: a block may arrive later or fail to load, so show a graceful placeholder.

## Done looks like (when started)
Mock gallery source with adapter and mapping · new record adds a plinth with no renderer edits · rights drive style control · mock Drive private room with previews, light edits, open-out and return · sync modes with snapshot receipts · source badges · verified organization badge.

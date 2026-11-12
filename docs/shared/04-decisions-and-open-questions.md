# Decisions and open questions

## Settled (build to these)

- Author-set permissions with git-style branching. Visitors see what the author allows.
- Many versions can coexist at one address. What a visitor sees depends on their own settings.
- If it's legal it can exist, behind known guardrails and the visitor's lens.
- Identity tiers: anonymous, named, named + verified person, agent (operated by a verified person yes/no). Agents are always visible.
- Edge types: seamless, door, embedded, window. Edges need consent.
- Moderation judges crossings, not content. Nothing is deleted.
- Vote-off cuts edges. The room returns to its owner's homestead.
- Owners have final say over their own rooms.
- The AI mediator proposes and explains. People and the space's rules decide. Outcomes are logged as precedent.
- Districts work like zoning, with rule envelopes rooms must fit.

## Round 1 build decisions (brief v3)

- Content "intensity" is six dimensions, each 0–3: Violence, Sexual content, Language, Disturbing themes, Viewpoint, Sensory. Lens presets Kids / Teen / Adult / Everything, plus Advanced per-dimension controls with hard-limit locks.
- Target is Chrome on a Google Pixel phone only. Portrait first, landscape works. No WebXR, no desktop requirement.
- Each builder works in its own GitHub repo, multi-file, served at index.html via GitHub Pages.
- Three.js is allowed, vendored into the repo. Assets are generated in code.
- Visual bar is 3D-game quality: shadows, fog, bloom, particles, smooth camera, stable 60 fps on the Pixel, with a performance overlay.
- Visitors view and make permitted edits (style, forks, connection proposals). No creating new rooms from scratch in round 1.
- Work is in three tiers, finished in order. Don't start a tier until the previous one runs smoothly on the phone.

## Out of scope for this round

- Real identity verification, zero-knowledge proofs, credential escrow. Simulate tiers only.
- Real blockchain. A hash-chained log in the page is enough.
- Multiplayer, accounts, backend, hosting, pricing.
- Live AI. The mediator, text chat and agent views are scripted.
- Second Look integration. See the note below.

## Second Look: future fit only (don't build it)

Living Atlas rooms will later be backed by Second Look projects (per-member agent setups with approved versions, approval gates and an owner's sending rules). Don't build any of that now. Just keep the room record shaped so it maps cleanly later:

- every room has a stable `id` and `author`;
- substance changes go through `permissions` (the future approval gate);
- `history` is an append-only log (the future receipts);
- forks have `basedOn` (the future approved-version lineage).

## Open questions (don't resolve them in the build; note your view in lane/questions.md if you have one)

- Default lens for a brand-new visitor with no settings.
- Who can claim an address for a public place (a historic site, a cultural tradition), and how several authors share one.
- Content about a person who isn't in the room: what standing they have to contest it anywhere.
- Who has standing in a neighborhood vote (time in the space, contributions, verified uniques).
- Portability: how vouches, reputation and audience move with someone who leaves a space.
- What agents may write, vouch for or rate.

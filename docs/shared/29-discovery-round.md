# 29 — Discovery round (round 3)

**BUILD ORDER — lane A**, running in parallel with file 30 (lane B) under the binding
partition at the end of this order. Implements file 06's discovery core, reshaped by
files 20, 26 and 27 and by Nic's two-layer specification of 2026-11-24: discovery is
**(a)** an index over everything findable, filtered by the visitor's current Lens,
and **(b)** a surface to search, preview, and cross into what it finds. Where file 06
and later files differ, the later files govern; two file 06 lines are expressly
superseded below.

## Part 1 — The index (the data layer)

- A queryable index over the shared Place catalog: every published Place and Thing
  with its paired declaration (six dimensions × amount/graphicness), its door terms
  (content thresholds, `admission.ageRule`, `admission.standingRules`, price), its
  three readings via the file 27 resolver references, its standing facets, its owner
  and presentation, and its source badge where file 30 supplies one.
- Query shapes: by words; by content profile (dimension/dial ranges — "violence
  amount ≤ 1, anything else open"); by record conditions (facets held, gaps,
  unmeasured); by curator or board. The index is a view over the catalog and the
  standing resolvers — it copies nothing into a second store of record.
- **Lens filtering is the crossing machinery applied to result sets**, not a second
  filter: hard limits and failed owner door terms (age rule, legal floors) exclude a
  result; soft-limit misses are **shown with the gap named** on the card. *This
  supersedes file 06's "discovery never surfaces a place the visitor couldn't
  reach"* — files 20/26 and Nic's 2026-11-24 direction govern: what a door would
  show you at the threshold, discovery shows you on the card. Unmeasured results are
  labeled unmeasured, never dressed as measured.
- **Ordering is a named, visible, switchable rule** (file 06): Newest · Most vouched
  · Nearest · From people I follow · Curator's order. No hidden ranking, ever. The
  active rule is shown on the surface and the visitor can change it.
- **"Why am I seeing this?" on every result**, generated from real fields only:
  which curator or board carried it, which query terms or profile ranges matched,
  which facet is cited. Standing facets may be cited as *shown* reasons (file 26);
  a facet is never a silent boost.

## Part 2 — The surface (search · boards · preview · cross)

- **Search**: one query surface over the index (words + content profile + record
  conditions), results as cards.
- **Noticeboards**: boards fed by **curators the visitor chooses** — people, groups,
  or agents, subscribed like feeds (file 06 D2). Seed curators: Living Atlas editors
  (named, verified), History Quarter stewards (group), Tallahassee neighbors
  (credential group), and a Docent curator under her real current identity — file
  06's "Docent Silver" seed name is retired (file 18: helper display names are real;
  "Silver" is never displayed).
- **Cards** carry: declaration chips (paired dials), the three readings, the
  why-reason, door terms at pre-flight (thresholds, age rule, price, standing
  rules), the Lens gap where one exists, and the source badge where applicable.
- **Preview without crossing**: the full card, door terms, and gap — a preview
  issues no grants and records no visit (the interface rule lane A filed in report
  03). **Knock / Enter from the card** runs the ordinary crossing machinery
  (`crossing`, `doorPolicy`, `accessSettings`, `selectContent` — unchanged).
- **Conversational discovery**: the Docents answer "what's here, what's it like,
  what fits my Lens" from this same index, with the same reasons. No separate
  answer path, no second source of truth.

## Part 3 — Trails and events (file 06 D3/D4)

- **Trails**: an ordered, curated route through Places with a short intro per stop;
  waypoints lead stop to stop; **doors on the route still count** — a trail never
  smuggles a crossing. Progress saves to the profile. Trails render in Page form as
  a reading list with the same stops. Seed two, authored as catalog data (not
  renderer content): "Civil rights in Tallahassee" and "Inside Nic's studio"
  (per file 06).
- **Events**: a time-boxed happening at a Place; an events board shows upcoming and
  happening-now; RSVP saves to the profile and a reminder chip appears at start.
  Seed two sample events. Events and trails are index citizens: they carry
  declarations, appear in search and on boards, and answer "Why am I seeing this?"

## Part 4 — Presence and people (file 06 D5, scoped)

- Presence markers in a Place, filtered by the visitor's Lens **and** each person's
  own presentation/privacy setting ("Show me to: everyone / my groups / nobody" —
  read through file 28's presentation layer). Follow a person or curator; **Join**
  travels to them with all rules applying; club halls are Places with boards.
- Dev-mode honesty: with no real visitors yet, simulated presence is labeled
  simulation wherever it appears. Real presence arrives with real accounts (file
  28's Second Look rails) and changes no rule in this part.

## Part 5 — Agents as staff: gap-fill only (file 06 Tier E)

The staff system largely exists (Docents live; Stewards and grants from files
26/27; "add a helper, pick what it may do"). This round adds only the missing
discovery-facing pieces: **Curator attribution** — boards and trails built by an
agent curator are credited to it, badged with its operator; and the **owner's agent
inbox** — one list of agent proposals across the owner's Places (Maintainer
proposals included) with Approve / Reject / Ask why, each writing a receipt. Do not
rebuild the staff, grant, or proposal machinery; file gaps through Silver.

## Partition (binding, both orders)

Lane A owns: the discovery index and query layer, search/board/preview surfaces,
trails and events (data + surfaces), presence presentation, Docent discovery
answers. Lane B owns file 30's surfaces. Neither lane edits the other's surfaces;
needed changes file through Silver in the report's FOR FILING section, never worked
around. The kit contract and catalog registration stay lane B's: if the index needs
a catalog field the contract doesn't carry, that is a Builder defect filed through
Silver. Fetch main before every push; small commits; dev mode (AGENTS rule 4)
applies unchanged.

## Regression floor and acceptance

Files 16–19, 24 and 27 unregressed; suites green; 60 fps on a phone with boards and
presence in view (file 06's line). Report per part, Pass / Partial / Fail, with the
device checks Nic should run listed plainly. Standing preferences set in the Lens
(file 27 phase 3) demonstrably change result sets; an age-rule-blocked place never
appears in a minor's results; a soft-gap card shows its gap before any knock.

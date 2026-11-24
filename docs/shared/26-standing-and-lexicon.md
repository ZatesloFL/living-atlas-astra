# 26 — Standing, and the lexicon of the Atlas

Standing design direction. Filed by Silver for Astra, 2026-11-24,
from Nic's design session the same morning (model approved; the
five clarifications — privacy, identity tiers, who measures,
audience readings, commerce — answered and confirmed by Nic;
stewardship and scale confirmed immediately after). The lexicon in
Part 1 is **canonical**: these are the only words for these things
in UI copy, lane reports, and future briefs. Direction; the build
order is file 27.

## Part 1 — The lexicon

### Standing terms

- **Standing** — an actor's history in the Atlas as proven by
  receipts: how their declarations held up, how their measurements
  held up, how their word held up.
- **Record, not score** — standing is never a number or a points
  balance. It is a set of named histories that can be read and
  audited. No leaderboards; no "trust score"; no "reputation
  points."
- **Receipt** — the permanent, uneditable proof of an act: a
  crossing, a measurement, an answer, a grant, a promise kept or
  broken. If it is not on a receipt, it is not in a record.
- **Reading** — the current view of a record, weighted toward
  recent history. The full record underneath stays complete
  forever; doors and Lenses consume the reading.
- **Gap** — the distance between what was declared and what
  measurement found. Shown, never hidden, never punished by the
  platform itself.
- **Declaration record** (facet) — for owners and creators: how
  truthfully they have labeled what they published, axis by axis,
  over time.
- **Measurement record** (facet) — for Stewards: how often their
  measurements survived contest and re-measurement.
- **Helper record** (facet) — for agents and helpers: answers that
  checked out, tours completed, proposals owners accepted. The
  AI proxy's receipts already capture the raw material
  (validation outcomes).
- **Commitment record** (facet) — for everyone: promises kept —
  grants honored, thresholds actually enforced, terms actually
  lived by. Places carry a declaration record of their own,
  distinct from their owner's.
- **Declare** — an owner states the scores and terms of what they
  publish; the declaration is signed and receipted.
- **Measure** — a Steward checks a published thing against its
  declaration and records what they found.
- **Contest** — a challenge to a measurement, triggering a
  re-measurement; the outcome is receipted and records repair
  themselves from it.
- **Held** — a declaration or measurement that was checked and
  matched: it held.
- **Unmeasured** — the state of a person, place, or thing with no
  record yet. It means "we don't know yet" — never "untrusted."
- **Knock** — a request for a grant; a knock carries the knocker's
  standing with it.
- **Operator** — the person or product behind an agent, shown on
  its badge beside the agent's own record.
- **Standing rule** — a door or Lens setting that consults a facet.
  Always someone's choice — an owner's at their door, a visitor's
  in their Lens — never a platform decision.
- **Audience reading** — a measurement filed by a verified visitor
  who actually crossed into the thing (their crossing receipt is
  the ticket stub): per dimension, both dials, plus words. One per
  person per thing; editable, with edits receipted and shown.
- **Steward reading** — a measurement filed by a Steward:
  accountable, method-bound, record on the line. Crossings are
  governed by declared vs Steward-measured, higher governs.
- **Designate** — an actor appointed by an owner to a scoped role
  (e.g. Steward of a Place) under a grant: a named human, an agent
  the owner operates, or an agent built from an Atlas template,
  with the authority and its limits baked into the grant and
  configuration.

### Roles (hats, not identities — one person wears several)

- **Visitor** — anyone moving through the world with a Lens.
- **Owner** — holds a Place or Thing: declares its scores, sets
  its doors, issues its grants.
- **Creator** — makes and publishes Places and Things; their
  declaration record follows what they made, even after it changes
  hands.
- **Guardian** — sets hard limits on another person's Lens (a
  parent for a child) that the other cannot raise past.
- **Steward** — the checking role: measures published things
  against their declarations and contests readings. Two scopes:
  a **Place Steward** is the owner of a Place or their designate,
  keeping that Place's order; an **Independent Steward** measures
  in the open with no appointment — their authority is their
  measurement record alone.
- **Helper** — any actor, person or agent, granted a job inside a
  Place that isn't theirs. One door for all of them: the owner
  grants the job, sets what it may do, can revoke it; every grant
  is receipted.
- **Docent** — a helper who tends a Place's visitors: answers
  questions about it, gives tours.
- **Curator** — a helper who tends a Place's collection: selects
  and arranges what is shown.
- **Maintainer** — a helper who tends a Place's machinery: fixes
  and updates under the owner's direction.
- **Agent** — an AI actor, always badged with its operator. Can
  visit, hold grants, staff a Place, and act for its operator
  within exactly the scope granted.
- **The Primary** — the Atlas's own lead agent: guide in Visit
  mode, building assistant in Build mode, head of the Atlas's own
  team. Its name is not yet chosen; naming comes last.
- Deliberately absent: **no "admin" and no "moderator" role.**
  Nobody's job is policing taste.

### Identity tiers

- **Verified, named** — a real person, verified, present under
  their real name. Every role open.
- **Verified, unnamed** — a real, unique person verified behind a
  chosen name. Standing attaches to the persistent pseudonym.
  Every role open, including owning and operating agents. The
  difference from named is display, never rights.
- **Anonymous** — no verified human behind the presence. Can
  visit public places, hold a Lens, and knock where owners allow
  anonymous knocks. Cannot publish, measure as a Steward, operate
  agents, or accrue standing (no persistent identity to attach a
  record to). An agent's operator must be at least
  verified-unnamed.

## Part 2 — The model

**What standing is.** A legible, receipt-backed record with four
facets (declaration, measurement, helper, commitment), derived —
never assigned — by a published derivation anyone can recompute
from the receipts. Facets only: no single derived number.

**Scale.** The model is scale-free. Standing begins at
*publication*, not existence: a private item accrues nothing until
its owner makes a public claim with it. The same loop — declare,
measure, show the gap — runs on a single Thing, a room, a Place, a
district, and the largest public immersive space; a big space's
record is its own declarations about the whole plus the visible
records of its parts.

**What standing does.** Doors may consult it (admission rules
referencing facets). The Lens may vote with it (standing
preferences alongside the content dials). A knock carries it.
Discovery, when it comes, may cite it as a shown reason — never a
hidden boost. Standing is an input to grants and choices, never a
platform ban.

**Privacy map.**
- *Always public:* declarations on published things and their
  measurement outcomes; a Place's declaration record; a Steward's
  measurement record for public measurements; a helper's record
  when it knocks or offers itself.
- *Holder's choice:* whether their full person-level record is
  browsable by anyone, or presented only in the moment (at a
  knock, at a door). The reading doors consume is computed the
  same either way.
- *Always private:* visiting history (known to the visitor and
  the Place's owner, never the world); the contents and
  declarations of unpublished/private rooms; the visitor's Lens
  settings themselves — a door learns the outcome of a crossing,
  never the dial settings.

**Who measures; who decides.** Atlas human staff **never** review
and decide content questions. The only staff lane is the legal
floors that sit outside the system (illegal content, fraud,
impersonation) — and even floor actions are receipted and labeled
as floor actions with the floor cited, never silent deletions.
Measurements are made by Stewards: community actors, people and
agents, **and Atlas internal agents working as ordinary Stewards**
— routine first-pass measurement at scale, with the same receipts,
the same public record, the same contest process, and no privilege
in their readings. Decisions are made by users for themselves:
the visitor's Lens, the owner's doors.

**Two measurement layers.** Steward readings govern crossings
(declared vs Steward-measured, higher governs). Audience readings
*show and trigger*: the info card displays **Declared · Steward ·
Audience** side by side, and when the audience reading and the
declaration diverge past a set point, a Steward re-measurement is
queued automatically. A visitor may set their Lens to consult
audience readings where no Steward has measured. (Confirmed by
Nic, 2026-11-24.)

**Stewardship is delegated, attributed authority.** A Place
Steward's authority is a grant: scoped to the Place, naming what
the Steward may do (measure, contest, admit, exclude from
display), leased or standing, revocable, receipted. The designate
may be a human, an agent the owner operates, or a template agent
the owner configures — authority and limits baked into the grant
and configuration. Every reading shows its measurer and their
relationship to the Place (owner / designate / independent /
audience); a Place Steward's reading never suppresses an
independent one. Delegation creates accountability in both
directions: the designate's measurements accrue to the designate,
and the appointment itself lands on the owner's commitment
record.

**Commerce: admission is not price, and neither is standing.**
Owners may put a **price on a door** (a declared door term, shown
at pre-flight like any threshold — no surprise charges) and may
**lease** what they built — an agent, an item, a place — under a
grant with a term and a price, receipted. A lease transfers *use*,
never *history*: a leased agent's helper record still accrues to
the agent and its operator. Money buys entry, capacity, and use;
it never buys standing, and standing substitutes for a price only
where the owner sets that rule at their own door. (File 22's wall,
unchanged.)

**Limits.** Standing is never sold. No record is not a bad record:
"unmeasured" is the honest state of newcomers, and the Atlas's own
public places admit no-record actors by default. Agents cannot
launder standing: a new agent's badge shows its operator's record
beside its own. Records repair through contests, not appeals.
Private life generates no standing. Starter templates ship with no
standing-based door defaults — owners add standing rules
deliberately.

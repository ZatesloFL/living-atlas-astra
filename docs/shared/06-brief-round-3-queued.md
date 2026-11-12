# Brief: round 3 (QUEUED, do not start until Nic says go)

**Status:** queued behind round 2a (`05-brief-v4-round-2a.md`). Don't start any of this until round 2a Tiers A, B and C are done and Nic says go. It builds on v3 and v4; where they differ, the newest brief wins.

**Theme:** the front door, discovery, and agents as staff of the world. Everything here can be simulated with in-app data. Live AI comes later behind a server proxy (round 2b, not yet scheduled); design every agent feature so a real model can be swapped in without changing the UI or the rules.

## The principle that governs this round

Whoever controls the front door controls the world. Discovery is one more thing the visitor's **lens** governs:

- The visitor chooses which **curators** feed their boards (people, groups or agents), like picking feeds.
- Every recommendation can answer **"Why am I seeing this?"** in plain words (which curator, which rule, which of your settings).
- No hidden ranking. Any ordering rule is visible and switchable (Newest, Most vouched, Nearest, From people I follow, Curator's order).
- Crossing rules, grants, versions and layers apply to everything discovery shows. Discovery never surfaces a place the visitor couldn't reach.

## Tier D: the front door and getting around

### D1. Town Square (the hub)
- New visitors arrive at the **Town Square** after first-run setup. Returning visitors spawn at their **homestead** (setting: "Start at Town Square / my homestead / where I left off").
- The square has: portals to each district, a **Noticeboard**, an **Events board**, a **Trails** kiosk, and a **Guide** (agent).
- It renders per visitor like everything else: a child's square has no After Dark portal; a verified Tallahassee resident sees the neighborhood board.

### D2. Noticeboards
- Boards show cards (rooms, trails, events, layers, people). Each card shows who curated it, with an identity badge.
- **Choose curators:** the visitor picks which curators feed the board. Seed four: "Living Atlas editors" (named, verified), "History Quarter stewards" (group), "Tallahassee neighbors" (credential group), and "Docent Silver" (agent, verified operator).
- **Sort** with a visible, switchable rule. **Why this?** on every card.

### D3. Trails
- A trail is an ordered, curated route through rooms with a short intro per stop ("Civil rights in Tallahassee, 6 stops").
- Start a trail: waypoints and the compass from Tier B lead you stop to stop; doors on the route still count.
- Progress is saved to the profile. Trails render in Page form as a reading list with the same stops.
- Seed two trails: "Civil rights in Tallahassee" (bus boycott, Capitol, plus placeholders) and "Inside Nic's studio" (workbench, governance desk, broadcast booth, lab window).

### D4. Events
- An event is a time-boxed happening at a room (talk, tour, opening). Events board shows upcoming and "happening now."
- RSVP saves it to the profile; a reminder chip appears when it's starting. Seed two events in the next few days (sample).

### D5. Presence and people
- **Presence:** who's in the room, shown as soft markers, filtered by the visitor's lens and each person's privacy setting ("Show me to: everyone / my groups / nobody"). Simulate 4 to 6 visitors with mixed identity badges, including one agent.
- **People:** follow a person or curator; see "where they are" only if they allow it; **Join** travels to them (rules apply).
- **Clubs:** groups from Tier B can have a **hall** (a room) and a board.

## Tier E: agents as staff (simulated)

Agents have roles. Every agent always shows its badge and whether a verified person operates it. Agents act only within **scoped grants**, **propose rather than edit**, and every action writes a **receipt** to the ledger.

| Role | What it does | Simulated in this round |
|---|---|---|
| **Docent** | Guides visitors, answers questions about a room, runs a trail as a tour | Scripted Q&A from the room's blocks; "Tour this trail" |
| **Curator** | Builds trails, fills noticeboards, suggests connections | Seeded boards and trails credited to the curator agent |
| **Maintainer** | Keeps facts current, proposes updates with sources | 2 pending proposals on the bus boycott room the owner can accept or reject |
| **Steward** | Watches declared vs measured scores, raises flags, can open a contest | Flags Night Market's Sensory gap with a proposed fix |

- **Hire an agent:** the owner of a room opens "Staff" on that room, picks a role, sets its scope (what it may propose and where), and the agent appears with its badge. This is the Second Look hook: in production, Second Look sets up and governs these agents. In the prototype, show a "Set up through Second Look" label on the hire screen.
- **Agent inbox for owners:** one list of everything agents have proposed across the owner's rooms, with Approve / Reject / Ask why, each writing a receipt.
- The Guide in the Town Square is a Docent agent.

## Done looks like (Pass / Partial / Fail)

**Tier D:** Town Square and spawn setting · noticeboards with chosen curators, visible sort, Why this? · trails with waypoints and saved progress (also in Page form) · events with RSVP and reminder · presence with privacy settings · follow and Join · club halls.

**Tier E:** four agent roles visible with badges · Docent Q&A and tour · Curator-credited boards and trails · Maintainer proposals with accept/reject · Steward flag on Night Market · Hire an agent with scope · owner's agent inbox with receipts.

Plus: stable 60 fps on the Pixel still holds with presence markers and boards in view.

## Not in this round (round 2b, needs Nic's decision and a server proxy)
- Live AI for the Docent and other agents.
- Describe-a-style (AI proposes a style patch, owner approves).
- Content import pipeline: an agent pulls a source (for example a Wikipedia article, reused with credit under its license), structures it into blocks with citations, and a person approves before it publishes.
- AI suggestions for content scores at upload, and auto-generated transcripts, alt text and descriptions.

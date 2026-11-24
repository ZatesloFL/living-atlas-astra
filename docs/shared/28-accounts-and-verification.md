# 28 — Accounts, entry, and verification

**Standing design direction** (Nic's rulings, 2026-11-24). Not a build order for the
current rounds: the account and verification machinery lives on Second Look's backend
rails and lands in later orders. It touches today's work in two places only — lane A's
arrival copy states account states honestly, and lane B's kit contract carries door
terms (including age rules) as data. Where this file refines file 26's identity tiers,
this file governs.

## 1. One account; the Second Look record is the master record

- Everything runs on Second Look backend rails, and free Second Look accounts already
  exist. **The Second Look account is the master record** for every Atlas participant.
  There is no separate Atlas identity system and no bridge protocol for identity —
  file 13's bridge governs project *state* (read live, never copied), not who a
  person is.
- The user never needs to know which backend holds the record. From where they sit,
  they have one account that works in both products. In the terms and whenever asked,
  this is stated plainly — one account, both products, one company. It is a feature,
  not a confession.
- This completes file 22's "no separate users": every sign-up creates the account on
  the master record, whichever front door they arrived through.

## 2. The two entries

**Atlas-first (from the wild, through the Atlas):**

- They create an account and open onto their new world (file 23's arrival).
- Part of their place is the **Second Look workshop** — kiosk, store, and studio in
  one room. It is theirs to use or to **hide**: hiding is a display choice at their
  own door, never a deletion; the account and everything in it persist underneath,
  and unhiding is always available.
- **Penny staffs the workshop as its Docent** — front-of-house inside that Place is
  the Docent's job (file 26 lexicon). One brain, and Penny's doorway is the workshop
  (file 21). For paid members, Gus is additionally *theirs* in-world, as file 21
  already rules.
- In the workshop they can receive and link projects other people send them, and use
  Second Look as a free user, exactly like any other free Second Look user.

**Second Look-first (direct):**

- Normal Second Look onboarding and projects, unchanged.
- A small **"Try our Living Atlas"** entry opens the Atlas with their stuff: their
  first Atlas arrival runs file 23's flow seeded from what Second Look already knows
  — proposed and confirmed, never silently carried — and their workshop stands
  pre-stocked with their agents and projects.
- The "Try" entry obeys the quiet-invitation rule: present, small, user-started,
  never auto-popping.
- Free Gus chat is present in the workshop just as in the Second Look main UI (or
  linked out, if that proves cleaner — the presence is the requirement, not the
  mechanism).

## 3. The workshop is the agent studio

- Second Look inside the Atlas is where a person **designs the agents for their
  private and public spaces** — the helpers, Docents, and designates of files 21
  and 26 are built and configured there, on Second Look rails.
- The free/paid difference inside the Atlas is exactly the Second Look difference
  and nothing else: **paid accounts get voice, project editing, and the rest of the
  paid set; free accounts get the workshop, chat, their projects, and the world.**
  There is no Atlas tier (file 22).

## 4. Identity is real; presentation is chosen

Identity and presentation are different layers, and the words are not interchangeable.

- **Identity (the account layer) is always real**: a real person, a real email,
  verified as §5 describes. Anything that persists — a place, a Lens that follows
  you, a receipt, a record — attaches to this account.
- **Presentation (the world layer) is the person's choice** over that one account:
  - **Named** — they appear under their real name; standing accrues to them visibly.
  - **Pseudonymous** — a persistent chosen name the world knows them by. Accumulation
    lives here: data, trust, and record accrue to the pseudonym while the real name
    stays sealed at the account layer.
  - **Anonymous presentation** — they hold an account but walk as *a visitor*: no
    name shown, their record does not travel with them, their knocks carry nothing.
    This is privacy from the world, never from the floors: the account link exists
    underneath, sealed, reachable only for legal-floor enforcement, and any such
    reach is receipted and labeled with the floor cited (file 26).
- **One account, one public identity** (named or pseudonymous), plus anonymous
  presentation anywhere. A second public identity means a second verified account.
- **Truly anonymous entry — no account at all — is SCRAPPED** (Nic's ruling,
  2026-11-24). The gates are the reason: every door rule, Lens limit, and guardian
  ceiling is a rule about *someone*; a presence with nothing behind it would force a
  parallel "nobody" ruleset, and that ruleset becomes the hole in every gate.
  **No account, no entry.** This replaces file 26's "anonymous" tier: the tiers are
  not kinds of humans — they are assurance levels (§5) and presentation choices
  (this section) over one real account.

## 5. Verification — assurance levels, not a signup wall

The account carries an **assurance level**, and the gates read the level. A hard ID
wall at signup would kill the free funnel; levels keep entry light and the gates
honest, because an unverified account never claims to be what it is not.

- **Unverified** (email only): a real account, a real place, the workshop, the free
  tier — but age status is *unknown*, and unknown is treated conservatively by
  construction. Dial ceilings are capped at a level they cannot raise; adult-range
  doors do not open; they cannot be a guardian and cannot hold a verified badge.
  Nobody is accused of being a child; the system simply never hands adult keys to
  an unproven account. This is what defeats the "free Gmail, sign up as an adult"
  attack — not catching a lie, but never having issued the keys.
- **Verified adult**: one strong check, once — a government-ID verification flow
  (Stripe Identity is the named vendor: same provider as payments; the person
  photographs ID and a selfie, the vendor verifies document and match and returns
  the verdict plus verified date of birth). **The platform stores the attestation
  receipt only — never the documents.** References, not copies, applied to identity.
  Unlocks the full dial range, guardian eligibility, and the verified mark on either
  presentation, named or pseudonymous. Personhood (one real person per account)
  arrives with the same check, which is what file 26's standing arithmetic leans on.
- **Minor (13–17)**: an account whose age status is minor, linked to a verified-adult
  guardian (§6). Created by the guardian, or claimed: a teen's unverified account is
  linked when the guardian confirms from inside the guardian's own verified account —
  never on the minor's say-so.
- **Under 13: no accounts** (Nic's ruling, 2026-11-24 — "ban under 13 for now").
  Thirteen is the floor, with no guardian-created exception.
- Age facts live at the account layer. Doors and other people are never shown a
  birthdate; they receive predicate answers only (§7).

## 6. Guardianship — ceilings, not windows

- A guardian must be a verified adult, linked as §5 describes. The guardian sets the
  minor's **Lens hard ceilings** (file 26's Guardian). For 13–17 accounts, the
  starting shape is the **presets, which the guardian can edit**; the ceilings are
  the hard part beneath the presets.
- **Guardianship controls exposure, not surveillance.** The guardian governs what
  can *reach* the minor: dial ceilings, adult-door exclusion, approval over paid
  doors and leases, presentation-mode limits. The guardian does **not** receive the
  minor's visiting history or private rooms (file 26's privacy map stands), and the
  ceilings are **shown to the minor as guardian-set** — guardianship is declared,
  like everything else in the Atlas, never secret monitoring.
- Two guardians: either may tighten; the effective ceiling is the most protective
  setting, attributed to the guardian who set it.
- **Guardian exception grants**: a guardian may raise their own ceilings for a
  *named scope* — a specific Place or Thing, named dimensions up to named levels,
  for a set time. The exception is a grant in the ordinary machinery (file 12):
  leased and expiring by construction, revocable early, receipted, and shown to the
  minor ("your guardian opened this place for you until Sunday"). The guardian
  approves the place's *declared scores*, not a blank check — the history exhibit
  whose declaration reads non-sexual nudity in historical photographs is the
  canonical case. Editing the preset is the standing rule; the exception is the
  named pass. An exception relaxes the guardian layer only (§7).
- **The 18 hand-off**: at 18, the person completes the adult verification and
  becomes the verified adult holder of their own account. Guardianship ends, the
  ceilings lift, and the account's history and standing carry over — same person,
  same account.

## 7. Owner age rules, and how every layer composes

- **Owners set their own age rules** (Nic's ruling, 2026-11-24). The owner of a
  Place or a Thing may declare an age rule as a door term — "No under 18," "Only
  over 65," a band, whatever they want — shown at pre-flight like thresholds and
  prices (file 26), and receipted when it blocks. Age bands cut both ways: a
  13–17-only place excludes adults, which is a legitimate safety pattern, not an
  error. The system enforces declared rules; it does not judge them.
- **Composition law: every layer must permit.** A crossing happens only if *all*
  applicable layers allow it — the legal floors; the owner's door terms (content
  thresholds, age rule, price); the guardian's ceilings (as relaxed by scoped
  exception grants); and the visitor's own Lens. Any layer can say no; **no layer
  can override another layer's no.** A guardian exception cannot compel an owner to
  admit — unless the owner's own age rule is written to honor guardian exceptions
  ("18+, or younger with a guardian exception"), which is the owner's choice at
  their own door.
- Owner rules may be stricter than the floors, never looser: no owner rule admits
  under-13 accounts (none exist), and no owner rule or guardian exception opens
  what a legal floor closes.
- Doors check **age predicates, not birthdates**: the door asks "18+?" or "65+?"
  against the account's attested age facts and learns the answer, never the date —
  the same privacy shape as the Lens, where a door learns a crossing's outcome and
  never the dial settings. An unverified account (age unknown) fails any positive
  age requirement and passes a door with none.

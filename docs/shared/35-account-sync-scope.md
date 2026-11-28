# 35 — One account, both worlds: the account sync, scoped

**A scope, not a build order** (Silver, 2026-11-28, at Nic's direction). This brief sizes the work of letting a Second Look account holder sign into the Atlas as themselves. It authorizes nothing; the build orders follow per side once Nic rules on §5.

## 1. Where the design already stands

- File 28 §1: **the Second Look account is the master record.** There is no separate Atlas identity and, in the end state, no bridge protocol for identity at all — both products run on the same account because they run on the same rails. File 13's bridge governs project *state* (read live, never copied), never who a person is.
- File 28 §2: the Second Look-first entry is a small, user-started "Try our Living Atlas" invitation; the first Atlas arrival is seeded from what Second Look already knows — **proposed and confirmed, never silently carried** — and the workshop stands pre-stocked with their agents and projects.
- Ruled 2026-11-28: **no Atlas-only login.** The Atlas never grows its own password, its own sign-up silo, or its own identity to merge later.

## 2. Where the prototype actually is

- The Atlas has **no sign-in at all**: TEST MODE local profiles, stored per browser. A place, its receipts, pins and kept answers live and die in that browser's storage.
- Second Look is live with real accounts (beta cohort, from 2026-11-26) on its own backend. The two systems do not touch: a beta member who opens the Atlas today is a local profile like anyone else.
- So "sync" in this brief means the **interim path** from the prototype to file 28's end state: the Atlas learns to *accept* the master identity and key its world to it. When the products share one backend record, the interim machinery retires; nothing built here should pretend to be the end state.

## 3. The shape of the build

**Phase 1 — identity only.**
- The Atlas gains one sign-in surface: "Sign in with your Second Look account." The holder authenticates against the same identity Second Look itself uses; an Atlas Edge Function **verifies that identity server-side** and issues the Atlas session. The Atlas never trusts a client-claimed identity, and never sees or stores a password.
- The Atlas profile is keyed to the master account id. The holder's place, Lens, grants, receipts, pins and kept answers follow the account across devices and browsers. The account link itself is a receipted record.
- Signed-in arrival starts **Named**, seeded from the account's real name (brief 34: presentation is changeable later, in the profile).
- TEST MODE does not disappear: signed-out local play remains the prototype's sandbox and the demo path. A signed-in holder is simply no longer simulated, and the surfaces say so honestly.
- **Second Look side of phase 1 is small**: the identity it already issues, plus at most a plain confirmation surface ("the Atlas wants to sign you in as…"). No Second Look data moves in phase 1.

**Phase 2 — the workshop pre-stocked (file 13, live).**
- The holder's Second Look projects appear in their workshop as backed Things: `backing_ref {system: "second-look", project_ref}` (the slot already exists in the kit contract), state read live at view time from the Second Look member API, never copied. Status, contract and latest receipts render from the source; the gap shows as a door, per file 12.
- Phase 2 needs a read path on the Second Look side (member API: my projects, their state, their receipts) that does not exist yet. It is scoped here so phase 1 does not accidentally design against a copy.

**Explicitly out of scope:** Atlas-first account creation (creating a master account from the Atlas door — file 28's other entry; proposed as a later phase once phase 1 proves the acceptance path); the file 28 ID-verification check (Stripe Identity) and any assurance upgrade; payments; any change to Second Look onboarding.

## 4. Rules that bind both phases

- Backing, not copying — for identity as for projects: the Atlas holds a reference to the master account, never a shadow copy of the person.
- Nothing is carried silently: anything the Atlas seeds from the account (name, projects, agents) is proposed and confirmed in the arrival flow, per file 28 §2.
- Hard floors and assurance are untouched: a synced account arrives at the assurance its record actually carries (see §5.2), and no door opens on the strength of a sync.
- Every link, claim and seeding is receipted; the holder can see and revoke the Atlas's link to their account from either product.

## 5. Decisions Nic's, before build orders are written

1. **The local world on first sign-in.** A holder who already has a local place (built as a TEST MODE profile) signs in with a real account: what happens to the local place and its receipts? *Silver's recommendation:* offer once, in words, to claim it into the account; declining keeps it local-only; nothing merges silently (file 28's rule). Claiming is one-way.
2. **Assurance on arrival.** A Second Look account today proves an email, not an adult. Synced holders therefore arrive **Unverified** — adult-range doors stay closed until file 28's ID check exists. *Recommendation:* accept this for beta; do not let the sync quietly confer verified-adult standing nobody checked.
3. **Sequencing against the December 8 launch.** This build touches both products' identity surfaces during Second Look's launch window. *Recommendation:* phase 1 is the first cross-product build *after* launch, unless Nic wants one named beta holder (e.g. Sherry) synced earlier as the proving case.
4. **Atlas-first creation.** In phase 1 or later? *Recommendation:* later — phase 1 accepts existing accounts only; creating master accounts from the Atlas door follows once acceptance is proven.

## 6. What the build orders will look like

- **Atlas side (lane A):** the sign-in surface in arrival/profile, the profile keyed to the master account, the verification Edge Function, the claim-your-local-world flow, honest signed-in/signed-out states on every surface that currently says TEST MODE.
- **Second Look side (backend lane):** the identity acceptance contract (what the Atlas presents, what Second Look confirms), the link receipt in the member's record, and in phase 2 the member-API read path for backed projects.
- **Verification:** a named beta holder signs in on a second device and finds their place; a local world is claimed by its owner's word and by no other path; a revoked link closes the Atlas session; Duet's playtest charter gains a signed-in seat for the re-walk.

# Brief: simplification and unification — the crossing engine (direction, file 12)

**Filed by Silver for Nic, 2026-11-12.** Status: **standing design direction.**
It does not interrupt round 2c and it is not a new build round. Integrate it
the way this file says, in the order it says.

## How to integrate this (read first)

1. **Now:** adopt the vocabulary and the core law below in everything new —
   new records, new proposals, lane reports, and the round 2b proxy plan.
   Where an older brief's term conflicts with this file's unified term, this
   file wins for new work; note the conflict in `lane/questions.md` instead
   of silently keeping both.
2. **At the next natural refactor** (not before, and never as a standalone
   rewrite): map existing records onto the five primitives below. Existing
   data keeps working; this is a unification of the model, not a migration
   emergency. Log each mapping call in `lane/decisions.md`.
3. **Never** let this file pull forward queued rounds (3, 4, 5) or bypass a
   gate (file 11's proxy checklist, Nic's approvals). If integrating a point
   here would change a settled decision in `04`, stop and ask via
   `lane/questions.md`.

## The core idea

Living Atlas is a **crossing engine**: nothing — person, agent, content,
data, or (later) a physical actor such as a robot — moves from one place to
another without being **declared, measured, checked against someone's
limits, and receipted**. The 3D campus is one renderer on top of that engine.
Moderation, agent governance, and physical-world monitoring are the same
problem in this model, and they get the same solution.

## Five primitives (the whole ontology)

Everything in the system is one of these, or a view of one of these:

1. **Place** — anything with an inside and an outside: a room, a district
   (places containing places), a source collection, a member's private
   backend, later a physical space. "Homestead", "campus", "exhibit" are
   place presets, not new types.
2. **Thing** — a content block (A6) and anything that behaves like one:
   media, a tool, a dataset, a generated asset. Every Thing carries: author,
   declared scores/capabilities, measured scores/capabilities, style control,
   and an optional source pointer.
3. **Path** — a connection between places or actors. Exactly four kinds,
   no exceptions: **seamless, door, window, embedded**. If a proposed
   feature needs a fifth kind, that is a question for Nic, not a local call.
4. **Lens** — a named bundle of limits and trust: content presets, a saved
   profile's limits, a monitoring mode, a safety profile. One object shape
   serves all of them.
5. **Receipt** — the ledger entry. Every crossing, grant, proposal outcome,
   and merge writes exactly one. Receipts are the only permanent records;
   everything else is a lease (see "Time" below).

**One verb: cross.** Visiting a room, an agent calling a tool, a source
syncing into a room, a helper acting in a place — all are crossings and all
go through the same check. New features must be expressible as crossings of
these primitives; if one cannot be, say so in `lane/questions.md` before
building around the model.

## The core law: declare → measure → show the gap

Declared-vs-measured is one pattern everywhere, not a content feature:

- A profile **declares** an identity ("verified adult"); the system
  **measures** whether it is backed.
- A room **declares** content scores; Stewards **measure** them.
- An agent **declares** its role, scope, and capabilities; the system
  **measures** what it actually does (actions, tool use, cost).

When measured exceeds declared, the result is never a silent pass and never
a deletion: the relevant Path **becomes a door that names the reason**, and
past a hard limit it **stops rendering / stops being crossable** for that
Lens. The gap is always a visible chip with a plain-words reason.

## Unify permissions into one object: the grant

- The **grant** is the only permission object: holder, scope
  (look / enter / suggest / edit), expiry, revocable, receipted.
- A **knock** is a request for a grant. An **invite** is a grant offered.
  A **guest pass** is a short-expiry grant. A **group** is a grant issued
  to a set; an individual grant may narrow, never exceed, the owner's grant.
- New work uses only the grant object in data and code. Older UI labels may
  stay as labels, mapped to grants underneath, and the mapping is logged
  in `lane/decisions.md`.

## Unify actors: people, agents, helpers, devices

- One actor model: display, backing, badge, operator (for agents/devices),
  declared capabilities, scoped grants. **Actors are always visible** —
  this extends file 01's "agents always seen" to any non-person actor,
  including (future) physical devices, which carry device identity, owner,
  and operator.
- A **behavior** (When → If → Then), an attached **helper/agent**, and a
  docent/curator/maintainer/steward are the same thing at three sizes: a
  proposal-maker attached to a Place, acting only within a grant, writing
  receipts. Building UI and agent-staffing UI converge on one idea:
  **"add a helper, pick what it may do."**
- A **Steward** is the standing form of the core law: a helper whose job is
  continuously comparing declared vs. measured for its Place or actor, and
  flagging gaps. Every Place and every long-running actor should be
  describable as having (or not having) a Steward.

## Pre-flight is universal

Fast travel's ready-check (round 2c G1) is a general rule, not a travel
feature: **before any multi-step crossing, check every gate on the route;
if anything is pending, stop at a waystation and continue when approved.**
Apply it to agent plans and (future) physical routes. No actor arrives
somewhere and only then discovers it lacks permission.

## Hard floors

Some limits no owner, Lens, or grant can override: the legal content floors
already in the briefs, plus the standing action floors (approval, spend,
send, publish) wherever an actor can act on the world. Owners rule their
places **under** the floors, never over them. A proposal that needs a floor
changed is a question for Nic.

## Two named limits of the model (do not paper over these)

1. **The physical world can't fork.** Digital places can hold many versions
   at one address, with the Lens choosing. Physical actuation cannot:
   perception may be plural, **movement is single-writer**. Any future
   physical/AR/robot work needs an explicit arbitration rule (e.g. first
   receipt wins, owner priority) proposed to Nic before building.
2. **Time is lease-based.** Presence, events, grants, and sessions are
   temporal. Default everything to leases with expiry; only receipts are
   permanent. New record types must state their expiry or say why they
   are permanent.

## Building, in plain words (member-facing shape)

Three actions; everything else is progressive disclosure:

1. **Claim a place.**
2. **Put things in it.**
3. **Set who can cross.**

Visit vs. Build modes, the kit, generated assets, and helpers all hang off
these three. If a build flow cannot be explained as one of the three, it
needs a simpler shape before it ships.

## What this de-prioritizes

District/zoning mechanics, Town Square feature detail, and discovery
ranking debates are content programming. They stay queued as written and
do not drive the model. The engine above — crossings, the declare/measure
gap, pre-flight, grants, receipts — is what everything else rides on.

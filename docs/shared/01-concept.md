# Living Atlas: concept

## The idea

A campus that is a museum, zoo, aquarium, circus, fair, home show, discussion group and hobby shop at once. Anyone can claim a homestead and build whatever they want, or just wander and explore. AI does the building: people describe what they want and their agent codes it.

It is VR/AR-first, but every space also works on the web, as narration and as text chat. Its larger purpose is to let people digitize their world, including cultures, languages and local history, without it becoming either "just VR" or "just Wikipedia."

## Core principles

- Nobody draws the map. The campus is a graph of rooms joined by edges, and the renderer lays it out around each visitor from that graph plus their lens. Two visitors on "the same" path can see different towns.
- Everything has someone attached. Identity tiers: anonymous, named, named + verified person, agent (with whether a verified person operates it). Agents are always visible, even when dimmed.
- Substance vs. style. Substance (what something says) is owned and governed by its author. Style (how it looks or sounds) can be restyled by anyone. A culture's art can be shown as a documentary, gallery, narration or kids' version, with the author deciding what's open.
- Author-controlled change, like git. The author decides when, where and how their thing can change: none, suggest, fork, or open.
- Many versions can sit at one address. What a visitor sees is decided by their own settings. If it's legal it can exist, behind known guardrails.
- Moderation lives in the structure. The system judges crossings between rooms, not content. Content is never deleted; the map changes per person.
- Owners have final say over their own rooms. Branching or rebuilding is cheap, so leaving costs little.
- Local governance. Neighbors with standing can vote a room off, which cuts their edges to it. The room goes back to being reachable only from its owner's homestead.

## Building blocks

- **Rooms:** any space. Address, author, substance, style, declared content scores, measured content scores, permissions, forks, history.
- **Edges:** seamless (no boundary), door (threshold with preview), embedded (experience inside another; inherits host rules), window (see in, don't enter). Edges need consent: seamless needs both owners and compatible districts; door needs the target owner; a one-way link always shows as a door.
- **Forks:** every room is a stack of versions. Edges point at rooms, not versions.
- **Districts:** zoning with rule envelopes (minimum age, maximum content scores, allowed edge types, who can build). Rooms opt in and must fit.

## The crossing check

At each edge, compare the next room's content scores with the visitor's lens. Within limits: seamless stays seamless, with a quiet chip if something reads odd. One step over on any dimension: the edge downgrades to a door with a preview explaining why. Past hard limits: the edge doesn't render for that visitor. A child never sees the adult district because the connection doesn't exist in their world.

## Content dimensions (not one "intensity" score)

A single intensity number mixes up very different things: a war archive, a rave and a heated debate are all "intense" for different reasons. Every room declares six dimensions, each 0 to 3: **Violence, Sexual content, Language, Disturbing themes, Viewpoint, Sensory.** Visitor reactions produce a measured score beside each declared one.

- Visitors pick a preset (Kids, Teen, Adult, Everything) or set each dimension, with hard-limit locks.
- Crossing rule: within limits everywhere = pass; any dimension one step over = door that names the dimension; past a hard limit = not rendered.
- Viewpoint is where "the offensive version exists, but you opt in" lives.
- Sensory doubles as accessibility: motion comfort and photosensitivity.

## Contesting

Someone flags a room. An AI mediator (always badged as an agent) proposes options beyond keep/delete: add context, put it behind a door, move it to the district edge. Neighbors with standing vote, one vote per verified person. The outcome is logged as precedent so everyone knows how similar cases go next time. The mediator proposes and explains; people and the space's rules decide.

## Why it matters

This is a provenance and permissions model for human knowledge with a spatial front end. The 3D world is one client on top of it.

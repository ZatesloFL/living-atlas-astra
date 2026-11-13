# Brief: the Builder and Atlas Gus (QUEUED, round 5)

**Status:** queued. Don't build it until Nic says go. Read it now so round 2c's exhibits and presentation presets are built as the first pieces of the kit described here (see "What round 2c must already do").

## The idea

**Our code, their ideas.** Users build rooms, exhibits and experiences by composing from a vetted **kit** of components, giving them **behaviors**, generating **assets** with AI, and styling everything. Everything they make is **data** that our engine renders and our rules engine governs. No user code. That is how Living Atlas can be "Minecraft on steroids" while crossing rules, content scores, versions, layers, receipts and agent visibility keep working on everything anyone builds.

## Two different experiences: Visit and Build

Building is a first-class mode, not a slide panel. Like Creative vs Survival in Minecraft, Build/Buy in The Sims, or Studio vs Player in Roblox, entering Build changes the whole experience:

| | Visit mode (today's app) | Build mode |
|---|---|---|
| World look | Atmospheric night campus | Work lighting, a soft blueprint grid on the ground, outlines on selectable things, everything that's off-limits to edit dimmed |
| Camera | First person, walk | Fly, orbit and top-down, switchable; tap-to-focus on any object |
| HUD | Location, lens, Atlas, joystick | **Kit drawer** (bottom), **Inspector** (side sheet), **Gus** (docked chat), **Outline** (layers/tree), Undo/Redo, Preview as, **Publish** |
| What you're editing | Nothing (your own view's style only) | A **draft** of the room: a private fork. Nothing reaches visitors until Publish |
| Exit | n/a | "Back to visiting" returns to the exact place you entered from |

Entry: **Build** button on a room you own or have edit rights to, or "Build here" on your homestead. A short transition (the world "unfolds" into the blueprint look) makes the mode change unmistakable.

## Three ways to build (keep it this simple)

1. **Talk:** tell Gus what you want in plain words. Gus proposes a change (new components, behaviors, layout, style). It appears in the draft highlighted as **Proposed**; the owner taps **Keep** or **Undo**, or asks for changes.
2. **Place:** drag from the Kit drawer into the world. Snapping to the grid and to surfaces, simple move/rotate/scale handles, duplicate, delete.
3. **Tune:** select anything; the Inspector shows its settings in plain words (content, behavior, style, who can see it, content scores). No raw data on screen.

All three produce the same thing: records in the draft.

## The kit

- **Spaces:** room shells, courtyards, galleries, alcoves, booths, paths, plazas, water, terrain patches.
- **Exhibit components:** screen/video, photo wall, listening station, reading stand (documents, newspapers), model plinth, map table, timeline wall, quote wall, seat map, diorama, kiosk. Round 2c's five boycott exhibits are the first five.
- **Fixtures:** lights, lanterns, signs and nameplates, benches, plants, doors, windows, portals.
- **Agents:** place a Docent, Curator, Maintainer or Steward (round 3 roles) with a scope.
- Each component has a fixed set of settings, a performance cost the builder can see (a simple budget meter for the room), and accessibility built in (captions, transcripts, alt text, readable text sizes).

## Behaviors (logic as data)

Simple **When → If → Then** rules attached to components or rooms:

- **When:** someone enters/leaves an area, taps something, finishes a trail stop, a time of day, a timer, an event starts, a layer is integrated.
- **If:** visitor's lens/audience version, holds a grant, belongs to a group, has visited X, a component's state.
- **Then:** play/pause media, show/hide, move/animate, change a light, open/close a door (within crossing rules), show a caption or card, start narration, set a state, give a trail stamp, notify the owner.

Shown in the Inspector as readable sentences ("When someone taps a seat, play that seat's story"). Gus writes them from plain English. The engine runs them; they can't reach outside the room, can't override crossing rules or grants, and count against the room's performance budget.

## AI-generated assets

Gus can generate **3D models, textures, images, sounds, music and voices** in the room's style ("a 1950s city bus, low-poly, our palette"). Assets are files, not code. Each generated asset: is labeled AI-generated in its provenance; gets content scores proposed and confirmed by the owner; goes through the same approval and receipts; and is never presented as an authentic historical artifact (the "sample media" honesty rule from round 2c still applies).

## Draft, preview, publish

- Every Build session edits a **draft** (a fork of the room).
- **Preview as** (from Tier C) and **split compare** work inside Build mode against the draft.
- **Publish** opens a review sheet: what changed (a plain-language diff plus thumbnails), any content-score changes, any new crossing effects ("Kids will no longer see the bus seat stories"), the performance budget, then **Publish**. Publishing writes a receipt; the previous published version stays restorable.
- Collaborators with edit grants can build in the same draft; suggest-only collaborators' changes arrive as proposals.

## Atlas Gus and the AI underneath

- **Atlas Gus** is the builder's assistant inside Build mode (and the guide in Visit mode, per round 3). Each user also has their own agents from Second Look.
- **Default:** Living Atlas's own AI, included. **Optional:** a user can connect their own AI provider/API key (more usage, a preferred model, or their own private tools and data through their own connectors).
- Whatever model is used, **governance doesn't change**: the model only proposes records; the schema and rules engine validate them; the owner approves; receipts record which model and which agent proposed what. Agent badges show the operator (and model, in details).
- Keys and private connections live server-side in the member's own Second Look backend, never in the page. Private data a user's agent brings in stays in that user's private rooms unless they publish it.

For this prototype round, simulate Gus with scripted proposals; real models arrive with the round 2b server proxy.

## What round 2c must already do

- Build each boycott exhibit as a **reusable component** with a settings schema, not a one-off: so the same "listening station" can be placed in any room with different content.
- Express exhibit interactivity (play on tap, pause on leave, seat stories) as **When → If → Then** behavior records the engine interprets, even if no editor exists yet.
- Store each room's look as a `presentation` preset (as specified), so Build mode can edit it later.

## Done looks like (when started)

Visit/Build are visibly different modes with their own HUD and camera · Kit drawer with spaces, exhibits, fixtures and agents · place, snap, move/rotate/scale, duplicate, delete · Inspector in plain words · behaviors shown as sentences, runnable, bounded by crossing rules and budget · simulated Gus proposals (Keep/Undo) that create components, behaviors and style · simulated AI asset generation with provenance labels · draft, Preview as, split compare, publish review with diff and crossing effects, receipts, restore · performance budget meter · 60 fps holds in Visit mode on the Pixel.

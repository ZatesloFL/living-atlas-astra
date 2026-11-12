# Build brief: "Living Atlas" prototype (v3)

**What changed in v3:** content "intensity" is now six named dimensions; the target is Chrome on a Pixel phone only; the work is a multi-file repo with Three.js allowed; the visual bar is 3D-game quality; the work is split into three tiers, finished in order; visitors can view and make permitted edits but not create new rooms.

## Goal

A small but robust 3D demo that Nic can walk around in on his phone, with **3D-game visual quality**, even though nothing is hooked up to a backend. Put the effort into how it looks, how it moves, and how the structure and controls work. Keep content light.

## Target and constraints

- **Device:** Chrome on a Google Pixel phone. Nothing else is required. Portrait first; landscape must also work. No WebXR, no desktop requirement (it may still work there).
- **Repo:** you work in your own GitHub repo. Multiple files are fine. Serve the app at `index.html` via GitHub Pages so every commit gives a live URL.
- **Engine:** Three.js, vendored into the repo (no CDN at runtime). Other small libraries are fine if vendored and justified in your decisions log.
- **Assets:** generate geometry, materials and textures in code. No downloaded models or image files.
- **Visual bar:** real-time lighting with one shadow-casting sun, fog, bloom on glowing objects, particles (dust, sparks, water), smooth camera easing, soft ambient audio optional. Aim for the look of a stylized indie game, not a tech demo.
- **Performance:** stable 60 fps on the Pixel. Cap device pixel ratio at 2. Include a hidden performance overlay (frame rate, draw calls) toggled by a small button or long-press.
- **Controls:** left-thumb virtual joystick to move, right-thumb drag to look, tap to select, a full-screen button. Respect reduced-motion.
- **No backend, login or live AI.** Simulate everything from in-app data. Keep state in memory; if you use localStorage, wrap every read and write in try/catch.
- **Narration** uses the browser's built-in speech synthesis. **Provenance ledger** uses SHA-256 from crypto.subtle, chained like an append-only log. No real blockchain.

## Scope: what a visitor can do

- **Yes:** walk, look, select, change their lens, view any form, restyle anything (their own view only), fork or suggest substance where the author allows, propose connections from their homestead.
- **No (round 2):** create new rooms from scratch (that needs live AI).
- **Stretch, only after tier 2:** drop one of three ready-made rooms into your homestead and pick its edge type.

## The idea in one paragraph

Living Atlas is a campus: museum, zoo, aquarium, fair, home show, discussion hall and hobby shop in one place. Anyone can claim a homestead, or just wander. Nobody draws the map. Every space is a **room**, rooms are joined by **edges**, and the renderer lays out the campus around each visitor from that graph plus the visitor's **lens**. Moderation lives in the structure: the system judges **crossings**, not content, and nothing is deleted. The map changes per person.

## Building blocks

### 1. Rooms

```
{
  id, address,                 // e.g. "tlh/studio/workbench"
  title,
  district,
  author: { name, tier, verifiedHuman, isAgent },
  substance: { summary, body, claims: [{ text, source }] },   // governed
  style: { preset, palette, shape, scale },                   // remixable
  forms: ["3d","card","narration","text"],
  content: {                   // DECLARED by the author, each 0-3
    violence, sexual, language, disturbing, viewpoint, sensory
  },
  measured: {                  // what visitor reactions SAY (simulated), each 0-3
    violence, sexual, language, disturbing, viewpoint, sensory
  },
  minAge,
  permissions: {
    substance: "none"|"suggest"|"branch"|"open",
    style: "open"|"limited"|"none",
    embed: "anyone"|"approved"|"none"
  },
  ratings: { author, vouched: [], academic, community },
  visibility: "public"|"verified-only"|"private",
  history: [ { hash, prevHash, actor, action, time, diff } ],
  forks: [ { id, author, basedOn, substance, style, history } ]
}
```

A visitor's **homestead** is their root room: private by default.

### 2. Content dimensions (replaces "intensity")

Each room declares six dimensions, each scored 0 to 3:

| Dimension | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Violence | none | mentioned | shown, not graphic | graphic |
| Sexual content | none | romance, innuendo | partial nudity | explicit |
| Language | clean | mild | strong | slurs |
| Disturbing themes | none | sad or tense | death, abuse, atrocity discussed | atrocity shown |
| Viewpoint | mainstream | contested | offensive to many | hateful but legal |
| Sensory | calm | music, mild motion | loud, fast motion | flashing lights, intense motion |

Sensory is also an accessibility setting (motion sickness, photosensitivity).

### 3. Edges

| Type | What the visitor experiences | Consent needed |
|---|---|---|
| **Seamless** | No visible boundary; ground and light blend | Both owners, compatible districts |
| **Door** | A glowing threshold with a preview of the other side | Target owner (a one-way link always shows as a door) |
| **Embedded** | An experience inside another; inherits the host's rules and can't exceed the host's content scores | Host approves |
| **Window** | See in without entering | Target owner allows viewing |

Edges point at rooms, not versions.

### 4. The crossing check

At each edge, compare the next room's content scores (use the higher of declared and measured) against the visitor's lens, dimension by dimension:

- **Every dimension within limits:** pass through. If measured is above declared on any dimension, show a quiet "oddness" chip naming it.
- **Any dimension one step over:** the edge becomes a **door**. The preview names the dimension ("Disturbing themes: 2, your limit 1").
- **Past any hard limit, or under the room's minimum age:** the edge **does not render** for this visitor.

Also:
- **Vote-off = cutting edges.** The room returns to its owner's homestead.
- **Owners rule their own rooms.**

### 5. Districts

Zones with limits rooms must fit inside: minimum age, maximum score per dimension, allowed edge types, who can build. Shown as soft color washes on the ground and the map.

- **Commons:** all ages, every dimension max 1.
- **Makers Row:** workshops and homesteads, every dimension max 1, Sensory max 2.
- **History Quarter:** Disturbing themes and Viewpoint up to 2, academic ratings shown prominently.
- **After Dark:** 18+, verified adults only, any score.

### 6. Identity tiers

**Anonymous**, **Named**, **Named + verified person**, **Agent (operated by a verified person: yes/no)**. Agents can be dimmed, never hidden.

## Lens presets

| Preset | Limits (all dimensions unless noted) | Hard limits |
|---|---|---|
| Kids | 0, Sensory 1 | locked at the same values |
| Teen | 1, Language 2 | 2 |
| Adult | 2 | none |
| Everything | 3 | none |

"Advanced" opens one control per dimension (0–3) with its own hard-limit lock.

## Sample content (keep it light)

**Homestead: "Nic's Studio"** at `tlh/studio` (Named + verified person), Makers Row.

- **Second Look workbench.** Glowing agent-setup objects. One is an agent named "Silver" (Agent, operated by verified person: yes). Substance "branch", style "open". Seed one fork by another named user.
- **Governance desk.** "Sterling": approvals and receipts for human authority over AI agents. Substance "suggest".
- **Research wall.** Pinned research threads with sources.
- **Lab bench.** A 4x4 grid of mesh nodes pulsing in a wave. Substance "none".
- **Broadcast booth.** "Dangerously Reasonable" and a daily news briefing. **Embedded** inside: a small listening booth.
- **Civic table.** A community-owned civic data hub concept.
- **Family room.** Private. Render only the doorway with "Private space, something is here."

**"Welcome to Tallahassee"** in the History Quarter, through a **door** from the studio: canopy roads, the historic Capitol and modern tower, Mission San Luis, the 1956 bus boycott, Cascades Park. Mark each as sample content with one "source to verify." Give each stop two or three authors at different tiers. Bus boycott stop: Disturbing themes 2, Viewpoint 1, with a **time slider** (1956 / today).

**Seeded edges:**
- Canopy roads → Capitol: seamless.
- Studio → Tallahassee: door.
- Broadcast booth → listening booth: embedded.
- Commons → After Dark: door for verified adults, not rendered for anyone else.
- Commons → "Night Market" (declared Sensory 1, measured Sensory 2): seamless with an oddness chip for Adults, door for Teen.

## UI

### Main view
- **Breadcrumb** at top with district color: `tlh / studio / workbench`.
- **Atlas** button top right, **Build** bottom left, **joystick** bottom left area, **Lens** bottom right (primary).
- **Info card** for the selected object: title, author and tier badge, district, the six content scores as small chips (only non-zero ones), ratings, available forms, permission summary in plain words, History link.

### Edge rendering
- Seamless: ground material and lighting crossfade, no frame.
- Door: glowing arch; approaching shows the preview card with the reason.
- Embedded: shimmering surface inside the host; breadcrumb shows "Inside: [host]".
- Window: translucent pane you can see through.
- Crossing chips slide in ("Entered History Quarter", "Night Market reads louder than it says: Sensory 2").

### Lens panel (most important UI)
Bottom sheet. Every change rebuilds the view with a short transition.
- **View as:** Me / Verified adult / Unverified visitor / Child / An agent. The showpiece: edges change type, districts vanish. "An agent" shows the plain structured text an AI visitor reads.
- **Content:** preset chips (Kids, Teen, Adult, Everything) + Advanced (six controls with locks).
- **Depth:** Glance / Standard / Deep.
- **Show me:** Verified / Named / Anonymous / Agents (Agents only dims, with "Agents are always visible").
- **Trust from:** Author / Vouched / Academic / Community.
- **Form:** 3D / Cards / Narrate / Text.
- **Style:** Studio / Documentary / Gallery / Kids, with a "substance unchanged" check.
- **Quiet mode.**

### Atlas
2D overlay: rooms as nodes colored by district, edges by type (soft band = seamless, arch = door, nested ring = embedded, dashed = window). **"Show what others see"** draws hidden or downgraded edges in faint gray with the reason on tap.

### Build mode
Tabs: **Style** (yours only), **Substance** (permission stated plainly; fork switcher; diff), **Connect** (propose an edge type from your homestead; consent rules; simulated response; seamless into an incompatible district is refused with the reason). Every edit appends a ledger entry; History lists entries; "Verify chain" recomputes and shows a check.

### Contest flow
On Night Market: flag → AI mediator (agent badge) proposes three options (context note, door after 9 pm, move to the district edge) → simulated neighbor vote → the chosen option visibly changes the edge → precedent logged.

### First 60 seconds
Three intro cards ("Nobody draws this map. It builds around you." "Everything has an author." "You choose your lens."), then drop into the studio with the Lens button pulsing once.

## Tiers: finish in order

Don't start a tier until the one before it runs smoothly on the Pixel.

**Tier 1: walk and see**
- Studio and Tallahassee load, connect, and look game-quality at 60 fps.
- Touch controls feel good.
- All four edge types appear and behave differently.
- Crossing check by dimension: pass, door with reason, not rendered.
- Lens: View as, content presets and Advanced, Show me (agents never hidden).
- Info cards with content chips.
- Atlas with "Show what others see."
- Private room shows the doorway and address only.

**Tier 2: change things**
- Build mode: Style, Substance (all four permission states, fork switcher, diff), Connect.
- Ledger with History and Verify chain.
- Depth, Trust from, Style presets, Quiet mode.

**Tier 3: the rest**
- Contest flow end to end.
- Narrate and Text forms.
- Bus boycott time slider.
- Intro cards.
- Stretch: drop a ready-made room into your homestead.

## Done looks like (report each as Pass / Partial / Fail)

Every item in the tier lists above, plus: performance overlay shows a stable 60 fps on the Pixel in both scenes.

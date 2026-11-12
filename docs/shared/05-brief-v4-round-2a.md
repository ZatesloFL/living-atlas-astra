# Build brief v4: round 2a (profiles, access, travel, layers)

**How this fits:** v4 builds on v3 (`02-build-brief.md`). Everything in v3 still applies unless this file says otherwise. Where they differ, v4 wins. Tier 1 from v3 is done; this round replaces v3's tiers 2 and 3 with the tiers below. v3's Build-mode substance editing (forks, diff, Connect), contest flow, narration and text forms are **deferred** unless they fall out naturally.

No live AI in this round. AI features (a talking guide, describe-a-style) come in round 2b, behind a server-side proxy. Don't put any API key in the front end.

## Tier A: polish and profiles

### A1. Tier 1 fixes (do these first)
- Signs: make room signs readable at walking distance on a phone (bigger type, higher contrast, billboard toward the camera). Make sure no sign is hidden behind a tree trunk (the 1956 bus sign currently is).
- Portrait framing: the bottom of the portrait screen is mostly empty floor. Raise eye height slightly and/or tilt the default pitch up a little so more of the world is in view.
- Atlas labels: offset labels so they never sit on top of their node markers ("Capitols," "Broadcast" currently overlap).

### A2. Identity is two separate settings
- **Display:** Anonymous, Pseudonym, or Real name. This is what others see.
- **Backing:** Verified person, or none. This is whether a verified person stands behind it.

All combinations are valid and labeled. The badge shows both, e.g. "Anonymous · verified person behind it" vs "Anonymous · no trail." Agents keep their own badge plus whether a verified person operates them.

### A3. First-run setup
On first load: a short setup sheet asks age and the visitor's default lens (Kids / Teen / Adult / Everything, plus Depth and form). Then it saves a profile and drops them in.

**Guardrail:** a self-reported age can't unlock adult areas. Without verification, content limits cap at Teen, and After Dark and other verified-only places stay hidden. (In the prototype, the test panel below can override this.)

### A4. Profiles (saved like game loadouts)
- A **profile** bundles: identity (display + backing), age, content limits and hard locks, Show me filters, Trust from, Depth, preferred form, style preset, accepted layers.
- **Seed profiles:** Me (Real name, verified), Verified adult, Unverified visitor, Child, An agent. Users can save new ones and rename or delete their own.
- **Remember the last profile used** and load it on return (localStorage, every read and write wrapped in try/catch). No starting from custom each time.
- **Profile chip** next to the breadcrumb ("Viewing as: Me · Adult"). Tap it for a quick switcher. **Long-press the Lens button** for a radial wheel of saved profiles.
- Every profile switch writes a ledger entry.

### A5. Developer test panel
A panel with a switch for every identity and access setting: age, display, backing (verified or not), group memberships, and "play as owner / play as visitor." Shows a persistent **TEST MODE** banner while it's open or while any override is active. It's a build tool and will be removed once real verification exists.

### A6. Content as data, formats as renderers (do this before Tier B)

Goal: the same content can be shown as a web page, a 3D walk, and later VR and real-world AR, **without changing the data or making the builder rebuild anything**. This is a restructure, so do it now before Tier B and C add more content.

**1. Content blocks.** Every room's content becomes an ordered list of typed blocks that say what the content is, not where it goes:

```
block: { id, type: "heading" | "text" | "image" | "video" | "audio" | "model" |
               "timeline" | "map" | "quote" | "data" | "infobox" | "citation" | "link",
         importance: "core" | "supporting" | "detail",
         body, reps: { text, alt, transcript, poster, model, image },  // fallbacks
         sources: [ { label, url, status: "to verify" | "verified" } ],
         content: { ...six dimension scores, optional; inherits the room's } }
```

- **Wikipedia-level depth:** a room can hold an article's worth of blocks: an infobox, a lead, sections with headings, a timeline, media, citations, and "related" links to other rooms. `importance` lets each renderer and the Depth setting decide how much to show: Glance = core only, Standard = core + supporting, Deep = everything.
- **Fallback ladder:** every block carries simpler forms (model → image → text; video → poster + transcript). Any renderer can always show something, and narration/text forms come free later.

**2. Layout hints instead of hard-coded positions.** Move room placement out of `world.js` into the data. Each room gets:

```
layout: { kind: "gallery-wall" | "plinth" | "path-stops" | "booth" | "panorama" | "courtyard",
          slot, scale, facing },
geo:    { lat, lng, heading, elevation }   // optional; real places only
```

The 3D renderer turns a layout hint into geometry. It should be possible to add a new room to the data with a layout hint and see it appear in the walk without touching renderer code. Add `geo` to the five Tallahassee rooms (approximate coordinates are fine; mark them "to verify"). Studio rooms have no `geo`.

**3. A Page renderer (the proof).** Add **Page** to the Form options. It renders the current room, or a room picked from the Atlas, as a scrolling, readable web article built from the same blocks: infobox, lead, sections, timeline, media with fallbacks, citations, related-room links (tapping one goes to that room in whichever form is active). The Lens applies exactly as in 3D: content limits, Depth, Show me, Trust from, and later versions and layers. Switching between 3D and Page keeps your place.

**4. One deep sample.** Fill the **1956 bus boycott** room to article depth (infobox, lead, 4 to 6 sections, a timeline, 3+ media placeholders with alt text, related links to the Capitol and Cascades Park, and citations marked "to verify"). Write it as clearly marked sample content; don't present unverified facts as verified. Keep the other rooms light.

**Rule:** renderers never contain content, and content never contains renderer code. The rules engine stays shared by all renderers.

## Tier B: travel and access

### B1. Atlas is also fast travel
- Tap a node for a card with **Travel here** and **Set waypoint**.
- **Travel:** the camera glides along the graph route. **Doors on the route still count.** If the route crosses a door, travel stops there and shows its preview, same as walking up to it. Places the visitor can't reach never appear as destinations.
- **Waypoint:** a glowing marker in the world plus a slim compass strip at the top showing direction and distance.
- **Address bar:** type or paste an address (e.g. `tlh/tallahassee/1956`) and go, with the same rules.
- Pins, Recent places, and Home (your homestead) in the Atlas.

### B2. Room visibility (set per room by its owner)
- **Public:** anyone whose lens allows it can walk in.
- **Listed:** the door is visible; strangers see "Private space, something is here" and can **Knock**.
- **Hidden:** no door at all unless the visitor holds a grant. Otherwise reachable only by address plus a grant, or an invite link.

### B3. Access grants
A grant is a small record:

```
{ id, room, to: { person | group }, scope: "look" | "enter" | "suggest" | "edit",
  expires, approvedBy, createdAt, revokedAt }
```

- If the visitor holds a valid grant, the door appears for them even when the room is hidden.
- The crossing check gets a new first question at every door: **does this visitor hold a grant?** Content limits and age rules still apply on top (a grant never overrides a hard limit or the age gate).

### B4. Groups
- **Made groups:** someone builds a list ("Family," "Writing circle").
- **Credential groups:** membership comes from something verified ("Verified Tallahassee resident," "My neighborhood"). Simulate membership with the test panel.
- A **group grant sets the baseline** for all members. **Individual permissions sit on top**: the more specific setting wins. A group can never hand out more than the owner allowed.

### B5. Requests and receipts
- **Knock** (visitor-initiated request), **Invite** (owner sends a link or taps a person), **Guest pass** (time-boxed grant), **Key group** (standing grant to a group).
- A knock becomes a request to the owner, who can approve, decline, or approve with a time limit. In the prototype the owner response is simulated; with "play as owner" in the test panel, Nic can approve it himself.
- **Agents** may knock on someone's behalf, but a person must approve. An agent inside a private room is visible to everyone present.
- Every request, grant, use and revoke writes to the room's append-only ledger (SHA-256 hash chain from v3). The owner can open a **Who's been here** view: who got in, on whose say-so, and when.

## Tier C: audience versions, style control and layers

### C1. Versions by audience
The builder can make several versions of the same thing, each with its own content scores. Seed one example on the 1956 bus boycott:
- **Textbook:** maps, timeline, no graphic detail. Fits Kids.
- **Documentary:** accounts and archival-style presentation. Fits Teen and Adult.
- **Immersive:** the fullest version. Adults only (sample placeholder is fine).

The visitor's lens automatically shows **the most detailed version they qualify for**. Kids get the textbook version, not a locked door. A small label always says so: "You're seeing the Textbook version. 2 others exist."

### C2. How much viewers can change it (per item, set by the builder)
- **Fixed:** everyone sees exactly what the author made (e.g. cultural artwork).
- **Author's looks:** viewers can switch only between styles the author approved.
- **Open:** viewers can restyle it freely in their own view.

This is separate from the substance permission. Show the setting plainly on the info card.

### C3. Layers (community additions)
Additions that sit on top of the original without changing it. Each has a type, an author (with identity badge) and trust signals (vouches, ratings):
- **More detail**, **Counterpoint**, **Expert deep-dive**, **Viewpoint** (scored on the Viewpoint dimension), **Remix**.

Viewer controls in the Lens:
- **Layers:** Core only / Vouched / Everything, plus type filters ("yes to Expert, no to Viewpoint").
- Depth "Deep" automatically includes Expert deep-dive layers.

**Preview before integrating:** layers the viewer hasn't accepted appear as small glowing pins or margin notes in the world. Tap one to peek in a side panel without it entering the main view. **Integrate** adds it to their view and their profile remembers that choice.

**Author merge:** any layer can be **proposed to the author**. The author can accept it into the official version (like a git merge), which writes a receipt and credits the contributor. Simulate the author's response with "play as owner."

Seed the bus boycott and the Capitol with 2 to 3 layers each, at different types and trust levels.

### C4. Preview as (creator tool)
In Build mode:
- **Preview as:** a row of profile chips that re-renders the scene as each profile in real time.
- **Split compare:** a vertical swipe divider showing two profiles side by side (e.g. Adult left, Child right).
- **Lens diff:** one toggle that ghosts in what other profiles see differently (same gray treatment as the Atlas "Show what others see").

## Data model additions

```
profile:  { id, name, identity: { display, backing }, age, limits, hard, show,
            trustFrom, depth, form, stylePreset, acceptedLayers: [] }
group:    { id, name, kind: "made" | "credential", members: [] }
room +=   { visibility: "public" | "listed" | "hidden",
            grants: [], versions: [ { id, name, content, body } ],
            styleControl: "fixed" | "authorLooks" | "open", approvedLooks: [],
            layers: [ { id, type, author, trust, content, body, proposed, merged } ] }
```

Keep everything compatible with the v3 room record and the Second Look future-fit note in `04-decisions-and-open-questions.md`.

## Decisions made this round (also log them in your lane if you rely on them)
- New visitors set age and default lens on first run; real ID verification comes later.
- Identity = display (anonymous / pseudonym / real) + backing (verified / none).
- Self-reported age caps at Teen; adult areas need verification.
- Room visibility is the owner's choice: public, listed or hidden.
- Groups: made and credential; group grant is the baseline, individual permissions on top, never exceeding the owner's grant.
- Fast travel respects doors.
- Audience versions are intentional and builder-controlled; the visitor always sees a label that other versions exist.
- Style control per item: fixed / author's looks / open.
- Layers are opt-in by the viewer, previewable before integrating, and mergeable by the author.
- Agents may request access but a person approves.

## Order of work

Finish Tier A (including A6), push, and give Nic a phone checklist. Then Tier B, then C. Same rule as before: a solid Tier A beats three rough tiers.

## Done looks like (report each Pass / Partial / Fail)

**Tier A:** tier 1 fixes · identity two axes and badges · first-run setup · profiles saved, remembered, switcher and radial wheel · test panel with TEST MODE banner · Teen cap without verification · A6: content blocks, layout hints in data (new room appears without renderer edits), geo on Tallahassee rooms, Page renderer with Lens and Depth, deep bus boycott sample.

**Tier B:** Atlas travel with doors respected · waypoint and compass · address bar · pins, recents, home · public / listed / hidden rooms · grants with scope and expiry · made and credential groups with individual overrides · knock, invite, guest pass, key group · ledger entries and Who's been here view.

**Tier C:** audience versions with the "other versions exist" label · style control per item · layers with pins, preview, integrate, type filters · propose-to-author merge · Preview as, split compare, lens diff.

Plus: stable 60 fps on the Pixel still holds.

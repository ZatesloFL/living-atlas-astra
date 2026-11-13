# Brief: round 2c, arrival and presentation (CURRENT, after round 2a)

**Status:** current. Round 2a is complete and Nic confirmed on his Pixel 10: normal startup at Level 1 (full bloom, shadows, DPR 1.65) holding **60 fps at 17–22 draw calls**. Keep that budget. This round builds on v3, v4 and A6; where they differ, this file wins. Rounds 3 and 4 (files 06 and 07) stay queued.

Three goals: (1) travel that feels like a game's fast travel, not a walk-along; (2) a HUD that never stacks or overlaps; (3) a bus boycott exhibit that shows off what Living Atlas can display, in both 3D and a polished web Page.

## G1. Fast travel with a pre-flight check (replaces walk-along travel)

How games do it: fast travel is a **fade, a short load, and an arrival at a designated point** (a waypoint outside the place, not inside it). Parties use a **ready check** before a match starts: nothing begins until every condition is satisfied. VR uses a **fade or blink** for comfort. Combine those.

**Flow:**
1. Tap **Travel** (Atlas node, address bar, trail, pin). A **Travel sheet** opens: destination card, the **arrival point** choice, and a **checklist** of everything on the route that needs the visitor: doors that need a preview confirmation, knocks awaiting an owner, invites to accept, passes that will be used.
2. Each checklist row shows its state: *Needs you* (tap to see the preview and confirm), *Waiting on owner* (knock sent), *Ready*. Rows resolve in place; the visitor never walks up to a door to find out.
3. **Go** is enabled only when every row is Ready. Then: **fade to white** (about 350 ms out, a brief hold, 350 ms in; reduced-motion: a simple crossfade with no white flash), and the visitor appears at the chosen arrival point, facing the destination.
4. If something is still pending (an owner hasn't answered a knock), the visitor can choose **Go to waystation**: travel now to the last point they're cleared for (the nearest public room or the doorstep of the destination) and wait there. A chip shows "Waiting on Nic to approve"; when it's approved, a toast offers **Continue** (another short fade). Declined: the chip says so and offers Knock again / Leave.
5. **Cancel** is always available and leaves no partial state.

**Arrival points (data, per room):** add `arrivals: { outside, door, inside }` to each room's layout data. Each is a position and facing. *Outside* is the district plaza or approach near the room (a public "landing pad"). *Door* is right at the threshold. *Inside* is the entry point within. The visitor chooses; default is **Door** for rooms that need confirmation and **Inside** for rooms that don't. Hidden rooms the visitor can't reach never appear as destinations (unchanged).

Rules stay exactly as in v4: doors on the route still count, grants never override hard limits or the age gate, every use writes a receipt. The pre-flight just moves those decisions to one screen before the fade.

Walking stays available for people who want to explore; the waypoint/compass from Tier B remains for walkers.

## G2. HUD layout: one system, no overlaps

Nic's phone screenshots show overlaps: the travel/waypoint bar covers the "Viewing as" chip, the "Entered Makers Row" toast sits under the performance overlay, and the Diagnostics pill covers the "Access & room receipts" button inside a panel. Fix with a layout system rather than one-off nudges:

- **Fixed zones:** top-left (location + profile chip, stacked), top-right (test, fullscreen, Atlas), one **notification lane** under the top bar (travel status, waypoint, waiting chips, toasts; they queue and never overlap), bottom-left (Build), bottom-centre (joystick), bottom-right (Lens). Respect safe areas.
- **Diagnostics pill:** hide it in normal running at Level 1. Show it only in safe mode, after a fallback, or under `?test`. When a sheet or panel is open, hide all floating pills.
- **Performance overlay:** dock it as a small strip in the notification lane when on, not a floating box.
- **Page button:** move it into the Lens Form row and the info card; don't keep it floating.
- Add an automated layout check at 524×1166 CSS px (Nic's Pixel) and landscape that fails if any two HUD elements' boxes intersect.

## G3. The 1956 bus boycott exhibit (3D and Page)

Build a small exhibit in the History Quarter that shows off display types. Use **4 or 5 exhibits** from this list, each existing as content blocks (A6) and rendered in both 3D and Page:

1. **Video:** a screening alcove with a screen in 3D (tap to play; pauses when you walk away; captions on). In Page: a proper video player with poster frame, captions and transcript.
2. **Photo wall:** 4–6 framed images on a gallery wall with spot lighting; tap for a lightbox with caption and credit. In Page: a responsive gallery grid with lightbox.
3. **Oral history listening station:** a bench with headphones; tap to play; waveform plus a synced, highlighted transcript. In Page: an audio player with the same synced transcript.
4. **Newspaper front page:** on a reading stand under a lamp; tap to zoom and pan; headline and article columns readable. In Page: a clipping-style figure with zoom.
5. **The bus:** a walk-around model with a simple interactive seat map showing where riders were made to sit, with short captions. In Page: an annotated diagram.

**Media honesty (required):** there's no network access to real archives yet and nothing may be fabricated as authentic. Use **clearly labeled sample media**: generated imagery, a short generated animation or slide sequence for video, speech synthesis reading a sample transcript for audio, and an obviously sample newspaper layout with lorem-style or explicitly fictional placeholder copy. Every exhibit shows a visible **"Sample media · real archive to connect"** label and a source pointer marked *not synced* (round 4 plugs in real sources). Captions and transcripts are sample text marked *to verify*.

Content scores per exhibit: set so Kids sees the Textbook-appropriate exhibits and Teen/Adult see more (use the audience versions from Tier C).

## G4. Page as a designed web experience

The Page form should look like a museum's digital exhibition or a quality news feature, not a form. Build a small **presentation system** that any room's blocks render into:

- **Type scale and rhythm:** a display serif for titles, a readable body size (at least 18 px on phones), generous line height, a max line length, consistent spacing.
- **Hero:** title, dek, author/identity line, sample/verification status, hero image or scene still.
- **Components:** infobox card, pull quote, figure with caption and credit, gallery grid with lightbox, video player, audio player with synced transcript, timeline (vertical on phones), clipping viewer, map/geo card, citation list with status badges, related-rooms cards, layer notes in the margin (on phones: inline expandable notes).
- **Lens controls** move into a compact sticky bar (Depth, Content, Layers) that collapses on scroll. Remove the form-style dropdown header from the reading view; keep it in a settings sheet.
- **Presentation preset per room (data):** `presentation: { theme: "exhibition" | "editorial" | "notebook", accent, heroBlock }`. The creator sets it; a future AI builder (Gus) can propose one, and the owner approves. Rooms without one get a good default generated from their blocks.

Apply it to the bus boycott article first, then let every other room inherit the default.

## Done looks like (Pass / Partial / Fail)

**G1:** Travel sheet with route checklist · Go enabled only when all rows are Ready · fade to white (crossfade under reduced motion) · arrival choice Outside / Door / Inside from room data · waystation when something is pending, with Continue on approval · Cancel leaves no partial state · receipts unchanged.
**G2:** zones and notification lane · Diagnostics pill hidden at Level 1 · perf overlay docked · Page button moved · automated no-overlap check at 524×1166 and landscape.
**G3:** 4–5 exhibits in 3D and Page · media players behave (play, pause on leave, captions/transcripts) · every exhibit labeled sample with an unsynced source pointer.
**G4:** presentation system with the listed components · sticky compact lens bar · bus boycott Page redesigned · default presentation for all rooms.

Plus: Level 1 at 60 fps on the Pixel holds in the History Quarter with the exhibit loaded (keep draw calls low: instance frames, share materials, lazy-load media).

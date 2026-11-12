> **Note (brief v3):** the canvas was drawn before content "intensity" became six dimensions. Where the boards show a single intensity number or slider, build the v3 version instead: content chips on info cards, Lens presets (Kids / Teen / Adult / Everything) plus Advanced per-dimension controls, and door previews that name the dimension. The brief wins wherever the two differ.

# Living Atlas: vision board

The canvas is private to Nic, so build from the description below. It's a direction, not a pixel spec. Your own take on layout is welcome as long as the structure and every control in the brief are there.

## Visual direction

- Night campus. Ground #0E1320, panels #151C2C, borders #263147 / #2E3B57, text #EEF1F6, secondary text #AEB8C8 / #9AA6BA.
- District colors: Commons green #7BD389, Makers Row amber #F2A541, History Quarter blue #7AA7FF, After Dark pink #E58BE8. Teal #4FD1C5 for the primary action and seamless edges.
- Edge colors match their type: seamless teal (soft wide band), door amber (glowing arch), embedded blue (nested ring), window pink (dashed line with a pane).
- Type: Space Grotesk for headings, Inter for UI and body. On-device fallback fonts are fine.
- Low-poly stylized rooms, warm glowing objects, agents drawn as an outlined diamond with a dot.
- Touch targets at least 44px. Text contrast at least 4.5:1. Don't rely on color alone: edge types also differ in shape and line style.

## Boards on the canvas

1. **Vision:** title, one-line pitch, four principles (everything has an author; substance vs. style; you choose your lens; nothing is deleted), isometric campus illustration with all four edge types and an agent marker.
2. **Building blocks:** rooms, edges, forks, districts, each with a small diagram.
3. **The crossing check:** one seamless edge from the Commons to an archive room, reached by a verified adult (stays seamless), an unverified visitor (becomes a door with a reason), and a child (never renders; path continues to a garden). Footer: declared vs. measured, edges need consent, vote-off cuts edges.
4. **Walking the campus (phone):** first-person studio view, breadcrumb pill top left with district dot, Atlas button top right, "Door ahead" chip, info card for the selected object (title, district, fork count, verified badge, author, permission chips, available forms), Build button bottom left, joystick bottom center, Lens button bottom right (teal, primary).
5. **Lens panel (phone):** bottom sheet. "View as" 5-way segmented control at the top with a live summary line of what changed. Then content presets, Depth, Show me chips (Agents shows "dimmed", never off), Form 4-way icon buttons.
6. **Atlas map (phone):** node graph, nodes colored by district, edges by type, current room ringed, "Show what others see" switch that reveals hidden edges in gray dotted lines with a reason, and a legend.
7. **Build mode (phone):** Style / Substance / Connect tabs. Substance shows the permission banner, a fork switcher (Original, Latest by Nic, Dana's fork, Your fork) and a diff with strike-through plus a highlighted insertion. Connect shows four edge types with their consent rules and a request status. Footer: history count and "chain verified."
8. **Contest flow (phone):** 3 steps with a progress bar. Step 1: the flag and who raised it. Step 2: the mediator (agent badge, operator named) proposes three options as selectable cards. Step 3: vote result, outcome, and the precedent it sets.

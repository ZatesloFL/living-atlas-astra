# 17 — A Place you enter: the boycott interior

Filed by Silver, 2026-11-23. Direction by Nic, from live testing the same
day. G4 and file 16 are complete; this is the current work order.

## The finding that prompted this

Testing the G4 build, Nic opened the boycott in 3D and got the article as
a side panel over the scene. The five exhibits stand as an open-air
arrangement in the History Quarter with an Inside arrival point, but
there is no threshold — no door, no interior, no moment of entering.
The Place reads as an article with decorations around it.

Nic's ruling: a Place is somewhere you walk into, like a museum. The 3D
walk-in is the primary form of a Place; the Page is the reading form for
people who want it. That is already the Atlas model (a Place is a
crossing, file 12) and the site's default (the root URL loads 3D; Page
is opt-in). The build just never gave the boycott an inside. Fix that.

## What to build

1. **An interior for the boycott.** An enclosed hall that holds the five
   existing exhibits — film, gallery, listening bench, newspaper, bus
   seat map — reusing the G3 exhibit kit and its placement system as-is.
   No content rebuild: same blocks, same readers, same behaviors, same
   sample labels and unsynced pointers.
2. **A door crossing.** The Quarter keeps the boycott's frontage and
   signage so the Place stays discoverable on the walk. Its primary
   action becomes **Enter**: a door crossing into the hall, using the
   existing crossing machinery — pre-flight, receipts, Lens and grant
   checks exactly as they work today. The article panel remains
   available as the Place's info surface; it stops being the main event.
3. **Arrivals.** Fast travel's **Inside** arrival lands inside the hall
   (the aisle position, translated). **Door** arrival lands at the
   entrance in the Quarter. Travel gates and receipts are unchanged.
4. **Presence follows the hall.** Pause-on-leave, media distance, and the
   other presence-based behaviors key off being inside the hall. The
   boycott's Place context — Staff, the Docent's standing grant
   (file 16), the proxy's live eligibility — is untouched: the hall is
   the boycott Place, spatially.
5. **Reusable, not one-off.** Build the interior as a kit — room shell,
   door, exhibit placement — the way the exhibit kit was built, so the
   next Place (Studio, Capitol) can gain an interior the same way. Log
   the pattern and any judgment calls in `lane/decisions.md`.

## What does not change

- Page form: the article stays the reading form, byte for byte in
  behavior. "Read in Page form" is still offered. Root default stays 3D.
- Content: no block, claim, label, or audience version changes.
- Grants, proxy, routes, prices, caps: untouched.

## Acceptance checks

- From the Quarter, Enter crosses through the door into the hall and
  writes its crossing receipt; the Inside fast-travel arrival lands in
  the hall; Door arrival lands at the entrance.
- All five exhibits work inside the hall with their G3 behaviors,
  including pause-on-leave measured against the hall.
- The Docent answers live at the boycott as before; Staff shows the
  standing grant; file 16 behavior is unregressed.
- Audience behavior unchanged: Child sees the three suitable exhibits,
  Teen all five, in the hall as in the Quarter before.
- Performance reported for both spaces: draw calls in the Quarter with
  the hall present, and inside the hall with all exhibits loaded —
  against the existing 16–22 discipline. If the technique (zoning,
  occlusion, separate scene) is a judgment call, log it.
- Nic's phone checks, listed in the report as usual: the door moment,
  hall legibility and feel, arrival, and frame rate inside the hall.

## Sequencing

This is the current round. Grok's standing regression suite runs against
the live site after the push; expect its fresh-profile pass and a cold
walk ("go into the boycott museum") in the findings.

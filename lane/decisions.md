# Decisions

One line per call the brief did not settle, with the reason.


- 2026-11-12 — Tier 1 only this session; tier 2 waits for Nic’s Pixel confirmation, as required by v3.
- 2026-11-12 — The prototype starts with an Adult content lens and an unverified “Me”; this is a clearly labeled demo seed, not a decision on the unresolved product default.
- 2026-11-12 — “Verified adult,” “Unverified visitor,” and “Child” select Adult, Teen, and Kids presets respectively; content can then be customized independently while age and identity checks remain enforced.
- 2026-11-12 — A soft limit exceeded by more than one step still produces an informed-entry door when no hard limit applies; v3 specifies one step but leaves this larger-gap case undefined.
- 2026-11-12 — Windows remain view-only even above a soft limit; converting a window into an enterable door would grant an unapproved capability.
- 2026-11-12 — A hard-limit lock retains its own value as soft sliders move; its numeric value stays visible, and re-locking captures the current soft value.
- 2026-11-12 — Agent display filtering only dims Silver; hiding verified human authors cannot remove the agent hosted beside their workbench.
- 2026-11-12 — Two small scene roots are linked by a portal; graph records and lens results control thresholds, visible stops, collision gates, and the Atlas, while deterministic anchors compose each scene.
- 2026-11-12 — One static shadow-casting sun, batched instanced geometry, quarter-resolution HDR bloom, and a DPR ceiling of 1.65 (always below 2) limit rendering cost; sustained low frame rates reduce DPR to a minimum of 0.85.
- 2026-11-12 — No camera bob or roll; reduced-motion disables decorative motion and scene fades. Joystick acceleration and look easing use elapsed time.
- 2026-11-12 — No storage, downloaded assets, external fonts, analytics, backend, or runtime CDN. Three.js r181 is vendored with its license; all geometry and textures are made in code.
- 2026-11-12 — The studio lab is viewed through the seeded window edge; the listening booth demonstrates embedding. These supply all four edge types without adding content-heavy rooms.
- 2026-11-12 — The Build button explains its tier-2 availability; editing, ledger, narration, intro cards, and the time slider are deliberately deferred.
- 2026-11-12 — Seamless thresholds blend vertex colors on the ground; moving from the studio to the Commons also eases the sun’s color. Doors require explicit entry, windows never admit movement, and the embedded booth changes the breadcrumb on crossing.
- 2026-11-12 — Accepting a soft-limit door grants entry for the current scene/lens only. A lens change clears those grants and relocates a visitor to the entrance if their current position becomes inaccessible.
- 2026-11-12 — Local automated Chromium is available for functional validation, although it uses software rendering here; its fps is not evidence of Pixel performance or approval of visual quality.

- 2026-11-12 / round 2a A1 — Room names use crisp projected nameplates at a fixed readable CSS size, outside the low-resolution bloom buffer; they face the camera, avoid each other and controls, and remain readable across foreground foliage. Only labels belonging to the visible world are projected.
- 2026-11-12 / round 2a A1 — The bus sign anchor moves toward the walking path; the nameplate layer also prevents the tree trunk from occluding its text.
- 2026-11-12 / round 2a A1 — Eye height is 1.88m, default pitch tilts upward slightly, portrait FOV widens to 67°, and the entrance moves 2.2m forward to reduce empty foreground without camera bob.
- 2026-11-12 / round 2a A1 — Atlas labels have explicit boxes placed outside every marker's 22-unit clearance and outside other labels; small dark backplates separate text from crossing lines.
- 2026-11-12 / round 2a A2 — Display (Anonymous / Pseudonym / Real name) and backing (verified / none) are independent fields. Room author badges and profile badges use both; agents retain a separate operator badge. Legacy tier fields remain for v3 data compatibility.
- 2026-11-12 / round 2a A3 — The visitor's requested preset is saved separately from the applied ceiling: unverified adults cannot exceed Teen soft limits or Teen hard limits, and stricter personal locks still win. The chip explicitly says “Teen cap” when the requested view is broader.
- 2026-11-12 / round 2a A3 — Under-13 visitors are capped at Kids; under-18 visitors at Teen even with simulated verified backing. This keeps an age claim from expanding content access and leaves minimum-age checks independently enforced.
- 2026-11-12 / round 2a A3 — New personal profiles have backing “none”; entering an age or choosing Real name never verifies the visitor. First-run setup records age, display, preset, depth, and preferred form locally.
- 2026-11-12 / round 2a A4 — The five built-in profiles are explicitly simulated test loadouts, including Me (Real name + verified). Selecting one retains a persistent TEST MODE banner, including after reload; real verification does not exist in this round.
- 2026-11-12 / round 2a A4 — Personal profiles can be copied, renamed, and deleted; built-in profile names cannot be renamed/deleted. Deleting the last personal profile returns to setup. Existing receipts are preserved.
- 2026-11-12 / round 2a A4 — Profile preferences are saved on change. Both access to localStorage and each read/write are caught; blocked writes keep a working in-memory session and display that persistence is unavailable.
- 2026-11-12 / round 2a A4 — Every successful profile switch, including restore-to-personal actions and switching to a newly saved copy, appends a serialized SHA-256 receipt. Reload restores the same profile without fabricating a switch. Tampered stored receipts are preserved and further receipt-writing operations are blocked rather than silently rehashed.
- 2026-11-12 / round 2a A4 — The long-press wheel shows six saved profiles per page; lift the thumb, then tap a profile. Release clicks are suppressed so the hold cannot accidentally activate a newly displayed button.
- 2026-11-12 / round 2a A4 — Depth, Trust, form, style preference, and accepted layer IDs are part of the saved profile. Narration/Text and actual style/layer application remain deferred by v4; their future preferences are labeled as such.
- 2026-11-12 / round 2a A5 — Unsaved developer overrides are session-only and clear on reload or a profile switch. Saving a copy explicitly captures them as a test profile; the TEST MODE banner then persists with that profile. Exit test mode restores the last personal non-test profile.
- 2026-11-12 / round 2a A5 — The developer panel includes both made and credential memberships and owner/visitor mode as simulated settings. Grants, requests, and travel remain Tier B work.
- 2026-11-12 / A0 — Separate a minimal diagnostic bootstrap from the dynamically loaded 3D runtime so a world/UI/module exception can be reported and a reading surface loaded without Three.js.
- 2026-11-12 / A0 — Only an actual exception/null return from canvas.getContext('webgl2') marks context creation as failed. Other failures retain their real name, message, stack and named stage; diagnostics exclude profile contents and query values.
- 2026-11-12 / A0 — Try half-float bloom, unsigned-byte targets with an eighth-size cheaper bloom, direct rendering, then direct rendering without shadows. Validate actual viewport-sized buffers and the first rendered frame; safe mode starts directly at the last configuration with DPR capped at 1.
- 2026-11-12 / A0 — Controls and labels may fail independently while leaving a fixed-camera/selectable scene; core scene/UI/profile failures use Page. The Page fallback is independently implemented and uses the same room/edge access rules; unknown age defaults to Kids.
- 2026-11-12 / A0 — Deliberate stage failures are supported only under ?test for repeatable recovery checks. They do not imply that the Pixel's missing exact error has been identified.

# 20 — The Lens is a vote: sliders lead, ratings cascade, doors are two-sided

Standing design direction. Filed by Silver for Astra, 2026-11-23, from
Nic's thinking on how content control should work. This refines the
content model in files 02, 04 and 12; where this note and the older
text differ, this note wins. It is direction, not a build order — the
next round that touches the Lens, scores, or crossings implements it.

## Sliders lead; age is a preset, not an identity

The six dimensions (violence, sexual content, language, disturbing
themes, viewpoint, sensory), each 0–3 from none → mentioned → shown →
graphic, are the real controls, held per-dimension on the visitor's
Lens with soft limits and hard locks as designed. Kids / Teen / Adult /
Everything are quiet starting presets a person picks once and then
adjusts — the product surface should speak in dimensions and numbers
("Violence ≤1 · Disturbing ≤2"), not lead with an age label. Adults who
want less than everything are exercising the same control as anyone
else; this is preference, not only protection.

## Ratings cascade to whatever depth exists

A Place can contain sub-Places and Things without practical limit, so
scores and Lens checks must resolve at **every level of nesting** —
Place, sub-Place, exhibit, individual block — evaluated against the
space the visitor is actually in or entering. A hot item inside a mild
room is checked as itself at its own door, not averaged into the room
and not hidden by it. (The block-level override in the current build is
the first step of this; generalize it down the tree.)

## Doors are two-sided: the owner's threshold

Crossing has been one-sided until now: the visitor's Lens caps what
they will see. Owners get the other side of the door:

- An owner may set an **entrance threshold**: the minimum Lens openness
  a Place requires. A Place that is explicitly about adult material
  does not have to admit visitors who would only see it blurred out.
- Or the owner may **admit below-threshold visitors to the filtered
  rendering** — the same street in two versions, and the visitor picks
  which one they get. The Vegas strip rule: the Place offers both; the
  Lens chooses.
- Which mode a Place runs is the owner's declared choice, shown at
  pre-flight. Nobody is force-shocked: pre-flight always says what is
  inside and what you will see of it. And a filtered rendering is
  visibly filtered — blurred or withheld, never silently rewritten
  (the standing never-silently-pass rule).

## Per-Place raising at the door

A visitor may raise a dimension **for one Place, for that visit**,
standing at its door, within their hard limits — written like a grant,
with a receipt. The researcher case: someone whose Lens is generally
tight needs one room at full strength for a serious topic; they adjust
at that door instead of loosening their whole Lens everywhere. Hard
locks (a guardian's ceiling on a child's Lens) and the legal floors do
not move at any door.

## No polish caps

District or category caps whose function is to make a subject
comfortable are rejected — Nic's example: the History Quarter's caps
(disturbing ≤2) polish the past, and history is supposed to be able to
disturb. Zoning decides **where** a Place sits, not how toned-down its
content must be. What governs content is: the law (floors no one can
move), the owner's declaration and threshold, measured scores and the
visible gap (file 12), and the visitor's Lens.

## The social contract, in Nic's words as filed

"Creators can do anything legal they want; people get to vote with
their Lens about what they want to support and interact with." The
point is not to make people love everything they see, and not to force
shock on anyone. The Atlas's job is honest declaration and measurement,
faithful rendering of each visitor's choice, and doors that say what's
on the other side. This holds for serious topics, jokes, and art alike.

## Judging, unchanged from file 12

Owners declare scores (AI proposes for generated assets, owner
confirms); Stewards measure and contest; crossings use the higher of
declared and measured. Thresholds are declared and measured the same
way — a Place that claims a threshold it doesn't enforce has a gap,
and gaps show.

## Not adopted

Silver raised splitting each dimension into presence (how much of a
room a theme is) × peak (its most graphic moment). Nic: that is not
the model. It prompted the granularity point above and is set aside —
do not build it.

## Ruling, 2026-11-24: two dials per dimension

Nic ruled: every dimension is scored on **two dials, each 0–3** —
**amount** (how much of it there is: 0 none · 1 a mention or trace ·
2 a real presence — a scene, a section, an element you encounter ·
3 pervasive or central, the place is substantially about it) and
**graphicness** (how explicit it is: 0 none · 1 mild — implied,
innuendo, off-screen · 2 shown plainly, not graphic · 3 graphic or
explicit). This supersedes the single blended 0–3 scalar as the
score shape everywhere: declarations, measurements, info-card
chips, Lens limits (soft and hard, per axis), presets (now paired
starting positions), door thresholds, and crossing checks — a
crossing compares BOTH axes of the exact room/Thing against the
visitor's limits for that dimension, using the higher of declared
and measured, per axis.

This is **not** the presence × peak split set aside below:
graphicness is the explicitness character of the content present,
not a worst-single-moment detector, and amount binds independently.
A work can be (amount 1, graphicness 3) — barely any, but explicit —
or (3, 1) — everywhere, but mild. The bikini bar is high amount,
low graphicness; the strip club runs high on both. Both axes always
bind; neither collapses into the other.

Existing authored content (the demo world) is re-declared under the
pair by the lanes as they touch it — the corpus is small and
authored in-house. The old ladder's rungs are guidance, not a
mechanical conversion: mentioned ≈ amount 1 at low graphicness;
shown-not-graphic ≈ graphicness 2; graphic ≈ graphicness 3.

# Battalion ground collision

The shared terrain flow field still plans travel. A separate fixed-step, local
circle solver keeps battalions from occupying the same ground position. The
three rendered soldiers are one battalion footprint, not three physics bodies.

- Footprint radii range from 0.46 (infantry) to 0.62 (artillery) world units.
  Cavalry and artillery models use matching horizontal scale.
- Friends, enemies and awake neutral garrisons participate; pooled garrisons
  (below) do not. Embarked ships do not collide with land troops. Combat damage
  remains simultaneous.
- A 1.24-unit uniform grid queries nearby bodies. Four deterministic passes
  rebuild the grid; stable numeric IDs resolve exact coincident centers.
- Correction is limited to 0.6 world units per tick. Each body visits at most
  96 candidates per pass. Overloaded buckets rotate the deterministic scan;
  there is no global unit cap and no all-pairs fallback.
- Each body attempts at most 12 terrain-constrained corrections per tick. A
  wall-pinned crowd cannot repeatedly spend the whole tick on rejected pushes.
- Physical coastlines, lakes and map edges constrain correction, not political
  borders. A dedicated boundary index checks short land segments and circle
  clearance. Existing narrow passages or old saves may have clipped footprints;
  separation never worsens that clearance or pushes a center across water.
- Resting troops stay in their assigned administrative atom. Transit can cross
  administrative borders and updates its actual atom. Destination capacity does not
  restrict travel or arrival; reservations only count toward local training.
- Troops settle within 2.3 units of the final center, inside the actual target
  atom. Production searches a small deterministic formation for open space.
  Neither arrival nor reinforcement deliberately targets one occupied point.
  A town's own houses cover its center, so on the final leg the house detour also
  accepts any ring node inside the target region within 2.3 units: a battalion
  stopped by a house just outside the region walks around into it instead of
  standing still.
- Corridor steering never steps where the 5-unit lookahead is house-blocked; the
  house detour plans that step too (keeping the steering step only if it cannot
  move), so the two rules no longer undo each other every tick near a town.
- Two marching bodies that each moved straight into their contact this tick
  (within 60 degrees) also slide half the overlap to their own right. Equal
  pushes alone returned such a pair to the same spots forever; both now pass.
- Original travel routes remain immutable. Pushed land positions must stay
  within 2.5 units of the current segment and have a certified short connector
  back to it. Movement follows a local lookahead with a safe connector fallback.
  Every original route segment is still checked when loading a save. Sea travel
  keeps the original strict on-segment validation.

## Garrison pool

A country's battalion rests in its town's pool (`Engine.pooled`) when it is idle
(no order, route, transport, army or attack cooldown) in a region its country
owns, no battalion of another owner (neutral included, ships too) is within 12
units, it overlaps no battalion, and it stands clear of houses. Pooled troops keep
their place, count for their town, its capture and training, Massed Ranks and
saves as usual, but skip combat, collision and house checks, and no longer drift
toward the town centre. Awake troops are not blocked by them.

- 12 units exceeds any range (artillery 7.2, ×1.1 with Rangefinding) plus splash
  (at most 2.75) and a tick's step, so pooled troops wake before anyone can shoot
  them or they could shoot.
- An overlap wakes both troops (a reinforcement stacked on a garrison, troops
  walking into it); they stay awake until the solver has separated them.
- Fresh candidates (not pooled last tick) are cleared of houses first, as a
  loaded save is; one that cannot be cleared stays awake.
- The rule reads only the current state. Skipping the house test for troops
  pooled last tick gives the same answer (houses and pooled troops never move),
  so a reloaded engine, the parallel workers and the sequential step all pool the
  same troops. Preplaced neutral guards keep their own rule: they sleep unless a
  country's troops are within one 16-unit cell.

On the 100-AI fully occupied fixture about 60% of the countries' troops are
pooled; the simulation step is about 30% shorter (collision and combat fall
most). Regression coverage: `tests/garrison-pool.test.mjs`.

This is bounded soft collision, not a global rigid-body packing guarantee.
Temporary overlap can remain in an extreme crowd, an undersized island or a
physically blocked corridor. Terrain safety wins over forcing separation. A
new contact created by a correction may be resolved in the next pass/tick.
`Engine.collision` exposes candidate/contact counts, greatest encountered
penetration, terrain-constraint attempts and saturated budget counts for profiling; these are runtime-only.

Local v5 saves retain their schema and namespace. The spatial index, cached
clearance and diagnostics are not serialized. The LAN rules identifier changes
to `admin1-groups-terrain-collision-v3`, so clients with different movement rules
cannot join one another silently.

Regression coverage is in `tests/collision.test.mjs` and
`tests/collision-integration.test.mjs`, alongside routing/capacity, transport,
save, replication and real LAN tests. Publication follows the repository's
main deployment followed by same-commit test/HTTPS verification workflow.

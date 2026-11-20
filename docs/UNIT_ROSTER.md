# Eight-unit roster

New campaigns still select exactly one kind. Every kind can fight, capture, train,
upgrade and use the existing certified sea routes. No extra resources or locked
unit combinations are required.

| Kind | Role | HP | Attack | Defense | Attacks/s | Splash radius | Range | Train seconds | Land speed | Sea speed |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| skirmisher | Fragile, mobile ranged infantry | 75 | 12 | 0 | 1 | 0 | 4.6 | 18 | 3 | 3 |
| grenadier | Durable close-range splash infantry | 130 | 18 | 20 | 0.8 | 0.7 | 2.3 | 24 | 2.2 | 3 |
| heavyCavalry | Durable slow-recruiting melee cavalry | 155 | 30 | 25 | 0.65 | 0 | 1.6 | 32 | 3.4 | 3 |
| horseArtillery | Mobile, shorter-range light artillery | 70 | 28 | 0 | 0.55 | 0.8 | 5.8 | 30 | 2.8 | 3 |

These are initial balance values, not a claim of equal win rates. The live
numbers are in `src/game/balance.ts` (`BALANCE.units`). Distance uses
map coordinates; time uses simulation seconds. Existing four-kind values remain
unchanged. Splash uses the existing 35% secondary damage, at most two secondary
enemies, no friendly fire. Only engineers receive the innate 1.5 capture rate.

## Families and talents
UNIT_FAMILY still groups kinds for display, but talents are offered per exact
kind: every kind has two signature talents (engineers three), so the eight
starting units draw eight different pools. The former family talents keep their
IDs with conditional effects (for example Charge: light cavalry +35% damage while
under orders; Siege guns: field artillery +40% against garrisoned troops). Upgrades
remain per-kind. There is no charge animation, auto-kiting, deployment requirement
or minimum firing range. See [Talents and builds](TALENT_BUILDS.md).

## Compatibility
- Local v5 saves containing only the original roster can import with missing new
  upgrade entries initialized to zero, after checksum verification. Existing
  values are never overwritten. An active new-kind save missing upgrades is invalid.
- Network state remains strictly validated; RULES_ID changed so old clients
  cannot join new-rule rooms.
- AI opponents are seeded from all eight choices, with distinct choices for the
  two solo opponents.
- Fractional attack cooldown retains sub-tick remainder during continuous fire.
  This prevents heavy cavalry/horse artillery rates drifting with 0.05-second ticks.

## Verification
Automated coverage includes all nine values, individual campaign production and
upgrades, family bonuses, bounded splash, 60-second attack frequency, old-save
migration, replication, AI upgrading, individual capture, certified cross-channel
transport/landing/capture, and four-seat LAN commands. Browser coverage additionally
checks eight-card exclusive selection, language/reopening and a new-kind upgrade.
Balance still needs representative same-count, same-production-time and full
campaign playtests with varied starting locations.

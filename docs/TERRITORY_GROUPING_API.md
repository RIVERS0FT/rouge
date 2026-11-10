# Shared merge/split kernel

Current integration and examples: [GAMEPLAY_REGIONS.md](GAMEPLAY_REGIONS.md).

`createTerritoryGrouping(topology, parts, {locked:true})` uses the same deterministic group/partition representation as in-game merges, but records immutable member sets in `lockedParts`. Every group carries a derived `locked` flag. Additional merges preserve those floors; split rejects a selection that contains only part of a locked member set. Ownership reconciliation may separate editable groups but cannot split locked members with conflicting owner accounts.

Runtime topology atoms are the materialized **base gameplay regions**, not the original Natural Earth source features. `sourceMap.ts`, `PREPROCESSED_GROUPING` and each map region's `sourceAtoms` retain the original topology and lineage for future intentional unlock/migration. There is no command that addresses an original administrative member independently in the current ruleset.

Group IDs are `group:<smallest member ID>`, stable across clients. Members cover the topology exactly once, groups are land-connected, and neighbors are symmetric original shared-border links. There are no center-distance, corner-only or sea-bridge adjacency guesses.

`applyTerritoryGrouping` accepts an authenticated actor and authoritative resource ledger. Commands carry exact map ID and expected revision. It rejects malformed input, stale revisions, unowned/unplayable members, disconnected merges and partial lock splits before changing anything. Resource ledgers retain per-base-region queues, troops, production and capacity. Successful commands change only the grouping/revision; they neither redistribute progress nor mint resources.

Current base regions each have capacity 12 and production rate 1. Gameplay state, selection, capture and territory counts use these regions. Group display totals sum immutable base-region accounts. Source atom counts do not multiply resources.

Saves and LAN carry versioned grouping/lock metadata and validate complete membership with homogeneous owners. A changed map identity rejects incompatible old records; old save namespaces remain intact. Future unlock needs an explicit migration policy, not merely flipping an untrusted saved flag.

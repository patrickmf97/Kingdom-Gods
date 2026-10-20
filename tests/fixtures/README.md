`v6-earned-campaign.json` was produced with the source at commit `7c47df1`,
using its original v6 simulation, wildlife actions, and save validator. The
campaign has 55 reserves and 22 animals; observing and feeding animals consumed
real food, created memories, and ran 48 wildlife steps per encounter. It also
contains family, education, depleted resources, and earned inventory. The
original v6 validator accepted the complete snapshot before it was saved here.

`v7-baseline-campaign.json` records the complete initial v7 save contract with
required NPC regions and 67 authored reserves. Persistence tests load both files
as independent fixtures and verify migration and paused-time round trips.


`v7-earned-public-campaign.json` is an immutable byte-for-byte copy of
`/workspace/scratch/kg-alpha11-public-before.json`, captured from the published
alpha 0.11 campaign before this upgrade. It is deliberately independent of the
latest simulation initializer and historical projection helpers. Its original
six NPCs, 67 reserves, 22 animals, 48 gold, fractional saved time, and every other
old field must survive v7 → v8 without load-time simulation. SHA-256:
`df97ccf25b31fe30913b167fbf0ca213c48c7a967fe08e7adee1f8188a02a734`.
The v8 persistence test verifies this digest; do not regenerate this fixture when
changing current state, population definitions, roads, or habitats.

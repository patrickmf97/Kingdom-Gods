`v6-earned-campaign.json` was produced with the source at commit `7c47df1`,
using its original v6 simulation, wildlife actions, and save validator. The
campaign has 55 reserves and 22 animals; observing and feeding animals consumed
real food, created memories, and ran 48 wildlife steps per encounter. It also
contains family, education, depleted resources, and earned inventory. The
original v6 validator accepted the complete snapshot before it was saved here.

`v7-baseline-campaign.json` records the complete initial v7 save contract with
required NPC regions and 67 authored reserves. Persistence tests load both files
as independent fixtures and verify migration and paused-time round trips.

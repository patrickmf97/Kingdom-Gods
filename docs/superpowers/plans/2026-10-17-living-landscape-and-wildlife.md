# Living Landscape and Wildlife Implementation Plan

**Goal:** A richer landscape with persistent domestic animals and wildlife reacting to the world.

**Architecture:** Instanced vegetation is presentation; wildlife lives in authoritative local state and shared navigation. Renderer layers read that state. Strict v6 migration adds only wildlife to valid older campaigns.

**Spec:** `docs/superpowers/specs/2026-10-17-living-landscape-and-wildlife.md`

- [x] Implement authored habitats, animal behaviors, food consumption, observation and GameStore integration.
- [x] Add strict v6 persistence and historical compatibility tests.
- [x] Build varied animated 3D animal models and render them in 2D fallback.
- [x] Enrich trees and ground vegetation with bounded instancing/wind and collision/access tests.
- [x] Integrate picking, nearby prompts, release copy and renderer lifecycle.
- [x] Run full tests/build and desktop/mobile journeys; verify feeding and save/reload.
- [ ] Publish the tested source/build and verify the retained public campaign.

Review focus: animal movement through walls/water; path or work-point obstruction; repeat feeding and remote rewards; corrupted saves being silently repaired; resources retained across renderer/import switches; vegetation/animal draw budgets on mobile.

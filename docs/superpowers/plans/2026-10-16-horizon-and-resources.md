# Horizon and Resources Implementation Plan

> **For agentic workers:** Use subagent-driven-development for independent modules and verification-before-completion before publishing.

**Goal:** Correct house surfaces, finish the outdoor horizon and distribute persistent harvestable resources.

**Architecture:** Three.js owns presentation. The existing local simulation owns harvesting; authored region definitions supply navigation and interaction. Save v5 expands only the resource catalog after strict historical validation.

**Tech Stack:** TypeScript, React, Three.js, Phaser fallback, IndexedDB, Vite, native Sites hosting.

**Spec:** `docs/superpowers/specs/2026-10-16-horizon-and-resources.md`

## Global Constraints

- Preserve the existing public origin and campaigns.
- Keep all ten original resource definitions unchanged; add 45 nodes for 55 total.
- No new backend, multiplayer, global levels or paid assets.
- Keep procedural forest coordinates stable outside authored new clearings.

## Review Focus

- Old depleted reserves and partial work survive migration and reload.
- Invalid current saves reject instead of being silently repaired.
- All new nodes have collision-safe paths and independent stocks.
- Horizon geometry does not intercept clicks or create walkable land.
- Mobile camera rotation, zoom and renderer changes release resources correctly.

### Task 1: Surfaces and horizon

- [x] Reproduce the side-wall coplanarity in geometry tests.
- [x] Offset exposed timber faces, add a lightweight outdoor skyline and sky, and verify disposal and noninteractive geometry.
- [x] Inspect mobile screenshots near houses and region edges.

### Task 2: Resource distribution

- [x] Preserve `LEGACY_RESOURCE_NODES`; author the additional nodes in `regions.ts`.
- [x] Filter nearby decor after original forest generation; append village solids without changing landmark indices.
- [x] Verify counts, unchanged legacy data, clear approaches, paths, harvest depletion and regeneration.

### Task 3: Save compatibility

- [x] Write old/current schema corruption and migration tests.
- [x] Implement strict historical validation and v5 catalog expansion in `persistence.ts`; update initial state version.
- [x] Verify original extension fields, tools, work, depleted reserves and regeneration dates remain unchanged.

### Task 4: Interface and publication

- [x] Add working resource filters and clear reserve status to the map; update release copy.
- [x] Run the full test suite and production build, then browser collection/save/mobile checks.
- [ ] Push the tested source, save and publish its archive, then verify the existing public campaign survives.

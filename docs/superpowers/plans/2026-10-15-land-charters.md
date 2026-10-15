# Land Charters Implementation Plan

> **For agentic workers:** Execute the bounded tasks with parallel agents and integration review. Steps use checkbox syntax for tracking.

**Goal:** Add persistent finite estates, useful buildings and Auren recognition to the existing playable local game.

**Architecture:** Pure territory rules and static parcel definitions feed the local GameStore authority. Navigation and Phaser rendering share those definitions; React sends validated actions. Persistence v4 validates current data and migrates older campaigns.

**Tech Stack:** Existing TypeScript, React, Phaser, IndexedDB and Vite; no new dependency or paid service.

**Spec:** `docs/superpowers/specs/2026-10-15-land-charters.md`

## Global Constraints

- Preserve existing campaigns, orphan origin and mandatory family succession.
- Keep multiplayer last; use the current public Sites project and no login requirement.
- Every displayed action must have real validation and persistent consequences.
- Monetary transfers conserve currency; no infinite claims, duplicate deeds or inaccessible stored goods.
- Match the exact parcel bases across movement, map previews and visuals.

## Review Focus

- Old campaigns with active mining work and earned services migrate without loss or time advancement.
- Repeated actions, tax processing and imports do not duplicate currency, influence or materials.
- Buildings added after path-cache creation block walking and dodging while leaving doors reachable.
- Debt, ruined buildings and full inventory cannot delete or permanently trap deposited goods.
- Minor successors inherit estates but cannot bypass the adult registration rule.

### Task 1: Rules and integration

**Files:** `src/types.ts`, `src/territory-data.ts`, `src/territory.ts`, `src/simulation.ts`, `tests/territory.test.ts`, `tests/territory-integration.test.ts`.

**Interfaces:** `createTerritoryState(day)`, `executeTerritoryAction(state,action,hooks)`, `syncTerritoryDeeds(state,hooks?)`, `processTerritoryDay(state,hooks)`, `estateBuildings(state)`; typed `ExpansionHooks.rest(hours,healing)` advances the real calendar.

- [x] Test acquisition limits, safe transfers, storage conservation, repairs, debt and deed idempotency.
- [x] Implement finite rules and connect physical interactions, daily simulation, rest and succession.
- [x] Run the rules and GameStore integration tests.

### Task 2: World and interface

**Files:** `src/regions.ts`, `src/navigation.ts`, `src/world.ts`, `src/region-art.ts`, `src/Panels.tsx`, `src/TerritoryPanels.tsx`, `tests/territory-navigation.test.ts`.

**Interfaces:** Two static `ESTATE_DEFS`, `estateObject(id)`, `estateSolid(id)` and navigation context `estates?:EstateId[]`; React uses validated territory actions.

- [x] Reserve the two clearings after deterministic forest generation.
- [x] Add physical signs, plot boundaries and distinct buildings with shared base geometry.
- [x] Test cached routes, walk/dodge collision, clear approaches and existing bridge routes.
- [x] Add mobile-readable property, storage and Auren controls with visible requirements.

### Task 3: Persistence

**Files:** `src/persistence.ts`, `tests/persistence-v4.test.ts`, existing persistence tests.

- [x] Test strict v4 invariants and independent migration of v1/v2/v3 campaigns.
- [x] Preserve active work, resources, relatives and timestamps; backfill existing earned deeds.
- [x] Verify roundtrip, invalid import rejection and backup behavior.

### Task 4: Review and release

**Files:** `src/App.tsx`, `package.json`, `README.md`, `docs/verification-alpha05.md`.

- [x] Run all tests and production build; resolve independent review findings.
- [x] Verify actual browser purchase/build/deposit/withdraw/rest/save/reload and mobile controls.
- [ ] Push exact tested source, save a Sites version and publish it publicly.
- [ ] Verify anonymous production access and the retained older campaign; report limits and URL.

Publicação e verificação online são as últimas etapas; os retornos das ferramentas da sessão registram sua conclusão após este plano ser enviado com a versão.

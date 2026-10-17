# World Polish and Market Implementation Plan

**Goal:** Improve the lived-in 3D presentation and make market supply, demand and production more consequential.

**Architecture:** Region-owned procedural materials and props; renderer-owned bounded effects; pure state-based quote calculations and existing economic ledger/accounts. Save schema remains v5.

**Spec:** `docs/superpowers/specs/2026-10-17-world-polish-and-market.md`

- [x] Add deterministic surface textures, valid UVs, reusable scenery details and ownership/disposal tests.
- [x] Add bounded effects driven by observed movement/work/combat, with pause/reset/disposal checks.
- [x] Add continuous quotes, funded daily production, successful-trade records and economic invariant tests.
- [x] Expose quote factors and transaction history in the market; update release copy.
- [x] Run full tests/build and browser journeys on desktop and mobile layouts.
- [ ] Push the verified source, publish its build, and verify the retained public campaign.

Review priorities: texture seams and z-fighting; props blocking existing approaches; particle emission after cancellation/pause; price arbitrage and money conservation; unchanged saved holdings/time on load.

# DatChat V2 Masterplan (Element-Mirroring Rework)

Date: 2026-02-11

## Goal

Build a mature V2 that mirrors Element's structure and product depth as closely as practical, while shipping a stable path from current DatChat.

Related planning docs:
- `CORE_SCOPE_V1.md`
- `BACKEND_TRANSITION_STRATEGY.md`

## Decision: Fork Path vs Reinvent Path

### Option 1 (Recommended for your stated goal): True Element fork path
- Fork `element-web`.
- Keep its architecture and UI flow as primary baseline.
- Replace/bridge backend pieces in phases.

### Option 2: Continue evolving current codebase
- Lower immediate disruption.
- Harder to ever reach Element parity in structure/behavior.

If the target is "almost perfect Element parity", choose Option 1.

## Critical Constraint (Must Acknowledge Early)

Element Web is built around Matrix protocol and Matrix SDK assumptions.

A true Element fork means one of:
1. Adopt Matrix backend stack (Synapse/Dendrite + Matrix APIs), or
2. Build a deep compatibility layer that emulates Matrix behavior over your backend.

Path 2 is usually more work than adopting Matrix.

## Licensing Groundwork

`tmp/element-web` contains `LICENSE-AGPL-3.0` and `LICENSE-COMMERCIAL`.

If you fork/use AGPL code and deploy it:
- keep AGPL obligations in mind,
- publish corresponding source of the deployed version.

## Immediate Stability Gate (Before V2 Work)

Current V1 must not rely on manual refresh to sync:
- Added migration `supabase/migrations/005_phase1_realtime_hardening.sql`
  to enforce realtime publication coverage for core tables.

Deploy this migration to your production Supabase first.

## V2 Program Structure

## Phase 0: Branching + Repo Layout (1-2 days)

1. Freeze V1:
- `main` = V1 stabilization and bugfixes only.

2. Start V2 workspace:
- create `v2-element` branch.
- add `packages/element-v2-web` (fork import workspace) or separate repo.

3. Preserve product continuity:
- keep V1 running for friend testing while V2 is under heavy rewrite.

## Phase 1: Baseline Fork Bring-up (3-7 days)

1. Fork and boot Element:
- clone/fork element-web.
- verify local build and dev server.

2. Keep stock behavior first:
- no backend swaps yet.
- validate room list, timeline, composer, right panel, threads scaffolding.

3. Define integration seam:
- decide where DatChat auth/profile/room data can first enter without breaking core runtime.

## Phase 2: Backend Strategy Lock (High-impact decision)

Choose one and lock it early:

1. Matrix-native backend (recommended for true parity):
- Synapse or Dendrite.
- Keep Element runtime mostly untouched.

2. Supabase compatibility layer:
- implement Matrix-like APIs/events that Element expects.
- significantly higher complexity and risk.

Do not continue V2 implementation before this decision.

## Phase 3: Core Feature Parity Order (Element-first)

Implement in this sequence:

1. Timeline integrity:
- event ordering,
- pagination,
- jump-to-event/date,
- edit/delete consistency.

2. Search stack:
- tokenized filters,
- result view + navigation,
- search history behavior.

3. Right panel system:
- pinned messages,
- member list,
- timeline/search context cards.

4. Threads:
- thread panel,
- unread thread state,
- thread notifications.

5. Calls:
- room call entry UX,
- mute/deafen/device controls,
- reconnect/error states.

6. Composer maturity:
- reply/edit states,
- attachments,
- emoji/mentions/autocomplete.

7. Moderation/admin primitives:
- bans/kicks/permissions,
- room settings parity where relevant.

## Phase 4: Data Migration + Coexistence

If moving to Matrix backend:
- create migration/export jobs from current Supabase schema.
- map users/rooms/messages into target model.
- run dry-run migrations repeatedly before cutover.

If keeping Supabase with compatibility:
- introduce versioned API contracts,
- keep replay-safe event stream,
- add reconciliation jobs for drift.

## Phase 5: Performance + Scale (Only after parity baseline)

1. Sliding sync / incremental sync strategy.
2. Bundle splitting and route-level lazy loading.
3. Media and timeline caching strategy.
4. Realtime reliability monitors and reconnect policies.

## V2 Delivery Milestones

1. Milestone A: Fork compiles and runs unchanged.
2. Milestone B: Auth + room list + timeline working on chosen backend strategy.
3. Milestone C: Threads + search + right panel parity.
4. Milestone D: Call UX parity and reliability.
5. Milestone E: Beta cohort migration from V1.

## Non-Negotiable Engineering Rules

1. No partial backend strategy.
2. No mixed UI architecture between V1 and V2 in same runtime.
3. Each milestone must have rollback path.
4. Keep V1 stable until V2 Milestone C at minimum.

## Next Concrete Actions

1. Run migration `005_phase1_realtime_hardening.sql` in production.
2. Create `v2-element` branch and scaffold workspace for fork import.
3. Decide backend strategy (Matrix-native vs compatibility layer) before coding V2 internals.
4. Start Phase 1 bring-up and record blockers in a migration log.

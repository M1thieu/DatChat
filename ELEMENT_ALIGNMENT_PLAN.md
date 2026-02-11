# DatChat x Element Alignment Plan

Date: 2026-02-11

## Direction

DatChat should align with Element's architecture and interaction patterns, while keeping the Supabase + LiveKit backend.

Do not hard-fork Element:
- Element is Matrix-native end-to-end.
- DatChat currently uses a different data model and transport.
- A full fork would slow shipping and increase maintenance cost.

Use selective convergence:
- mirror structure, UX flows, and component contracts,
- keep DatChat backend and product scope.

## What Is Already Aligned

- Room header logic extracted into dedicated component:
  - `packages/client/src/components/chat/RoomHeader.tsx`
- `ChatArea` is now orchestration-focused (closer to Element `RoomView` composition):
  - `packages/client/src/components/layout/ChatArea.tsx`
- Search filters + quick tokens + history + date filtering are integrated in header flow.
- Voice controls are available in header and bottom panel, with clearer call state.

## Phase 1 (Ship-Ready Core, next 1-2 days)

1. Right panel architecture
- Add a real right-panel phase system (Members / Pinned / Search Results).
- Keep Members as default for groups.
- Open pinned messages in right panel, not inside timeline only.

2. Search UX parity pass
- Add active-filter chips in search input area.
- Add one-click clear-all control.
- Keep token syntax (`from:`, `has:`, `mentions:`, `before:`, `after:`, `on:`).
- Add keyboard-first behavior (`Enter` apply, `Esc` close, arrow navigation in history/results).

3. Message identity policy finalization
- Current migration preserves message-time snapshots (good for audit/history).
- Decide product policy:
  - Option A: immutable historical labels (current default).
  - Option B: always current display names.
  - Option C: hybrid (current display, hover shows historical name).
- Document and apply one policy globally.

4. Pinned messages product polish
- Keep header pin icon as primary entry point.
- Add jump-to-message from pinned card.
- Add unpin action directly in pinned list with confirmation for bulk actions.

## Phase 2 (Element-style Maturity, next 1-2 weeks)

1. Threads foundation
- Create thread model and side-thread panel architecture.
- Keep timeline rendering contract compatible with thread context.

2. Room composer parity
- Add richer composer states (reply/edit/attachments/emoji/mentions) with stricter keyboard behavior.
- Keep slash commands optional for now.

3. Call UX parity
- Add call diagnostics state (connecting, reconnecting, media-device issues).
- Add explicit device selectors and persistent user preferences.
- Add call banner in room timeline when call is active.

4. Timeline robustness
- Add stable timeline windowing strategy with predictable jump behavior.
- Separate timeline data state from presentational grouping logic.

## Phase 3 (Scalability without Premature Complexity)

1. Safe early optimizations
- Code-split heavy chat routes and emoji/search panels.
- Introduce manual chunking to reduce initial bundle.
- Add lightweight cache boundaries for room/message reads.

2. Realtime scaling hygiene
- Debounce non-critical subscriptions.
- Avoid broad room refreshes when only one room changed.
- Add structured logging around subscription reconnect paths.

3. Data path hardening
- Add idempotent migration checks for all new tables/features.
- Add smoke tests for critical RPC + RLS paths.

## Desktop + Distribution Path

1. First public release path
- Publish web app first (no install required).
- Friend can use it from browser immediately.

2. Windows app choice
- Start with Tauri if binary size and memory are priorities.
- Use Electron only if Node/Electron ecosystem APIs are needed early.

3. Release flow
- GitHub repo cleanup.
- CI for lint/build/tests.
- GitHub Releases for desktop installers (when desktop wrapper is ready).

## Non-Goals Right Now

- Full Matrix protocol migration.
- Hard fork of Element codebase.
- Large infra rewrites before finishing core user-facing features.

## Immediate Next Batch (recommended)

1. Implement right-panel phase system (Members/Pinned/Search).
2. Move pinned list fully to right panel.
3. Add search active-filter chips + clear-all.
4. Finalize and document username display policy.

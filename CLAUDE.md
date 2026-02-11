# DatChat

Discord-like chat app: DMs, group rooms, emotes, voice.

## Stack
- **Frontend**: React + Vite + Tailwind + Zustand
- **Backend**: Supabase (Auth, Postgres, Realtime, Storage, Edge Functions)
- **Voice**: LiveKit (SFU)
- **Desktop**: Tauri v2
- **Language**: TypeScript only

## Architecture (v0)
No custom server. Supabase handles auth, DB, storage, realtime.
Client talks directly to Supabase. Edge Functions for server-side logic (voice tokens, link unfurling).

## Key Conventions
- UUID for all IDs (Supabase default)
- Relationships table is directional (from_id → to_id), two rows per friendship
- RelationshipType: 1=friends, 2=blocked, 3=incoming, 4=outgoing
- Room types: 'dm' | 'group'
- Messages scoped to rooms, always queried with room_id
- RLS on all tables, RPC functions for sensitive operations (friend requests, etc.)

## Project Structure
- `packages/shared/` - Shared types, constants, event definitions
- `packages/client/` - React + Vite frontend
- `packages/desktop/` - Tauri v2 wrapper (later)
- `packages/gateway/` - Custom WS gateway (v1, not v0)
- `supabase/` - Migrations, Edge Functions, config

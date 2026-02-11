# DatChat

A minimal, Discord-like chat application focused on core features: DMs, group rooms, custom emotes, and voice calls.

Built with React, Supabase, and LiveKit. Runs for **$0/month** on free tiers.

## Features (v0)

✅ **Authentication** — Email + password via Supabase Auth
✅ **Friend system** — Send/accept/reject/remove friends, blocking (Discord-style)
✅ **DMs** — Auto-created when you accept a friend request
✅ **Group chats** — Create groups with up to 10 friends
✅ **Real-time messaging** — Supabase Realtime (Postgres changes)
✅ **Typing indicators** — See when friends are typing
✅ **Presence** — Online/idle/offline status
✅ **Emoji support** — Native emoji + `:shortcode:` autocomplete
✅ **Message history** — Paginated, lazy-loaded
✅ **Virtual scrolling** — Smooth even with 1000s of messages
🚧 **Voice calls** — LiveKit integration (Edge Function ready, UI pending)
🚧 **Link previews** — Open Graph unfurling (Edge Function ready, UI pending)
🚧 **Emote packs** — Custom emotes (schema ready, UI pending)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 7 + Tailwind CSS v4 + Zustand |
| Backend | Supabase (Postgres + Auth + Realtime + Storage) |
| Voice | LiveKit (SFU) |
| Desktop | Tauri v2 (planned) |
| Mobile | Capacitor (planned) |
| Language | TypeScript only |

---

## Project Structure

```
DatChat/
├── packages/
│   ├── shared/           # Shared types/constants (imported by client + server)
│   ├── client/           # React + Vite app (web/desktop/mobile)
│   ├── desktop/          # Tauri v2 wrapper (pending)
│   └── gateway/          # Custom WS gateway (v1, not needed for v0)
├── supabase/
│   ├── migrations/       # Database schema (001_initial.sql)
│   ├── functions/        # Edge Functions (voice-token, unfurl-link)
│   ├── seed.sql          # Storage buckets + policies
│   └── config.toml       # Local dev config
└── tmp/                  # Reference code (Fermi, Spacebar, Stoat)
```

---

## Prerequisites

1. **Bun** (package manager + runtime)
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Docker Desktop** (for Supabase local dev)
   Download from https://www.docker.com/products/docker-desktop/

3. **Supabase CLI**
   ```bash
   brew install supabase/tap/supabase
   # or
   npm install -g supabase
   ```

---

## Quick Start

### 1. Install dependencies

```bash
bun install
```

### 2. Start Supabase (local Postgres + Auth + Realtime)

```bash
cd supabase
supabase start
```

This will download Docker images (~1GB) and start all services. Note the output:

```
API URL: http://127.0.0.1:54321
anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Run database migrations

```bash
supabase db push
```

This creates all tables, indexes, RLS policies, and RPC functions.

### 4. Seed storage buckets

```bash
supabase db reset
```

### 5. Start the client

```bash
cd ../packages/client
bun dev
```

Open http://localhost:5173

### 6. Test it out

1. Register two accounts (use throwaway emails like `test1@example.com`, `test2@example.com`)
2. Login as user 1, go to Friends → Add Friend, enter user 2's username
3. Login as user 2, accept the friend request
4. A DM room is auto-created — start chatting!

---

## Environment Variables

The client needs two env vars (already set in `.env.local`):

```bash
# packages/client/.env.local
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<your-anon-key-from-supabase-start>
```

For **production**, you'll deploy to Supabase cloud and update these to your project URL.

---

## Key Commands

| Command | Description |
|---------|-------------|
| `bun dev` | Start dev server (in `packages/client/`) |
| `bun run build` | Build for production |
| `supabase start` | Start local Supabase services |
| `supabase stop` | Stop local services |
| `supabase db push` | Run migrations |
| `supabase db reset` | Reset DB + re-run migrations + seed |
| `supabase db types typescript --local > packages/shared/src/database.types.ts` | Generate TypeScript types from schema |

---

## Database Schema

Core tables:

- **profiles** — User profiles (extends `auth.users`)
- **relationships** — Friend system (directional, types: 1=friends, 2=blocked, 3=incoming, 4=outgoing)
- **rooms** — DM or group chats
- **room_members** — Membership junction table
- **messages** — All messages (room-scoped)
- **attachments** — File/image uploads
- **message_embeds** — Link previews (Open Graph)
- **emote_packs**, **emotes**, **room_emote_packs** — Custom emotes

All tables have RLS enabled. Server-side logic uses `security definer` RPC functions:

- `send_friend_request(username)`
- `accept_friend_request(user_id)`
- `reject_friend_request(user_id)`
- `remove_friend(user_id)`
- `block_user(user_id)`
- `unblock_user(user_id)`
- `create_group(name, member_ids[])`

---

## Deployment

### Option 1: Supabase Cloud + Vercel/Netlify

1. Create a Supabase project at https://supabase.com
2. Run migrations: `supabase db push --db-url <your-db-url>`
3. Deploy Edge Functions: `supabase functions deploy voice-token --project-ref <ref>`
4. Build client: `cd packages/client && bun run build`
5. Deploy `packages/client/dist/` to Vercel/Netlify
6. Update env vars in Vercel/Netlify dashboard

**Cost:** $0/month (Supabase free tier: 500MB DB, 1GB storage, 500 concurrent Realtime)

### Option 2: Self-hosted Supabase + VPS

1. Deploy Supabase with Docker Compose (see https://supabase.com/docs/guides/self-hosting)
2. Serve client from Nginx/Caddy
3. Run migrations manually

---

## Roadmap

**v0 (current):** Friends, DMs, group chat, typing, presence, emoji
**v1 (Month 2):** Voice (LiveKit UI), link previews, custom emotes, mobile (Capacitor)
**v2 (Month 3+):** Servers/guilds, roles, threads, screen sharing
**v3+:** Custom Bun gateway (compression, delta updates), Tauri v2 desktop

---

## Comparison to Discord

| Feature | Discord | DatChat v0 |
|---------|---------|-----------|
| **DMs** | ✅ | ✅ |
| **Group chats** | ✅ | ✅ (max 10 members) |
| **Friend system** | ✅ | ✅ |
| **Voice** | ✅ | 🚧 (LiveKit ready) |
| **Servers** | ✅ | ❌ (v2) |
| **Emotes** | ✅ | 🚧 (schema ready) |
| **Reactions** | ✅ | ❌ (v1) |
| **Threads** | ✅ | ❌ (v2) |
| **Cost** | Millions $/mo | $0/mo |

---

## Contributing

This is a personal project built to escape Discord. PRs welcome for bug fixes, but major features should align with the "minimal core" philosophy.

---

## License

MIT (pending confirmation)

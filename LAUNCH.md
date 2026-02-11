# 🚀 DatChat Launch Guide

## Prerequisites Check

- ✅ Docker Desktop installed and running
- ✅ Supabase CLI installed (`npm install -g supabase` or `brew install supabase`)
- ✅ Node.js 20+ installed

---

## Step 1: Start Supabase (Database + Auth + Realtime)

```bash
cd supabase
supabase start
```

**This will:**
- Download Docker images (~1GB, first time only)
- Start Postgres, Auth, Realtime, Storage, Studio
- Output your local API URL and anon key

**Expected output:**
```
API URL: http://127.0.0.1:54321
anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Studio URL: http://127.0.0.1:54323
```

**If it fails:**
- Make sure Docker Desktop is running
- Check port 54321 isn't already in use (`netstat -ano | findstr :54321` on Windows)
- Try `supabase stop` then `supabase start` again

---

## Step 2: Run Database Migrations

```bash
# Still in supabase/ directory
supabase db push
```

**This creates:**
- All tables (profiles, relationships, rooms, messages, etc.)
- Row Level Security policies
- RPC functions (send_friend_request, accept_friend_request, etc.)

**Verify it worked:**
Open http://127.0.0.1:54323 (Supabase Studio) and check the "Table Editor" - you should see all tables.

---

## Step 3: Install Dependencies

```bash
cd ../packages/client
npm install
```

**This installs:**
- React 19, Vite 7, Tailwind CSS v4
- Zustand (state management)
- Supabase JS client
- LiveKit client (voice)
- Emojibase (emoji data)
- React Router (routing)

---

## Step 4: Start the Dev Server

```bash
npm run dev
```

**Expected output:**
```
VITE v7.x.x ready in X ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

Open **http://localhost:5173** in your browser.

---

## Step 5: Test the App

### 5.1 Register Two Accounts

1. Click "Register" → Create user1@example.com / password123
2. Open an **incognito window** → Create user2@example.com / password123

*Why two accounts?* To test the friend system and chat.

### 5.2 Send Friend Request

1. **As User 1**: Click "Friends" → "Add Friend" tab
2. Search for user 2's username (check Supabase Studio → profiles table for exact username)
3. Click "Send Request"
4. **Toast should appear:** "Friend request sent!"

### 5.3 Accept Friend Request

1. **As User 2** (in incognito window): Click "Friends" → "Pending" tab
2. You should see User 1's incoming request
3. Click "Accept"
4. **Toast should appear:** "Friend request accepted!"
5. **A DM room is auto-created** (check "All" or sidebar)

### 5.4 Send Messages

1. **As User 1**: Click on User 2's DM in the sidebar
2. Type a message: "Hello from User 1!"
3. Press Enter
4. **As User 2**: You should see the message appear instantly (Supabase Realtime)

### 5.5 Test Emoji

1. Type `:smile:` → Should convert to 😊 when sent
2. Click the emoji button → Grid picker appears
3. Press Escape → Picker closes (keyboard shortcut!)

### 5.6 Test Typing Indicator

1. **As User 1**: Start typing (don't send)
2. **As User 2**: Should see "User1 is typing..." above the input

### 5.7 Test Voice (If LiveKit is configured)

1. Click "Join Voice" button in room header
2. Button turns green → "Leave Voice"
3. VoicePanel appears at bottom showing participants
4. Test mute/deafen/disconnect

---

## Troubleshooting

### "Cannot connect to Supabase"
- Check `.env.local` has correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Ensure Supabase is running (`supabase status`)
- Restart Vite dev server

### "Friend request not appearing"
- Check browser console for errors
- Verify RPC functions exist in Supabase Studio → Database → Functions
- Check relationships table in Studio → should have 2 rows (bidirectional)

### "Messages not showing up"
- Check Realtime is enabled in Supabase Studio → Settings → API
- Verify messages table has RLS policies
- Check browser console for WebSocket errors

### "No voice token / LiveKit error"
- Voice requires Edge Function deployment (optional for v0)
- You can skip voice testing for now - it's marked as 🚧 in README

---

## What's Working (v0)

✅ Authentication (email + password)
✅ Friend system (send/accept/reject/block)
✅ DMs (auto-created on friend accept)
✅ Real-time messaging (Supabase Realtime)
✅ Typing indicators
✅ Presence (online/offline status)
✅ Emoji support (emojibase library with :shortcode: autocomplete)
✅ Toast notifications for actions
✅ Smooth animations and transitions
✅ Keyboard shortcuts (Escape to close emoji picker)
✅ Auto-focus on inputs

## What's Pending (v1)

🚧 Voice calls (LiveKit integration - Edge Function needs deployment)
🚧 Link previews (Edge Function ready, UI pending)
🚧 Custom emote uploads (schema ready, UI pending)
🚧 Group chats (create_group RPC exists, UI pending)

---

## Next Steps (After Tonight)

1. **Deploy to Production:**
   - Create Supabase cloud project
   - Run migrations: `supabase db push --db-url <your-db-url>`
   - Deploy Edge Functions: `supabase functions deploy voice-token`
   - Build client: `npm run build`
   - Deploy to Vercel/Netlify

2. **Add Missing Features:**
   - Group chat UI
   - Voice Edge Function deployment
   - Link preview rendering
   - Custom emote upload UI

3. **Optimize:**
   - Add virtual scrolling to MessageList (use @tanstack/react-virtual)
   - Add better emoji picker (use emoji-picker-react library)
   - Add form validation (use react-hook-form)
   - Add date formatting (use date-fns)

---

## Quick Commands Reference

| Command | Description |
|---------|-------------|
| `supabase start` | Start local Supabase services |
| `supabase stop` | Stop services |
| `supabase status` | Check what's running |
| `supabase db push` | Run migrations |
| `supabase db reset` | Reset DB + re-run migrations + seed |
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build for production |

---

## Success Criteria

You've successfully launched DatChat v0 if:

✅ Two users can register and log in
✅ Users can send friend requests
✅ Accepting a request auto-creates a DM
✅ Messages are sent and received in real-time
✅ Typing indicators work
✅ Emoji picker works (:shortcode: and grid)
✅ Toast notifications appear for actions
✅ UI is smooth with transitions

**You're ready to ship! 🎉**

---

## If You Get Stuck

1. Check browser console (F12) for errors
2. Check Supabase Studio logs (http://127.0.0.1:54323 → Logs)
3. Verify database has data (Studio → Table Editor)
4. Ensure all migrations ran (`supabase db push`)
5. Restart Vite dev server (`Ctrl+C` then `npm run dev`)

Ask me anything - I'm here to help you launch tonight!

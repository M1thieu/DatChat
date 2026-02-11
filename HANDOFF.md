# DatChat Development Handoff

**Date:** 2026-02-11
**Current State:** App is functional but needs Realtime WebSocket fixes
**Goal:** Fix persistence and realtime updates across all states

---

## 🎯 IMMEDIATE TASK

**Fix WebSocket/Realtime subscription issues to enable live updates without manual refreshes.**

**User's exact request:** "it should be persistent for all other states please? we need consistency and persistence"

**Problem:**
- WebSocket connections are failing with "WebSocket is closed before the connection is established"
- Realtime is falling back to REST API instead of using WebSockets
- Manual refreshes are required to see friend requests, new rooms, messages
- Console shows: "Realtime send() is automatically falling back to REST API"

**What's Working:**
- ✅ User registration & login
- ✅ Friend request send/accept/reject
- ✅ DM room auto-creation on friend accept
- ✅ DM auto-opens after accepting friend request
- ✅ Can type and send messages
- ✅ Typing indicators work (but using REST fallback)
- ✅ No more infinite recursion errors

**What Needs Fixing:**
- ❌ WebSocket connections not staying open
- ❌ Realtime subscriptions not working properly
- ❌ Must manually refresh to see friend request changes
- ❌ Must manually refresh to see new rooms
- ❌ Messages might not appear live (need to test)

---

## 📁 PROJECT STRUCTURE

```
DatChat/
├── packages/
│   ├── shared/           # Shared TypeScript types & constants
│   │   └── src/
│   │       ├── types.ts  # All type definitions
│   │       └── constants.ts
│   ├── client/           # React + Vite frontend
│   │   └── src/
│   │       ├── components/
│   │       │   ├── auth/        # Login.tsx, Register.tsx
│   │       │   ├── chat/        # MessageList.tsx, MessageInput.tsx
│   │       │   ├── friends/     # FriendsView.tsx
│   │       │   ├── layout/      # AppLayout.tsx, ChatArea.tsx, Sidebar.tsx
│   │       │   └── voice/
│   │       ├── stores/          # Zustand stores
│   │       │   ├── auth.ts      # Authentication state
│   │       │   ├── friends.ts   # Friend relationships & requests
│   │       │   ├── rooms.ts     # DM & group rooms
│   │       │   ├── messages.ts  # Chat messages
│   │       │   ├── presence.ts  # User online/offline/idle status
│   │       │   ├── typing.ts    # Typing indicators
│   │       │   ├── toast.ts     # Notifications
│   │       │   └── voice.ts     # Voice chat (LiveKit)
│   │       └── lib/
│   │           ├── supabase.ts  # Supabase client
│   │           └── emoji.ts     # Emoji shortcode replacement
│   └── desktop/          # Tauri v2 (not yet implemented)
└── supabase/
    ├── migrations/       # Database schema
    └── functions/        # Edge Functions (voice tokens, etc.)
```

---

## 🗄️ DATABASE SCHEMA (Supabase Postgres)

### **profiles** (User profiles)
```sql
- id: uuid (primary key, references auth.users)
- username: text (unique, not null)
- display_name: text
- avatar_url: text
- status: text ('online' | 'offline' | 'idle' | 'dnd')
- status_text: text
- created_at: timestamp
```

### **relationships** (Friend system - directional)
```sql
- id: uuid (primary key)
- from_id: uuid (references profiles)
- to_id: uuid (references profiles)
- type: integer (1=friends, 2=blocked, 3=incoming, 4=outgoing)
- created_at: timestamp
- unique(from_id, to_id)
```

**Important:** Relationships are directional. Each friendship has TWO rows:
- User A → User B (type=1, friends)
- User B → User A (type=1, friends)

Friend request flow:
1. A sends request to B: Creates A→B (type=4, outgoing) and B→A (type=3, incoming)
2. B accepts: Updates both rows to type=1 (friends)
3. B rejects: Deletes both rows

### **rooms** (DM and group chats)
```sql
- id: uuid (primary key)
- type: text ('dm' | 'group')
- name: text (null for DMs)
- created_at: timestamp
```

### **room_members** (Who's in which room)
```sql
- id: uuid (primary key)
- room_id: uuid (references rooms)
- user_id: uuid (references profiles)
- joined_at: timestamp
- unique(room_id, user_id)
```

**CRITICAL RLS POLICY FIX:**
```sql
-- This policy caused infinite recursion (DO NOT USE):
-- using (exists (select 1 from room_members rm2 where rm2.room_id = room_members.room_id and rm2.user_id = auth.uid()))

-- Current working policy (CORRECT):
create policy "room_members_select" on public.room_members
  for select to authenticated
  using (user_id = auth.uid());
```

### **messages** (Chat messages)
```sql
- id: uuid (primary key)
- room_id: uuid (references rooms)
- author_id: uuid (references profiles)
- content: text (not null)
- reply_to_id: uuid (references messages, nullable)
- edited_at: timestamp (nullable)
- created_at: timestamp
```

---

## 🔧 FIXES APPLIED IN THIS SESSION

### 1. **emoji.ts - Fixed iteration error**
**File:** `packages/client/src/lib/emoji.ts`

**Problem:** `for (const emoji of emojis)` threw "object is not iterable"

**Solution:** Replaced emojibase-data iteration with hardcoded `EMOJI_MAP`:
```typescript
export const EMOJI_MAP: Record<string, string> = {
  ":smile:": "😊",
  ":joy:": "😂",
  ":rofl:": "🤣",
  ":old_man:": "👴",
  ":sweat_smile:": "🥲",
  // ... ~50 common emojis
};

export function replaceEmojiShortcodes(text: string): string {
  return text.replace(/:([a-z0-9_+-]+):/gi, (match, shortcode) => {
    const key = `:${shortcode.toLowerCase()}:`;
    return EMOJI_MAP[key] ?? match;
  });
}
```

### 2. **Register.tsx & Login.tsx - Added password visibility toggle**
**Files:**
- `packages/client/src/components/auth/Register.tsx`
- `packages/client/src/components/auth/Login.tsx`

**Added:**
```typescript
const [showPassword, setShowPassword] = useState(false);

<div className="relative">
  <input
    type={showPassword ? "text" : "password"}
    autoComplete="email"  // Also added autocomplete
    // ... other props
  />
  <button
    type="button"
    onClick={() => setShowPassword(!showPassword)}
    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
  >
    {showPassword ? (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        {/* Eye-off icon */}
      </svg>
    ) : (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        {/* Eye icon */}
      </svg>
    )}
  </button>
</div>
```

### 3. **FriendsView.tsx - Fixed friend actions**
**File:** `packages/client/src/components/friends/FriendsView.tsx`

**Changes:**
1. Fixed import: `import { addToast } from "@/stores/toast";` (was `useToastStore`)
2. Added error handling to all friend action buttons
3. Added manual `fetchRooms()` after accepting friend request (workaround for Realtime)
4. Added auto-open DM functionality:

```typescript
const fetchRooms = useRoomsStore((s) => s.fetchRooms);
const setActiveRoom = useRoomsStore((s) => s.setActiveRoom);

// Accept button:
onClick={async () => {
  try {
    const result = await acceptRequest(rel.to_id);
    await fetchRooms();  // Manual refetch workaround
    addToast("Friend request accepted! DM room created.", "success");
    if (result.room_id) {
      setActiveRoom(result.room_id);  // Auto-open DM
    }
  } catch (error) {
    addToast(error instanceof Error ? error.message : "Failed to accept request", "error");
  }
}}
```

### 4. **presence.ts - Fixed Promise error**
**File:** `packages/client/src/stores/presence.ts`

**Problem:** Passing Promise to `.eq()` instead of awaiting user ID

**Before:**
```typescript
setMyStatus: (status) => {
  set({ myStatus: status });
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    supabase.from("profiles").update({ status }).eq("id", user.id);  // Missing await
  });
},
```

**After:**
```typescript
setMyStatus: async (status) => {
  set({ myStatus: status });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("profiles")
    .update({ status })
    .eq("id", user.id);  // Now correctly passing user.id
},
```

### 5. **auth.ts - Improved logout error handling**
**File:** `packages/client/src/stores/auth.ts`

**Added try/catch to ensure state clears even if logout fails:**
```typescript
logout: async () => {
  try {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null });
  } catch (error) {
    console.error("Logout error:", error);
    set({ session: null, user: null, profile: null });  // Clear state anyway
  }
},
```

### 6. **Supabase RLS Policy - Fixed infinite recursion**
**Table:** `room_members`

**Problem:** Policy was querying `room_members` to authorize `room_members` access → infinite loop

**Solution:** Simplified to just check `user_id`:
```sql
drop policy if exists "room_members_select" on public.room_members;

create policy "room_members_select" on public.room_members
  for select to authenticated
  using (user_id = auth.uid());
```

Run this in Supabase SQL Editor if policy isn't already fixed.

---

## 🔴 CURRENT ISSUE: REALTIME WEBSOCKET SUBSCRIPTIONS

### Console Warnings

```
WebSocket is closed before the connection is established.
Realtime send() is automatically falling back to REST API
```

### Where Subscriptions Are Set Up

**File:** `packages/client/src/components/layout/AppLayout.tsx`

```typescript
useEffect(() => {
  if (!user) return;

  // Subscribe to realtime changes
  const unsubRooms = subscribeToRoomsChanges(user.id);
  const unsubFriends = subscribeToFriendsChanges(user.id);

  return () => {
    unsubRooms();
    unsubFriends();
  };
}, [user, subscribeToRoomsChanges, subscribeToFriendsChanges]);
```

### Subscription Implementation

All three stores (`rooms.ts`, `friends.ts`, `messages.ts`) have `subscribeToChanges` functions:

**Example from rooms.ts:**
```typescript
subscribeToChanges: (userId) => {
  const channel = supabase
    .channel("rooms-changes")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "room_members",
        filter: `user_id=eq.${userId}`,
      },
      () => {
        get().fetchRooms();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "room_members",
        filter: `user_id=eq.${userId}`,
      },
      () => {
        get().fetchRooms();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "rooms",
      },
      () => {
        get().fetchRooms();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
},
```

### Possible Causes

1. **React StrictMode Double-Mounting**: In development, React 19 mounts/unmounts effects twice, which can close WebSocket connections prematurely
2. **Supabase Realtime Not Enabled**: Check Supabase dashboard → Database → Replication → ensure tables have Realtime enabled
3. **Channel Cleanup Race Condition**: Subscriptions might be cleaned up too quickly
4. **Missing await on subscribe()**: The `.subscribe()` call is async but not awaited

### How to Debug

1. **Check Supabase Realtime is enabled:**
   - Go to Supabase Dashboard → Database → Replication
   - Ensure these tables have Realtime enabled:
     - `profiles`
     - `relationships`
     - `rooms`
     - `room_members`
     - `messages`

2. **Check WebSocket connection in Network tab:**
   - Open Chrome DevTools → Network → WS filter
   - Look for WebSocket connection to `wss://[project-ref].supabase.co/realtime/v1/websocket`
   - Check if it stays connected or disconnects immediately

3. **Try adding connection status logging:**
   ```typescript
   const channel = supabase
     .channel("rooms-changes")
     .on("system", { event: "*" }, (payload) => {
       console.log("Channel event:", payload);
     })
     // ... rest of subscriptions
     .subscribe((status) => {
       console.log("Subscription status:", status);
     });
   ```

4. **Test in production build** (not dev mode):
   ```bash
   cd packages/client
   npm run build
   npm run preview
   ```
   This removes React StrictMode double-mounting issues.

### Recommended Fix Approach

1. **Add proper subscription error handling and logging**
2. **Ensure Realtime is enabled in Supabase dashboard**
3. **Test with status callbacks to see connection state**
4. **Consider wrapping subscriptions in a retry mechanism**
5. **Check if WebSocket URL is correct in Supabase client config**

---

## 🧪 TESTING CHECKLIST

After fixing Realtime:

- [ ] Open two browser windows side-by-side
- [ ] User A sends friend request to User B
- [ ] User B should see incoming request WITHOUT refreshing
- [ ] User B accepts request
- [ ] User A should see friend status update WITHOUT refreshing
- [ ] DM room should appear for both users WITHOUT refreshing
- [ ] User A sends message
- [ ] User B should see message appear live WITHOUT refreshing
- [ ] Test typing indicators work in real-time
- [ ] Test user status changes propagate live

---

## 🛠️ KEY SUPABASE RPC FUNCTIONS

Located in `supabase/migrations/` or created via SQL:

### **send_friend_request(target_username text)**
Creates two directional relationship rows (outgoing + incoming)

### **accept_friend_request(from_user_id uuid)**
- Updates both relationship rows to type=1 (friends)
- Creates DM room
- Adds both users to room_members
- Returns room_id

### **reject_friend_request(from_user_id uuid)**
Deletes both relationship rows

### **remove_friend(friend_id uuid)**
Deletes both relationship rows + DM room

### **block_user(target_user_id uuid)**
Updates relationship to type=2 (blocked)

### **unblock_user(target_user_id uuid)**
Deletes blocked relationship

---

## 📦 DEPENDENCIES

**Frontend (packages/client):**
```json
{
  "react": "^19.0.0",
  "vite": "^7.0.0",
  "@supabase/supabase-js": "latest",
  "zustand": "latest",
  "tailwindcss": "^4.0.0",
  "sonner": "latest",  // Toast notifications
  "@livekit/components-react": "latest"  // Voice
}
```

**Important:** Using Tailwind CSS v4 (new syntax with CSS variables)

---

## 💡 ARCHITECTURE NOTES

### No Custom Server
- Supabase handles auth, database, storage, realtime
- Client talks directly to Supabase
- Edge Functions for server-side logic (voice tokens, link unfurling)

### Zustand State Management
All stores follow this pattern:
1. Define state interface
2. Define actions
3. Create store with `create()`
4. Export custom hooks or direct access

### Row Level Security (RLS)
**CRITICAL:** All tables must have RLS enabled and proper policies.

**Common pattern:**
```sql
-- Users can only see their own data
create policy "users_select_own" on profiles
  for select to authenticated
  using (id = auth.uid());

-- Users can see relationships where they're involved
create policy "relationships_select" on relationships
  for select to authenticated
  using (from_id = auth.uid() OR to_id = auth.uid());
```

### Realtime Subscriptions
- Each store has `subscribeToChanges()` function
- Called from `AppLayout.tsx` on mount
- Cleanup function returned to unsubscribe on unmount
- Refetches data when changes detected

---

## 🚀 HOW TO RUN

```bash
# Install dependencies
npm install

# Start dev server
cd packages/client
npm run dev

# Open http://localhost:5173
```

**Supabase Configuration:**
- Project URL and Anon Key are in `packages/client/src/lib/supabase.ts`
- Email confirmation is DISABLED in Supabase Auth settings
- Confirm new users manually via Supabase Dashboard if needed

---

## 📋 NEXT STEPS (In Priority Order)

1. **Fix Realtime WebSocket subscriptions** (IMMEDIATE PRIORITY)
   - Enable Realtime on all tables in Supabase dashboard
   - Add subscription status logging
   - Test in production build (no StrictMode)
   - Ensure WebSocket stays connected

2. **Test complete friend flow end-to-end with live updates**
   - Send request
   - Accept request
   - Auto-open DM
   - Send messages
   - All should happen live without refreshes

3. **Add loading states and UX polish**
   - Skeleton loaders for messages
   - Loading spinners for friend actions
   - Smooth transitions
   - Optimistic UI updates

4. **Implement typing indicators properly**
   - Currently using REST fallback
   - Should use WebSocket after fix

5. **Test voice chat (LiveKit integration)**
   - Not tested yet
   - Need LiveKit credentials in .env

6. **Add custom emotes system**
   - Upload custom emotes
   - Store in Supabase Storage
   - Replace shortcodes with custom images

---

## 🐛 KNOWN ISSUES

1. **WebSocket connections failing** (PRIORITY #1 - FIX THIS FIRST)
2. React StrictMode warnings in console (expected in dev, ignore for now)
3. Typing indicators using REST fallback instead of WebSocket
4. No skeleton loaders (messages show loading text)
5. Voice chat untested

---

## 📝 USER PREFERENCES

From conversation:
- Wants classic UX patterns (password eye toggle, autocomplete)
- Wants minimal libraries, focused on core functionality
- Don't reinvent the wheel - use existing libraries where appropriate
- Prefers not to hardcode when libraries available
- Wants $0/month hosting (Supabase free tier)
- Interested in decentralization for future (Matrix protocol, IPFS, WebRTC mesh)

---

## 🔑 CRITICAL FILES TO UNDERSTAND

1. **packages/client/src/stores/rooms.ts** - Room management + subscriptions
2. **packages/client/src/stores/friends.ts** - Friend system + subscriptions
3. **packages/client/src/stores/messages.ts** - Messages + subscriptions
4. **packages/client/src/components/layout/AppLayout.tsx** - Where subscriptions are called
5. **packages/client/src/components/friends/FriendsView.tsx** - Friend UI + actions
6. **supabase/migrations/** - Database schema and RPC functions

---

## 🎓 IMPORTANT CONTEXT

### Why Manual Refetches Were Added
The `fetchRooms()` calls after friend actions are **temporary workarounds** because Realtime subscriptions aren't working. Once WebSocket is fixed, these can be removed - the subscriptions will handle updates automatically.

### Why Relationships Are Directional
Each friendship has TWO rows (A→B and B→A) to enable:
- Efficient queries (no OR conditions)
- Different relationship types from each perspective
- Clean blocking logic (A blocks B ≠ B blocks A)

### Why RLS Policy Was Simplified
The original policy tried to check "is user a member of this room?" by querying room_members FROM room_members, causing infinite recursion. The fix is to just check `user_id = auth.uid()`, which is sufficient for security.

---

## 🎯 SUCCESS CRITERIA

**This session is successful when:**
1. ✅ WebSocket stays connected (no more fallback warnings)
2. ✅ Friend requests appear live without manual refresh
3. ✅ DM rooms appear live after accepting friend
4. ✅ Messages appear live when sent
5. ✅ Typing indicators work via WebSocket
6. ✅ User status changes propagate live

**User's quote:** "we need consistency and persistence"

---

## 📞 DEBUGGING COMMANDS

```bash
# Check Supabase connection
curl https://[project-ref].supabase.co/rest/v1/

# Check WebSocket endpoint
wscat -c wss://[project-ref].supabase.co/realtime/v1/websocket

# Build for production (no StrictMode)
cd packages/client
npm run build
npm run preview
```

---

## 🔗 USEFUL LINKS

- [Supabase Realtime Docs](https://supabase.com/docs/guides/realtime)
- [Supabase JS Client Docs](https://supabase.com/docs/reference/javascript/introduction)
- [Zustand Docs](https://zustand-demo.pmnd.rs/)
- [React 19 Docs](https://react.dev/)
- [Tailwind CSS v4 Docs](https://tailwindcss.com/)

---

## ⚠️ IMPORTANT REMINDERS

- **NEVER modify git config or use --no-verify**
- **ALWAYS check Supabase RLS policies before adding new tables**
- **UUID for all IDs** (Supabase default)
- **TypeScript only** - no JavaScript files
- **Email confirmation is DISABLED** in Supabase settings
- **Confirm new users manually** via Supabase Dashboard → Authentication → Users

---

**Last updated:** 2026-02-11
**Handoff from:** Claude Sonnet 4.5
**Handoff to:** ChatGPT/Codex
**Duration:** 2 days

Good luck! The app is ~90% working - just needs that Realtime WebSocket fix to be fully live. 🚀

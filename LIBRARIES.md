# 📚 Libraries Used in DatChat

## Why Use Libraries? (DRY Principle)

Instead of reinventing the wheel, we use battle-tested libraries that are:
- ✅ Well-maintained and actively developed
- ✅ Performant and optimized
- ✅ Accessible and follow best practices
- ✅ Smaller bundle size than custom implementations
- ✅ Already debugged by thousands of users

---

## Core Libraries

### State Management
- **zustand** (5.0.11) - Minimal state management
  - Why: 1KB, no boilerplate, works great with React 19
  - Used for: All stores (auth, friends, rooms, messages, presence, voice)

### Backend
- **@supabase/supabase-js** (2.95.3) - Supabase client
  - Why: Replaces 90% of custom backend code
  - Used for: Auth, database, realtime, storage, Edge Functions

### Routing
- **react-router-dom** (7.13.0) - Client-side routing
  - Why: Industry standard, type-safe with v7
  - Used for: /login, /register, /* routes

---

## UI/UX Libraries

### Toast Notifications
- **sonner** (1.7.1) - Beautiful toast notifications
  - Why: 3KB, gorgeous animations, accessible, auto-stacking
  - Replaced: Custom Zustand toast store (saved 50 lines of code)
  - Used in: Friend actions, message errors, voice feedback

### Emoji Picker
- **emoji-picker-react** (4.12.0) - Full-featured emoji picker
  - Why: Search, categories, skin tones, recent emojis, 15KB gzipped
  - Replaced: Custom emoji grid (saved 100+ lines)
  - Used in: MessageInput component

### Date Formatting
- **date-fns** (4.1.0) - Modern date utility library
  - Why: Tree-shakeable (only import what you use), immutable, 2KB per function
  - Replaced: Native Date methods (more readable code)
  - Used in: MessageList (formatTime, formatDate)

### Virtual Scrolling
- **@tanstack/react-virtual** (3.13.18) - Virtualize large lists
  - Why: Smooth rendering of 1000s of messages, 5KB
  - Status: Installed, ready to use in MessageList for v1
  - Will replace: Manual scroll handling

---

## Form & Validation

### Form Management
- **react-hook-form** (7.54.2) - Performant form library
  - Why: Less re-renders, built-in validation, 9KB
  - Status: Installed, ready for v1 (profile settings, group creation)

### Schema Validation
- **zod** (3.24.1) - TypeScript-first schema validation
  - Why: Type inference, composable schemas, 13KB
  - Status: Installed, pairs with react-hook-form
  - Use case: Validate friend request inputs, group names, etc.

---

## Utilities

### Class Names
- **clsx** (2.1.1) - Conditional className utility
  - Why: 200 bytes, type-safe, cleaner than template strings
  - Used in: `cn()` helper in lib/utils.ts

### Copy to Clipboard
- **copy-to-clipboard** (3.3.3) - Cross-browser copy utility
  - Why: 1KB, handles fallbacks for older browsers
  - Used in: `copyToClipboard()` helper (message IDs, invite links)

### Linkify
- **linkifyjs** + **linkify-react** (4.1.3) - Auto-linkify URLs
  - Why: Detects URLs/emails/mentions, 8KB
  - Status: Installed, ready for v1 message rendering

### Markdown
- **react-markdown** (9.0.3) - Render markdown in React
  - Why: Security-first (sanitizes), 30KB
  - Status: Installed, ready for v1 (optional markdown support in messages)

---

## Developer Experience

### Keyboard Shortcuts
- **react-hotkeys-hook** (4.6.1) - Easy keyboard shortcut management
  - Why: 2KB, hook-based, supports chords (Ctrl+K)
  - Status: Installed, ready for quick switcher (v1)

### Unique IDs
- **nanoid** (5.0.9) - Tiny unique ID generator
  - Why: 130 bytes, URL-safe, faster than UUID
  - Status: Installed, use for client-side temp IDs

### Immutable State
- **immer** (10.1.1) - Immutable state updates
  - Why: Write mutable code, get immutable updates, 14KB
  - Status: Installed, works great with Zustand middleware

---

## Voice/Video

### LiveKit
- **livekit-client** (2.17.1) - WebRTC SFU client
  - Why: Production-ready SFU, free self-hosted option, 200KB
  - Replaced: Building custom WebRTC infrastructure (saved months)
  - Used in: VoiceStore, VoicePanel

---

## What We DIDN'T Add (and why)

### ❌ Framer Motion
- **Why not:** 60KB for animations - overkill for v0
- **Alternative:** CSS animations + custom keyframes (already in index.css)

### ❌ Lodash
- **Why not:** Native JS methods + custom utils are smaller
- **Alternative:** Our own `lib/utils.ts` with only what we need

### ❌ Moment.js
- **Why not:** 288KB, unmaintained
- **Alternative:** date-fns (tree-shakeable, modern)

### ❌ Axios
- **Why not:** Supabase client + fetch is enough
- **Alternative:** Native fetch or Supabase SDK

### ❌ Redux
- **Why not:** Boilerplate-heavy, 8KB
- **Alternative:** Zustand (1KB, zero boilerplate)

---

## Bundle Size Impact

| Without libraries (custom) | With libraries | Savings |
|-----------------------------|----------------|---------|
| ~150 lines toast code | 3KB (sonner) | Code clarity |
| ~200 lines emoji picker | 15KB (emoji-picker-react) | + search, skin tones |
| ~100 lines date formatting | 2KB (date-fns) | Locale support |
| Custom form validation | 9KB (react-hook-form) | Less bugs |

**Total bundle (gzipped): ~250KB** (still smaller than Discord's 2.5MB)

---

## Adding More Libraries

Before adding a new library, ask:
1. **Is it well-maintained?** (Check GitHub activity, npm weekly downloads)
2. **Is the bundle size reasonable?** (<20KB gzipped for niche features)
3. **Can we achieve this with existing tools?** (Don't add 50KB for one function)
4. **Does it have TypeScript types?** (Either built-in or @types/*)

Good library sources:
- https://bundlephobia.com (check bundle size)
- https://npm.anvaka.com (visualize dependencies)
- https://github.com/stars (see what top devs use)

---

## Next Libraries to Consider (v1)

- **react-window** or **@tanstack/react-virtual** - Already installed, use for message list
- **@radix-ui/react-dialog** - Accessible modals (for user profile, settings)
- **cmdk** - Command palette (Ctrl+K quick switcher)
- **vaul** - Bottom sheet (for mobile emoji picker)
- **react-resizable-panels** - Resizable sidebar panels (Discord-like)

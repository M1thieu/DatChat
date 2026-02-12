# DatChat Core Scope V1

Date: 2026-02-11

## Product Positioning

DatChat V1 is a free, privacy-first, core-only communication app for:
- friend groups,
- small communities,
- privacy-sensitive users who want less bloat.

No paid plan strategy is assumed for V1.

## V1 Must-Have Features

1. Identity and access
- account signup/login
- session persistence
- block/report basics

2. Messaging core
- DMs
- group rooms
- text messaging
- image and GIF sending
- reactions

3. Discovery and navigation
- room list
- unread state
- basic in-room search
- pinned messages

4. Realtime and reliability
- no manual refresh required for new events
- reconnect handling for dropped socket sessions

5. Voice
- join/leave room voice
- mute/deafen
- participant list

6. UX quality baseline
- desktop web first
- mobile web usable
- clean, consistent, fast interactions

## V1.5 (After Stable V1)

1. Threads
2. Voice messages
3. Advanced search filters and saved searches
4. Rich moderation controls

## Explicitly Out of Scope

1. Paid plans, boosts, premium unlocks
2. Plugin marketplace / complex extension ecosystem
3. Deep widgets/integrations platform
4. Complex enterprise role hierarchy
5. Feature-heavy settings and customization surfaces

## V1 Success Criteria

1. Stable release for friend cohort testing
2. Realtime behavior works without refresh loops
3. Core flows (DM/group/media/voice/search/pins/reactions) are reliable
4. Crash/error rate low enough for daily usage

## Constraint Rules

1. If a feature does not improve core messaging speed, privacy, or reliability, defer it.
2. Prefer fewer features with stronger quality.
3. Protect simplicity over novelty.

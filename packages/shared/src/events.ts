/**
 * Realtime event types for DatChat.
 *
 * v0: Uses Supabase Realtime (Postgres Changes + Broadcast + Presence)
 * v1: Custom gateway with op-code based wire format
 */

import type {
  Message,
  Profile,
  Relationship,
  Room,
  RoomMember,
} from "./types";

// ── Supabase Realtime table change payloads ──────────

export type RealtimeChangeType = "INSERT" | "UPDATE" | "DELETE";

export interface RealtimeChange<T> {
  type: RealtimeChangeType;
  table: string;
  schema: string;
  new: T;
  old: Partial<T>;
}

// ── Broadcast events (ephemeral, no DB) ──────────────

export interface TypingEvent {
  user_id: string;
  username: string;
  room_id: string;
}

// ── Presence state ───────────────────────────────────

export interface PresenceState {
  user_id: string;
  status: "online" | "idle" | "dnd" | "offline";
  last_seen: string;
}

// ── v1 Gateway event types (future) ──────────────────

export const GatewayOp = {
  EVENT: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

export type GatewayOpValue = (typeof GatewayOp)[keyof typeof GatewayOp];

export interface GatewayPayload<T = unknown> {
  op: GatewayOpValue;
  t?: string;
  d: T;
}

// Client → Server
export type ClientEventType =
  | "IDENTIFY"
  | "HEARTBEAT"
  | "TYPING_START"
  | "PRESENCE_UPDATE"
  | "VOICE_JOIN"
  | "VOICE_LEAVE"
  | "VOICE_STATE";

// Server → Client
export type ServerEventType =
  | "READY"
  | "HEARTBEAT_ACK"
  | "MESSAGE_CREATE"
  | "MESSAGE_UPDATE"
  | "MESSAGE_DELETE"
  | "TYPING_START"
  | "PRESENCE_UPDATE"
  | "VOICE_STATE_UPDATE"
  | "VOICE_TOKEN"
  | "ROOM_CREATE"
  | "ROOM_UPDATE"
  | "MEMBER_JOIN"
  | "MEMBER_LEAVE"
  | "RELATIONSHIP_ADD"
  | "RELATIONSHIP_UPDATE"
  | "RELATIONSHIP_REMOVE";

// ── v1 Gateway event payloads ────────────────────────

export interface ReadyEvent {
  user: Profile;
  rooms: Room[];
  members: RoomMember[];
  relationships: Relationship[];
  presence_map: Record<string, PresenceState>;
}

export interface MessageCreateEvent {
  message: Message;
}

export interface MessageDeleteEvent {
  id: string;
  room_id: string;
}

export interface VoiceTokenEvent {
  token: string;
  url: string;
  room_id: string;
}

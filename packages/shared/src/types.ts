// ── User ─────────────────────────────────────────────

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status: UserStatus;
  created_at: string;
}

export type UserStatus = "online" | "idle" | "dnd" | "offline";

// ── Relationships ────────────────────────────────────

export const RelationshipType = {
  FRIENDS: 1,
  BLOCKED: 2,
  INCOMING: 3,
  OUTGOING: 4,
} as const;

export type RelationshipTypeValue =
  (typeof RelationshipType)[keyof typeof RelationshipType];

export interface Relationship {
  id: string;
  from_id: string;
  to_id: string;
  type: RelationshipTypeValue;
  nickname: string | null;
  created_at: string;
}

/** Relationship with the related user's profile populated */
export interface RelationshipWithProfile extends Relationship {
  profile: Profile;
}

// ── Rooms ────────────────────────────────────────────

export type RoomType = "dm" | "group";

export interface Room {
  id: string;
  name: string | null;
  type: RoomType;
  icon_url: string | null;
  owner_id: string | null;
  created_at: string;
}

export interface RoomMember {
  room_id: string;
  user_id: string;
  nickname: string | null;
  joined_at: string;
}

export interface RoomWithMembers extends Room {
  members: RoomMember[];
}

// ── Messages ─────────────────────────────────────────

export interface Message {
  id: string;
  room_id: string;
  author_id: string;
  author_username_snapshot: string;
  author_display_name_snapshot: string;
  content: string;
  edited_at: string | null;
  reply_to_id: string | null;
  created_at: string;
}

export interface MessageWithAuthor extends Message {
  author: Profile;
  reply_to?: Message | null;
  attachments?: Attachment[];
  embeds?: MessageEmbed[];
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface MessagePin {
  room_id: string;
  message_id: string;
  pinned_by: string;
  created_at: string;
}

// ── Attachments ──────────────────────────────────────

export interface Attachment {
  id: string;
  message_id: string;
  filename: string;
  storage_path: string;
  content_type: string | null;
  size: number | null;
}

// ── Embeds (link previews) ───────────────────────────

export interface MessageEmbed {
  id: string;
  message_id: string;
  url: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  created_at: string;
}

// ── Emotes ───────────────────────────────────────────

export interface EmotePack {
  id: string;
  name: string;
  owner_id: string | null;
  created_at: string;
}

export interface Emote {
  id: string;
  pack_id: string;
  name: string;
  storage_path: string;
  animated: boolean;
}

export interface EmotePackWithEmotes extends EmotePack {
  emotes: Emote[];
}

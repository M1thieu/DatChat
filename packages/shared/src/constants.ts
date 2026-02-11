/** Maximum number of friends a user can have */
export const MAX_FRIENDS = 1000;

/** Maximum number of members in a group chat */
export const MAX_GROUP_MEMBERS = 10;

/** Number of messages to fetch per page */
export const MESSAGES_PER_PAGE = 50;

/** Maximum message length (characters) */
export const MAX_MESSAGE_LENGTH = 4000;

/** Maximum emotes per pack */
export const MAX_EMOTES_PER_PACK = 50;

/** Maximum emote packs per user */
export const MAX_EMOTE_PACKS = 10;

/** Typing indicator timeout (ms) */
export const TYPING_TIMEOUT = 8000;

/** Heartbeat interval (ms) — for v1 gateway */
export const HEARTBEAT_INTERVAL = 30000;

/** Maximum attachment size (bytes) — 25MB */
export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;

/** Allowed image MIME types for emotes */
export const EMOTE_MIME_TYPES = [
  "image/png",
  "image/gif",
  "image/webp",
] as const;

/** Allowed attachment MIME types */
export const ATTACHMENT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/ogg",
  "application/pdf",
] as const;

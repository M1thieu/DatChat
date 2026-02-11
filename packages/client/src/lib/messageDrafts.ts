const MESSAGE_DRAFTS_STORAGE_KEY = "datchat.messageDrafts";
const DRAFT_RETENTION_MS = 1000 * 60 * 60 * 24 * 30;
const MAX_DRAFTS_PER_USER = 200;

interface DraftEntry {
  content: string;
  updatedAt: number;
}

type DraftState = Record<string, Record<string, DraftEntry>>;

function readDraftState(): DraftState {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(MESSAGE_DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as DraftState;
  } catch {
    return {};
  }
}

function writeDraftState(state: DraftState) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(MESSAGE_DRAFTS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures.
  }
}

function normalizeUserDrafts(
  draftsByRoom: Record<string, DraftEntry>,
  knownRoomIds?: string[]
) {
  const knownRooms = knownRoomIds ? new Set(knownRoomIds) : null;
  const now = Date.now();
  const validEntries = Object.entries(draftsByRoom).filter(([roomId, draft]) => {
    if (!draft || typeof draft.content !== "string") return false;
    if (!draft.content.trim()) return false;
    if (typeof draft.updatedAt !== "number") return false;
    if (now - draft.updatedAt > DRAFT_RETENTION_MS) return false;
    if (knownRooms && !knownRooms.has(roomId)) return false;
    return true;
  });

  validEntries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);

  return Object.fromEntries(validEntries.slice(0, MAX_DRAFTS_PER_USER));
}

export function getMessageDraft(userId: string | null | undefined, roomId: string): string {
  if (!userId) return "";

  const state = readDraftState();
  const nextUserDrafts = normalizeUserDrafts(state[userId] ?? {});
  if (
    Object.keys(nextUserDrafts).length !== Object.keys(state[userId] ?? {}).length
  ) {
    state[userId] = nextUserDrafts;
    writeDraftState(state);
  }

  return nextUserDrafts[roomId]?.content ?? "";
}

export function setMessageDraft(
  userId: string | null | undefined,
  roomId: string,
  content: string
) {
  if (!userId) return;

  const trimmed = content.trim();
  const state = readDraftState();
  const userDrafts = { ...(state[userId] ?? {}) };

  if (!trimmed) {
    delete userDrafts[roomId];
  } else {
    userDrafts[roomId] = {
      content,
      updatedAt: Date.now(),
    };
  }

  state[userId] = normalizeUserDrafts(userDrafts);
  writeDraftState(state);
}

export function clearMessageDraft(userId: string | null | undefined, roomId: string) {
  if (!userId) return;

  const state = readDraftState();
  const userDrafts = { ...(state[userId] ?? {}) };
  if (!userDrafts[roomId]) return;

  delete userDrafts[roomId];
  state[userId] = normalizeUserDrafts(userDrafts);
  writeDraftState(state);
}

export function cleanupMessageDraftsForRooms(
  userId: string | null | undefined,
  knownRoomIds: string[]
) {
  if (!userId) return;

  const state = readDraftState();
  const currentDrafts = state[userId] ?? {};
  const nextDrafts = normalizeUserDrafts(currentDrafts, knownRoomIds);

  const previousSerialized = JSON.stringify(currentDrafts);
  const nextSerialized = JSON.stringify(nextDrafts);
  if (previousSerialized === nextSerialized) return;

  state[userId] = nextDrafts;
  writeDraftState(state);
}


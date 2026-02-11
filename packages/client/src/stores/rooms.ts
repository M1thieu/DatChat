import { create } from "zustand";
import type { Room, RoomMember, Profile } from "@datchat/shared";
import { supabase } from "@/lib/supabase";
import { cleanupMessageDraftsForRooms } from "@/lib/messageDrafts";

const shouldLogRealtime = import.meta.env.VITE_REALTIME_DEBUG === "true";
const DM_PEERS_STORAGE_KEY = "datchat.dmPeersByRoomId";

function roomActivityTimestamp(room: RoomWithDetails): number {
  const source = room.last_message_at ?? room.created_at;
  const timestamp = Date.parse(source);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function readStoredDmPeers(): Map<string, string> {
  if (typeof window === "undefined") return new Map();

  try {
    const raw = window.localStorage.getItem(DM_PEERS_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, string>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function writeStoredDmPeers(dmPeers: Map<string, string>) {
  if (typeof window === "undefined") return;

  try {
    const serialized = JSON.stringify(Object.fromEntries(dmPeers.entries()));
    window.localStorage.setItem(DM_PEERS_STORAGE_KEY, serialized);
  } catch {
    // Ignore storage failures.
  }
}

export interface RoomWithDetails extends Room {
  members: (RoomMember & { profile: Profile })[];
  last_message_content?: string | null;
  last_message_at?: string | null;
  last_message_author_id?: string | null;
}

interface RoomsState {
  rooms: RoomWithDetails[];
  dmPeerByRoomId: Map<string, string>;
  unreadByRoom: Map<string, number>;
  activeRoomId: string | null;
  loading: boolean;

  // Derived
  activeRoom: () => RoomWithDetails | null;
  dmRooms: () => RoomWithDetails[];
  groupRooms: () => RoomWithDetails[];

  // Actions
  fetchRooms: () => Promise<void>;
  setActiveRoom: (roomId: string | null) => void;
  markRoomRead: (roomId: string | null) => void;
  setDmPeer: (roomId: string, userId: string) => void;
  createGroup: (name: string, memberIds: string[]) => Promise<string>;

  // Realtime
  subscribeToChanges: (userId: string) => () => void;
}

export const useRoomsStore = create<RoomsState>((set, get) => ({
  rooms: [],
  dmPeerByRoomId: readStoredDmPeers(),
  unreadByRoom: new Map(),
  activeRoomId: null,
  loading: true,

  activeRoom: () => {
    const { rooms, activeRoomId } = get();
    return rooms.find((r) => r.id === activeRoomId) ?? null;
  },

  dmRooms: () => get().rooms.filter((r) => r.type === "dm"),
  groupRooms: () => get().rooms.filter((r) => r.type === "group"),

  fetchRooms: async () => {
    set({ loading: true });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Get all rooms where user is a member, with members + profiles
    const { data: memberships } = await supabase
      .from("room_members")
      .select("room_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      cleanupMessageDraftsForRooms(user.id, []);
      set({ rooms: [], unreadByRoom: new Map(), loading: false });
      return;
    }

    const roomIds = memberships.map((m) => m.room_id);

    const { data: rooms } = await supabase
      .from("rooms")
      .select("*")
      .in("id", roomIds);

    // Get all members for these rooms with their profiles
    const { data: members } = await supabase
      .from("room_members")
      .select("*, profile:profiles(*)")
      .in("room_id", roomIds);

    const { data: latestMessages } = await supabase
      .from("messages")
      .select("room_id, author_id, content, created_at")
      .in("room_id", roomIds)
      .order("created_at", { ascending: false });

    const latestByRoom = new Map<
      string,
      { author_id: string; content: string; created_at: string }
    >();

    for (const message of latestMessages ?? []) {
      if (!latestByRoom.has(message.room_id)) {
        latestByRoom.set(message.room_id, {
          author_id: message.author_id,
          content: message.content,
          created_at: message.created_at,
        });
      }
    }

    const roomsWithDetails: RoomWithDetails[] = (rooms ?? [])
      .map((room) => ({
        ...room,
        members: (members ?? []).filter((m) => m.room_id === room.id) as (RoomMember & {
          profile: Profile;
        })[],
        last_message_content: latestByRoom.get(room.id)?.content ?? null,
        last_message_at: latestByRoom.get(room.id)?.created_at ?? null,
        last_message_author_id: latestByRoom.get(room.id)?.author_id ?? null,
      }))
      .sort((a, b) => roomActivityTimestamp(b) - roomActivityTimestamp(a));

    cleanupMessageDraftsForRooms(user.id, roomsWithDetails.map((room) => room.id));

    const { dmPeerByRoomId } = get();
    const { unreadByRoom } = get();
    const validRoomIds = new Set(roomsWithDetails.map((room) => room.id));
    const nextDmPeers = new Map(dmPeerByRoomId);
    const nextUnreadByRoom = new Map(unreadByRoom);

    nextDmPeers.forEach((_, roomId) => {
      if (!validRoomIds.has(roomId)) {
        nextDmPeers.delete(roomId);
      }
    });

    nextUnreadByRoom.forEach((_, roomId) => {
      if (!validRoomIds.has(roomId)) {
        nextUnreadByRoom.delete(roomId);
      }
    });

    writeStoredDmPeers(nextDmPeers);

    set({
      rooms: roomsWithDetails,
      dmPeerByRoomId: nextDmPeers,
      unreadByRoom: nextUnreadByRoom,
      loading: false,
    });
  },

  setActiveRoom: (roomId) => {
    get().markRoomRead(roomId);
    set({ activeRoomId: roomId });
  },

  markRoomRead: (roomId) => {
    if (!roomId) return;
    set((state) => {
      if (!state.unreadByRoom.get(roomId)) return state;
      const nextUnreadByRoom = new Map(state.unreadByRoom);
      nextUnreadByRoom.delete(roomId);
      return { unreadByRoom: nextUnreadByRoom };
    });
  },

  setDmPeer: (roomId, userId) => {
    set((state) => {
      const nextDmPeers = new Map(state.dmPeerByRoomId);
      nextDmPeers.set(roomId, userId);
      writeStoredDmPeers(nextDmPeers);
      return { dmPeerByRoomId: nextDmPeers };
    });
  },

  createGroup: async (name, memberIds) => {
    const { data, error } = await supabase.rpc("create_group", {
      group_name: name,
      member_ids: memberIds,
    });
    if (error) throw error;
    await get().fetchRooms();
    return (data as { room_id: string }).room_id;
  },

  subscribeToChanges: (userId) => {
    let fallbackPollTimer: ReturnType<typeof setInterval> | null = null;

    const startFallbackPolling = () => {
      if (fallbackPollTimer) return;
      void get().fetchRooms();
      fallbackPollTimer = setInterval(() => {
        void get().fetchRooms();
      }, 5000);
    };

    const stopFallbackPolling = () => {
      if (!fallbackPollTimer) return;
      clearInterval(fallbackPollTimer);
      fallbackPollTimer = null;
    };

    const channel = supabase
      .channel(`rooms-changes:${userId}`)
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const eventType = payload.eventType;
          const inserted = payload.new as { room_id?: string; author_id?: string };

          if (
            eventType === "INSERT" &&
            inserted?.room_id &&
            inserted.author_id &&
            inserted.author_id !== userId &&
            inserted.room_id !== get().activeRoomId
          ) {
            set((state) => {
              const nextUnreadByRoom = new Map(state.unreadByRoom);
              const current = nextUnreadByRoom.get(inserted.room_id!) ?? 0;
              nextUnreadByRoom.set(inserted.room_id!, current + 1);
              return { unreadByRoom: nextUnreadByRoom };
            });
          }

          get().fetchRooms();
        }
      )
      .subscribe((status, error) => {
        if (shouldLogRealtime) {
          if (error) {
            console.error(`[Realtime] rooms:${userId} -> ${status}`, error);
          } else {
            console.info(`[Realtime] rooms:${userId} -> ${status}`);
          }
        }

        if (status === "SUBSCRIBED") {
          stopFallbackPolling();
          return;
        }

        if (
          status === "TIMED_OUT" ||
          status === "CHANNEL_ERROR" ||
          status === "CLOSED"
        ) {
          startFallbackPolling();
        }
      });

    return () => {
      stopFallbackPolling();
      supabase.removeChannel(channel);
    };
  },
}));

import { create } from "zustand";
import type { RelationshipWithProfile } from "@datchat/shared";
import { RelationshipType } from "@datchat/shared";
import { supabase } from "@/lib/supabase";

const shouldLogRealtime = import.meta.env.VITE_REALTIME_DEBUG === "true";

function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; message?: string };
  return (
    candidate.name === "AbortError" ||
    candidate.message?.toLowerCase().includes("aborted") === true
  );
}

interface FriendsState {
  relationships: RelationshipWithProfile[];
  loading: boolean;

  // Derived
  friends: () => RelationshipWithProfile[];
  incoming: () => RelationshipWithProfile[];
  outgoing: () => RelationshipWithProfile[];
  blocked: () => RelationshipWithProfile[];

  // Actions
  fetchRelationships: () => Promise<void>;
  sendRequest: (username: string) => Promise<void>;
  acceptRequest: (fromUserId: string) => Promise<{ room_id: string }>;
  rejectRequest: (fromUserId: string) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;

  // Realtime
  subscribeToChanges: (userId: string) => () => void;
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  relationships: [],
  loading: true,

  friends: () =>
    get().relationships.filter((r) => r.type === RelationshipType.FRIENDS),
  incoming: () =>
    get().relationships.filter((r) => r.type === RelationshipType.INCOMING),
  outgoing: () =>
    get().relationships.filter((r) => r.type === RelationshipType.OUTGOING),
  blocked: () =>
    get().relationships.filter((r) => r.type === RelationshipType.BLOCKED),

  fetchRelationships: async () => {
    set({ loading: true });

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        set({ relationships: [], loading: false });
        return;
      }

      // Fetch all relationships where we're the from_id, with the target profile
      const { data, error } = await supabase
        .from("relationships")
        .select("*, profile:profiles!relationships_to_id_fkey(*)")
        .eq("from_id", user.id);

      if (error) {
        if (!isAbortError(error)) {
          console.error("Failed to fetch relationships:", error);
        }
        set({ loading: false });
        return;
      }

      set({
        relationships: (data ?? []) as RelationshipWithProfile[],
        loading: false,
      });
    } catch (error) {
      if (!isAbortError(error)) {
        console.error("Failed to fetch relationships:", error);
      }
      set({ loading: false });
    }
  },

  sendRequest: async (username) => {
    const { error } = await supabase.rpc("send_friend_request", {
      target_username: username,
    });
    if (error) throw error;
    await get().fetchRelationships();
  },

  acceptRequest: async (fromUserId) => {
    const { data, error } = await supabase.rpc("accept_friend_request", {
      from_user_id: fromUserId,
    });
    if (error) throw error;
    await get().fetchRelationships();
    return data as { status: string; friend_id: string; room_id: string };
  },

  rejectRequest: async (fromUserId) => {
    const { error } = await supabase.rpc("reject_friend_request", {
      from_user_id: fromUserId,
    });
    if (error) throw error;
    await get().fetchRelationships();
  },

  removeFriend: async (friendId) => {
    const { error } = await supabase.rpc("remove_friend", {
      friend_id: friendId,
    });
    if (error) throw error;
    await get().fetchRelationships();
  },

  blockUser: async (userId) => {
    const { error } = await supabase.rpc("block_user", {
      target_user_id: userId,
    });
    if (error) throw error;
    await get().fetchRelationships();
  },

  unblockUser: async (userId) => {
    const { error } = await supabase.rpc("unblock_user", {
      target_user_id: userId,
    });
    if (error) throw error;
    await get().fetchRelationships();
  },

  subscribeToChanges: (userId) => {
    let fallbackPollTimer: ReturnType<typeof setInterval> | null = null;

    const startFallbackPolling = () => {
      if (fallbackPollTimer) return;
      void get().fetchRelationships();
      fallbackPollTimer = setInterval(() => {
        void get().fetchRelationships();
      }, 5000);
    };

    const stopFallbackPolling = () => {
      if (!fallbackPollTimer) return;
      clearInterval(fallbackPollTimer);
      fallbackPollTimer = null;
    };

    const channel = supabase
      .channel(`relationships-changes:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "relationships",
          filter: `from_id=eq.${userId}`,
        },
        () => {
          // Re-fetch all relationships on any change
          get().fetchRelationships();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "relationships",
          filter: `to_id=eq.${userId}`,
        },
        () => {
          get().fetchRelationships();
        }
      )
      .subscribe((status, error) => {
        if (shouldLogRealtime) {
          if (error) {
            console.error(
              `[Realtime] relationships:${userId} -> ${status}`,
              error
            );
          } else {
            console.info(`[Realtime] relationships:${userId} -> ${status}`);
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

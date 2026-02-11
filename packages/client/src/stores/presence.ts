import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { UserStatus } from "@datchat/shared";
import { supabase } from "@/lib/supabase";

export type StatusMode = "online" | "auto" | "dnd" | "invisible";

const shouldLogRealtime = import.meta.env.VITE_REALTIME_DEBUG === "true";
const STATUS_MODE_STORAGE_KEY = "datchat.statusMode";
let activePresenceChannel: RealtimeChannel | null = null;

function readStoredStatusMode(): StatusMode {
  if (typeof window === "undefined") return "online";

  const raw = window.localStorage.getItem(STATUS_MODE_STORAGE_KEY);
  if (raw === "online" || raw === "auto" || raw === "dnd" || raw === "invisible") {
    return raw;
  }
  return "online";
}

function writeStoredStatusMode(mode: StatusMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STATUS_MODE_STORAGE_KEY, mode);
}

function modeToStatus(mode: StatusMode): UserStatus {
  if (mode === "dnd") return "dnd";
  if (mode === "invisible") return "offline";
  return "online";
}

interface PresenceState {
  presenceByUser: Map<string, UserStatus>;
  myStatus: UserStatus;
  statusMode: StatusMode;

  setMyStatus: (status: UserStatus, targetUserId?: string) => Promise<void>;
  setStatusMode: (mode: StatusMode) => Promise<void>;
  subscribeToPresence: (userId: string) => () => void;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  presenceByUser: new Map(),
  myStatus: "online",
  statusMode: readStoredStatusMode(),

  setMyStatus: async (status, targetUserId) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const currentUserId = user?.id ?? null;
    const userIdToUpdate = targetUserId ?? currentUserId;
    if (!userIdToUpdate) return;

    if (!targetUserId || targetUserId === currentUserId) {
      set({ myStatus: status });
    }

    await supabase.from("profiles").update({ status }).eq("id", userIdToUpdate);

    if (activePresenceChannel && currentUserId === userIdToUpdate) {
      await activePresenceChannel.track({ status });
    }
  },

  setStatusMode: async (mode) => {
    writeStoredStatusMode(mode);
    set({ statusMode: mode });

    const status = modeToStatus(mode);
    await get().setMyStatus(status);
  },

  subscribeToPresence: (userId) => {
    set({ presenceByUser: new Map() });

    const channel = supabase.channel(`global-presence:${userId}`, {
      config: { presence: { key: userId } },
    });
    activePresenceChannel = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const nextPresenceByUser = new Map<string, UserStatus>();

        Object.entries(state).forEach(([key, presences]) => {
          const presence = presences[0] as unknown as { status?: UserStatus };
          nextPresenceByUser.set(key, presence.status ?? "online");
        });

        set({ presenceByUser: nextPresenceByUser });
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        const presence = newPresences[0] as unknown as { status?: UserStatus };
        set((state) => {
          const nextPresenceByUser = new Map(state.presenceByUser);
          nextPresenceByUser.set(key, presence.status ?? "online");
          return { presenceByUser: nextPresenceByUser };
        });
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        set((state) => {
          const nextPresenceByUser = new Map(state.presenceByUser);
          nextPresenceByUser.set(key, "offline");
          return { presenceByUser: nextPresenceByUser };
        });
      })
      .subscribe(async (status) => {
        if (shouldLogRealtime) {
          console.info(`[Realtime] presence:${userId} -> ${status}`);
        }

        if (status === "SUBSCRIBED") {
          await channel.track({ status: get().myStatus });
        }
      });

    return () => {
      if (activePresenceChannel === channel) {
        activePresenceChannel = null;
      }
      void channel.untrack();
      supabase.removeChannel(channel);
      set({ presenceByUser: new Map() });
    };
  },
}));

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/auth";
import { useFriendsStore } from "@/stores/friends";
import { useRoomsStore } from "@/stores/rooms";
import { usePresenceStore } from "@/stores/presence";
import { useVoiceStore } from "@/stores/voice";
import { Sidebar } from "./Sidebar";
import { ChatArea } from "./ChatArea";
import { MemberPanel } from "./MemberPanel";
import { VoicePanel } from "../voice/VoicePanel";

const shouldLogRealtime = import.meta.env.VITE_REALTIME_DEBUG === "true";

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const fetchRelationships = useFriendsStore((s) => s.fetchRelationships);
  const subscribeToFriendChanges = useFriendsStore(
    (s) => s.subscribeToChanges
  );
  const fetchRooms = useRoomsStore((s) => s.fetchRooms);
  const subscribeToRoomChanges = useRoomsStore((s) => s.subscribeToChanges);
  const subscribeToPresence = usePresenceStore((s) => s.subscribeToPresence);
  const setMyStatus = usePresenceStore((s) => s.setMyStatus);
  const statusMode = usePresenceStore((s) => s.statusMode);
  const leaveVoice = useVoiceStore((s) => s.leaveVoice);
  const currentVoiceRoomId = useVoiceStore((s) => s.currentRoomId);
  const activeRoom = useRoomsStore((s) => s.activeRoom);
  const activeRoomId = useRoomsStore((s) => s.activeRoomId);
  const showMemberPanel = !!activeRoomId && activeRoom()?.type === "group";
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;

    fetchRelationships();
    fetchRooms();

    const unsubFriends = subscribeToFriendChanges(user.id);
    const unsubRooms = subscribeToRoomChanges(user.id);
    const unsubPresence = subscribeToPresence(user.id);

    if (shouldLogRealtime) {
      console.info("[Realtime] subscriptions mounted", { userId: user.id });
    }

    return () => {
      if (shouldLogRealtime) {
        console.info("[Realtime] subscriptions cleaned up", { userId: user.id });
      }
      unsubFriends();
      unsubRooms();
      unsubPresence();
      void setMyStatus("offline", user.id);
    };
  }, [
    user,
    fetchRelationships,
    fetchRooms,
    subscribeToFriendChanges,
    subscribeToRoomChanges,
    subscribeToPresence,
    setMyStatus,
  ]);

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    const currentUserId = user?.id ?? null;

    if (
      currentVoiceRoomId &&
      ((previousUserId && currentUserId && previousUserId !== currentUserId) ||
        (!currentUserId && !!previousUserId))
    ) {
      leaveVoice();
    }

    previousUserIdRef.current = currentUserId;
  }, [user?.id, currentVoiceRoomId, leaveVoice]);

  useEffect(() => {
    const teardownVoice = () => {
      const { currentRoomId } = useVoiceStore.getState();
      if (currentRoomId) {
        useVoiceStore.getState().leaveVoice();
      }
    };

    window.addEventListener("beforeunload", teardownVoice);
    window.addEventListener("pagehide", teardownVoice);

    return () => {
      window.removeEventListener("beforeunload", teardownVoice);
      window.removeEventListener("pagehide", teardownVoice);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    if (statusMode === "auto") return;

    const nextStatus =
      statusMode === "dnd"
        ? "dnd"
        : statusMode === "invisible"
          ? "offline"
          : "online";

    void setMyStatus(nextStatus);
  }, [user, statusMode, setMyStatus]);

  useEffect(() => {
    if (!user || statusMode !== "auto") return;

    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let lastOnlineUpdateAt = 0;

    const setIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      idleTimer = setTimeout(() => {
        void setMyStatus("idle");
      }, 5 * 60 * 1000);
    };

    const markActive = () => {
      const now = Date.now();
      if (now - lastOnlineUpdateAt > 15_000) {
        lastOnlineUpdateAt = now;
        void setMyStatus("online");
      }
      setIdleTimer();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        markActive();
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "click",
      "keydown",
      "mousedown",
      "mousemove",
      "scroll",
      "touchstart",
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, markActive, { passive: true });
    });
    document.addEventListener("visibilitychange", onVisibilityChange);

    markActive();

    return () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, markActive);
      });
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user, statusMode, setMyStatus]);

  return (
    <div className="flex h-full w-full flex-col">
      {/* Main content area */}
      <div className="flex min-h-0 flex-1">
        {/* Left sidebar — rooms/DMs/friends */}
        <Sidebar />

        {/* Center — chat or friends view */}
        <div className="flex min-w-0 flex-1">
          <ChatArea />
        </div>

        {/* Right panel — members (only when a room is active) */}
        {showMemberPanel && <MemberPanel />}
      </div>

      {/* Bottom voice panel (shows when in voice) */}
      <VoicePanel />
    </div>
  );
}

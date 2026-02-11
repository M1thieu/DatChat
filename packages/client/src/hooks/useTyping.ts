import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { TYPING_TIMEOUT } from "@datchat/shared";

const shouldLogRealtime = import.meta.env.VITE_REALTIME_DEBUG === "true";
const TYPING_BROADCAST_THROTTLE_MS = 1200;
const TYPING_STOP_DELAY_MS = 3000;

export function useTyping(roomId: string) {
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const profile = useAuthStore((s) => s.profile);
  const timeoutRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const stopTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const isTypingRef = useRef(false);
  const lastTypingSentAtRef = useRef(0);

  const clearRemoteTypingUser = useCallback((userId: string) => {
    if (timeoutRefs.current[userId]) {
      clearTimeout(timeoutRefs.current[userId]);
      delete timeoutRefs.current[userId];
    }

    setTypingUsers((prev) => {
      if (!prev[userId]) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }, []);

  const sendTypingState = useCallback((typing: boolean, force = false) => {
    const channel = channelRef.current;
    if (!profile || !channel || !subscribedRef.current) {
      if (!typing) {
        isTypingRef.current = false;
      }
      return;
    }

    const now = Date.now();
    if (typing) {
      if (
        !force &&
        isTypingRef.current &&
        now - lastTypingSentAtRef.current < TYPING_BROADCAST_THROTTLE_MS
      ) {
        return;
      }
    } else if (!force && !isTypingRef.current) {
      return;
    }

    isTypingRef.current = typing;
    lastTypingSentAtRef.current = now;

    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: {
        user_id: profile.id,
        username: profile.username,
        typing,
      },
    });
  }, [profile]);

  const stopTyping = useCallback((force = false) => {
    if (stopTypingTimerRef.current) {
      clearTimeout(stopTypingTimerRef.current);
      stopTypingTimerRef.current = null;
    }

    sendTypingState(false, force);
  }, [sendTypingState]);

  useEffect(() => {
    if (!roomId || !profile) return;

    const channel = supabase.channel(`typing:${roomId}`, {
      config: { broadcast: { self: true } },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "typing" }, (payload) => {
        const { user_id, username, typing } = payload.payload as {
          user_id: string;
          username: string;
          typing?: boolean;
        };

        if (user_id === profile.id) return;

        if (typing === false) {
          clearRemoteTypingUser(user_id);
          return;
        }

        setTypingUsers((prev) => ({ ...prev, [user_id]: username }));

        if (timeoutRefs.current[user_id]) {
          clearTimeout(timeoutRefs.current[user_id]);
        }

        timeoutRefs.current[user_id] = setTimeout(() => {
          clearRemoteTypingUser(user_id);
        }, TYPING_TIMEOUT);
      })
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          subscribedRef.current = true;
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          subscribedRef.current = false;
        }

        if (shouldLogRealtime) {
          if (error) {
            console.error(`[Realtime] typing:${roomId} -> ${status}`, error);
          } else {
            console.info(`[Realtime] typing:${roomId} -> ${status}`);
          }
        }
      });

    return () => {
      stopTyping(true);
      Object.values(timeoutRefs.current).forEach(clearTimeout);
      timeoutRefs.current = {};
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
      subscribedRef.current = false;
      isTypingRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [roomId, profile, clearRemoteTypingUser, stopTyping]);

  const notifyTypingActivity = useCallback((hasContent = true) => {
    if (!hasContent) {
      stopTyping();
      return;
    }

    sendTypingState(true);

    if (stopTypingTimerRef.current) {
      clearTimeout(stopTypingTimerRef.current);
    }
    stopTypingTimerRef.current = setTimeout(() => {
      stopTyping();
    }, TYPING_STOP_DELAY_MS);
  }, [sendTypingState, stopTyping]);

  return { typingUsers: Object.values(typingUsers), notifyTypingActivity, stopTyping };
}

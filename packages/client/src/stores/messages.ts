import { create } from "zustand";
import type {
  Message,
  MessageEmbed,
  MessageReaction,
  MessageWithAuthor,
} from "@datchat/shared";
import { MESSAGES_PER_PAGE } from "@datchat/shared";
import { supabase } from "@/lib/supabase";

const shouldLogRealtime = import.meta.env.VITE_REALTIME_DEBUG === "true";
const URL_REGEX = /\bhttps?:\/\/[^\s<>()]+/gi;
const MAX_UNFURL_URLS_PER_MESSAGE = 3;
let hasWarnedMissingPinsTable = false;

function isMissingMessagePinsTableError(error: unknown): boolean {
  const err = error as {
    code?: string;
    status?: number;
    statusCode?: number;
    hint?: string;
    message?: string;
    details?: string;
  };
  const status = Number(err?.status ?? err?.statusCode ?? 0);
  const message = `${err?.message ?? ""} ${err?.details ?? ""}`.toLowerCase();
  const hint = `${err?.hint ?? ""}`.toLowerCase();

  return (
    status === 404 ||
    err?.code === "42P01" ||
    err?.code === "PGRST205" ||
    (hint.includes("schema cache") && message.includes("message_pins")) ||
    (message.includes("message_pins") &&
      (message.includes("does not exist") ||
        message.includes("not found") ||
        message.includes("could not find the table")))
  );
}

function dedupeMessages(messages: MessageWithAuthor[]) {
  const seen = new Set<string>();
  return messages.filter((message) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
}

function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX) ?? [];
  const unique = new Set<string>();

  for (const rawUrl of matches) {
    const cleaned = rawUrl.replace(/[),.;!?]+$/g, "");
    if (!cleaned) continue;
    unique.add(cleaned);
    if (unique.size >= MAX_UNFURL_URLS_PER_MESSAGE) break;
  }

  return [...unique];
}

async function triggerUnfurlForMessage(messageId: string, content: string): Promise<void> {
  const urls = extractUrls(content);
  if (urls.length === 0) return;

  await Promise.all(
    urls.map(async (url) => {
      try {
        await supabase.functions.invoke("unfurl-link", {
          body: {
            url,
            message_id: messageId,
          },
        });
      } catch (error) {
        if (shouldLogRealtime) {
          console.warn("Unfurl request failed", { messageId, url, error });
        }
      }
    })
  );
}

export interface ReplyTarget {
  messageId: string;
  roomId: string;
  authorName: string;
  content: string;
}

interface MessagePinRow {
  room_id: string;
  message_id: string;
  created_at: string;
}

interface MessagesState {
  messagesByRoom: Map<string, MessageWithAuthor[]>;
  reactionsByMessage: Map<string, MessageReaction[]>;
  embedsByMessage: Map<string, MessageEmbed[]>;
  pinnedMessagesByRoom: Map<string, MessageWithAuthor[]>;
  pinsAvailable: boolean;
  replyTargetByRoom: Map<string, ReplyTarget>;
  hasMore: Map<string, boolean>;
  loading: boolean;
  sending: boolean;

  fetchMessages: (roomId: string, before?: string) => Promise<void>;
  fetchReactionsForMessages: (messageIds: string[]) => Promise<void>;
  fetchEmbedsForMessages: (messageIds: string[]) => Promise<void>;
  fetchPinnedMessagesForRoom: (roomId: string) => Promise<void>;
  sendMessage: (roomId: string, content: string, replyToId?: string) => Promise<void>;
  setReplyTarget: (roomId: string, message: MessageWithAuthor) => void;
  clearReplyTarget: (roomId: string) => void;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  pinMessage: (roomId: string, messageId: string) => Promise<void>;
  unpinMessage: (roomId: string, messageId: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string, roomId: string) => Promise<void>;

  subscribeToRoom: (roomId: string) => () => void;
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  messagesByRoom: new Map(),
  reactionsByMessage: new Map(),
  embedsByMessage: new Map(),
  pinnedMessagesByRoom: new Map(),
  pinsAvailable: true,
  replyTargetByRoom: new Map(),
  hasMore: new Map(),
  loading: false,
  sending: false,

  fetchMessages: async (roomId, before) => {
    set({ loading: true });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      set({ loading: false });
      return;
    }

    let query = supabase
      .from("messages")
      .select("*, author:profiles!messages_author_id_fkey(*)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(MESSAGES_PER_PAGE);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to fetch messages:", error);
      set({ loading: false });
      return;
    }

    const messages = ((data ?? []) as MessageWithAuthor[]).reverse();
    const { messagesByRoom, hasMore } = get();
    const existing = messagesByRoom.get(roomId) ?? [];
    const nextMessagesByRoom = new Map(messagesByRoom);

    if (before) {
      nextMessagesByRoom.set(roomId, dedupeMessages([...messages, ...existing]));
    } else {
      nextMessagesByRoom.set(roomId, messages);
    }

    const nextHasMore = new Map(hasMore);
    nextHasMore.set(roomId, messages.length === MESSAGES_PER_PAGE);

    const roomMessages = nextMessagesByRoom.get(roomId) ?? [];

    set({
      messagesByRoom: nextMessagesByRoom,
      hasMore: nextHasMore,
      loading: false,
    });

    const messageIds = roomMessages.map((message) => message.id);
    if (messageIds.length > 0) {
      await Promise.all([
        get().fetchReactionsForMessages(messageIds),
        get().fetchEmbedsForMessages(messageIds),
      ]);
    }

    await get().fetchPinnedMessagesForRoom(roomId);
  },

  fetchReactionsForMessages: async (messageIds) => {
    const uniqueMessageIds = [...new Set(messageIds)].filter(Boolean);
    if (uniqueMessageIds.length === 0) return;

    const { data, error } = await supabase
      .from("message_reactions")
      .select("*")
      .in("message_id", uniqueMessageIds);

    if (error) {
      console.error("Failed to fetch reactions:", error);
      return;
    }

    const groupedByMessage = new Map<string, MessageReaction[]>();
    uniqueMessageIds.forEach((messageId) => groupedByMessage.set(messageId, []));

    for (const reaction of (data ?? []) as MessageReaction[]) {
      const existing = groupedByMessage.get(reaction.message_id) ?? [];
      groupedByMessage.set(reaction.message_id, [...existing, reaction]);
    }

    set((state) => {
      const nextReactions = new Map(state.reactionsByMessage);
      uniqueMessageIds.forEach((messageId) => {
        nextReactions.set(messageId, groupedByMessage.get(messageId) ?? []);
      });
      return { reactionsByMessage: nextReactions };
    });
  },

  fetchEmbedsForMessages: async (messageIds) => {
    const uniqueMessageIds = [...new Set(messageIds)].filter(Boolean);
    if (uniqueMessageIds.length === 0) return;

    const { data, error } = await supabase
      .from("message_embeds")
      .select("*")
      .in("message_id", uniqueMessageIds);

    if (error) {
      console.error("Failed to fetch embeds:", error);
      return;
    }

    const groupedByMessage = new Map<string, MessageEmbed[]>();
    uniqueMessageIds.forEach((messageId) => groupedByMessage.set(messageId, []));

    for (const embed of (data ?? []) as MessageEmbed[]) {
      const existing = groupedByMessage.get(embed.message_id) ?? [];
      groupedByMessage.set(embed.message_id, [...existing, embed]);
    }

    set((state) => {
      const nextEmbeds = new Map(state.embedsByMessage);
      uniqueMessageIds.forEach((messageId) => {
        nextEmbeds.set(messageId, groupedByMessage.get(messageId) ?? []);
      });
      return { embedsByMessage: nextEmbeds };
    });
  },

  fetchPinnedMessagesForRoom: async (roomId) => {
    if (!get().pinsAvailable) return;

    const { data: pinRows, error: pinsError } = await supabase
      .from("message_pins")
      .select("room_id, message_id, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false });

    if (pinsError) {
      if (isMissingMessagePinsTableError(pinsError)) {
        if (!hasWarnedMissingPinsTable) {
          hasWarnedMissingPinsTable = true;
          console.warn(
            "Pinned messages are unavailable: missing `message_pins` table on this database. Run the new migration."
          );
        }
        set((state) => {
          const nextPinned = new Map(state.pinnedMessagesByRoom);
          nextPinned.set(roomId, []);
          return {
            pinsAvailable: false,
            pinnedMessagesByRoom: nextPinned,
          };
        });
        return;
      }
      console.error("Failed to fetch pinned messages:", pinsError);
      return;
    }

    const rows = (pinRows ?? []) as MessagePinRow[];
    if (rows.length === 0) {
      set((state) => {
        const nextPinned = new Map(state.pinnedMessagesByRoom);
        nextPinned.set(roomId, []);
        return { pinnedMessagesByRoom: nextPinned };
      });
      return;
    }

    const orderedMessageIds = rows.map((row) => row.message_id);
    const { data: messagesData, error: messagesError } = await supabase
      .from("messages")
      .select("*, author:profiles!messages_author_id_fkey(*)")
      .in("id", orderedMessageIds);

    if (messagesError) {
      console.error("Failed to fetch pinned message details:", messagesError);
      return;
    }

    const byId = new Map<string, MessageWithAuthor>();
    for (const message of (messagesData ?? []) as MessageWithAuthor[]) {
      byId.set(message.id, message);
    }

    const orderedMessages = orderedMessageIds
      .map((messageId) => byId.get(messageId))
      .filter((message): message is MessageWithAuthor => Boolean(message));

    set((state) => {
      const nextPinned = new Map(state.pinnedMessagesByRoom);
      nextPinned.set(roomId, orderedMessages);
      return { pinnedMessagesByRoom: nextPinned };
    });
  },

  sendMessage: async (roomId, content, replyToId) => {
    set({ sending: true });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      set({ sending: false });
      return;
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        room_id: roomId,
        author_id: user.id,
        content,
        reply_to_id: replyToId ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to send message:", error);
      set({ sending: false });
      return;
    }

    set({ sending: false });

    const messageId = data?.id as string | undefined;
    if (messageId) {
      void triggerUnfurlForMessage(messageId, content);
    }
  },

  setReplyTarget: (roomId, message) => {
    const authorName =
      message.author?.display_name ??
      message.author_display_name_snapshot ??
      message.author?.username ??
      message.author_username_snapshot ??
      "Unknown";
    const previewContent = message.content.replace(/\s+/g, " ").trim();

    set((state) => {
      const nextTargets = new Map(state.replyTargetByRoom);
      nextTargets.set(roomId, {
        messageId: message.id,
        roomId,
        authorName,
        content: previewContent,
      });
      return { replyTargetByRoom: nextTargets };
    });
  },

  clearReplyTarget: (roomId) => {
    set((state) => {
      if (!state.replyTargetByRoom.has(roomId)) return state;
      const nextTargets = new Map(state.replyTargetByRoom);
      nextTargets.delete(roomId);
      return { replyTargetByRoom: nextTargets };
    });
  },

  toggleReaction: async (messageId, emoji) => {
    const normalizedEmoji = emoji.trim();
    if (!normalizedEmoji) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existingRows, error: existingError } = await supabase
      .from("message_reactions")
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", user.id)
      .eq("emoji", normalizedEmoji)
      .limit(1);

    if (existingError) throw existingError;

    if ((existingRows ?? []).length > 0) {
      const reactionId = existingRows![0].id as string;
      const { error } = await supabase
        .from("message_reactions")
        .delete()
        .eq("id", reactionId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("message_reactions").insert({
        message_id: messageId,
        user_id: user.id,
        emoji: normalizedEmoji,
      });
      if (error) throw error;
    }

    await get().fetchReactionsForMessages([messageId]);
  },

  pinMessage: async (roomId, messageId) => {
    if (!get().pinsAvailable) {
      throw new Error("Pinned messages are unavailable on this database.");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("message_pins").upsert(
      {
        room_id: roomId,
        message_id: messageId,
        pinned_by: user.id,
      },
      { onConflict: "room_id,message_id" }
    );

    if (error) {
      if (isMissingMessagePinsTableError(error)) {
        set({ pinsAvailable: false });
        throw new Error("Pinned messages are unavailable on this database.");
      }
      throw error;
    }

    await get().fetchPinnedMessagesForRoom(roomId);
  },

  unpinMessage: async (roomId, messageId) => {
    if (!get().pinsAvailable) {
      throw new Error("Pinned messages are unavailable on this database.");
    }

    const { error } = await supabase
      .from("message_pins")
      .delete()
      .eq("room_id", roomId)
      .eq("message_id", messageId);

    if (error) {
      if (isMissingMessagePinsTableError(error)) {
        set({ pinsAvailable: false });
        throw new Error("Pinned messages are unavailable on this database.");
      }
      throw error;
    }

    await get().fetchPinnedMessagesForRoom(roomId);
  },

  editMessage: async (messageId, content) => {
    const editedAt = new Date().toISOString();
    const { error } = await supabase
      .from("messages")
      .update({ content, edited_at: editedAt })
      .eq("id", messageId);

    if (error) throw error;

    const { messagesByRoom, pinnedMessagesByRoom } = get();
    const nextMessagesByRoom = new Map(messagesByRoom);
    nextMessagesByRoom.forEach((roomMessages, roomId) => {
      nextMessagesByRoom.set(
        roomId,
        roomMessages.map((message) =>
          message.id === messageId
            ? { ...message, content, edited_at: editedAt }
            : message
        )
      );
    });

    const nextPinnedMessagesByRoom = new Map(pinnedMessagesByRoom);
    nextPinnedMessagesByRoom.forEach((roomMessages, roomId) => {
      nextPinnedMessagesByRoom.set(
        roomId,
        roomMessages.map((message) =>
          message.id === messageId
            ? { ...message, content, edited_at: editedAt }
            : message
        )
      );
    });

    set({
      messagesByRoom: nextMessagesByRoom,
      pinnedMessagesByRoom: nextPinnedMessagesByRoom,
    });
  },

  deleteMessage: async (messageId, roomId) => {
    const { error } = await supabase.from("messages").delete().eq("id", messageId);
    if (error) throw error;

    const {
      messagesByRoom,
      reactionsByMessage,
      embedsByMessage,
      pinnedMessagesByRoom,
      replyTargetByRoom,
    } = get();
    const nextMessagesByRoom = new Map(messagesByRoom);
    const roomMessages = nextMessagesByRoom.get(roomId) ?? [];
    nextMessagesByRoom.set(
      roomId,
      roomMessages.filter((message) => message.id !== messageId)
    );

    const nextReactions = new Map(reactionsByMessage);
    nextReactions.delete(messageId);

    const nextEmbeds = new Map(embedsByMessage);
    nextEmbeds.delete(messageId);

    const nextPinned = new Map(pinnedMessagesByRoom);
    nextPinned.set(
      roomId,
      (nextPinned.get(roomId) ?? []).filter((message) => message.id !== messageId)
    );

    const nextReplyTargets = new Map(replyTargetByRoom);
    nextReplyTargets.forEach((target, targetRoomId) => {
      if (target.messageId === messageId) {
        nextReplyTargets.delete(targetRoomId);
      }
    });

    set({
      messagesByRoom: nextMessagesByRoom,
      reactionsByMessage: nextReactions,
      embedsByMessage: nextEmbeds,
      pinnedMessagesByRoom: nextPinned,
      replyTargetByRoom: nextReplyTargets,
    });
  },

  subscribeToRoom: (roomId) => {
    let fallbackPollTimer: ReturnType<typeof setInterval> | null = null;

    const startFallbackPolling = () => {
      if (fallbackPollTimer) return;
      void get().fetchMessages(roomId);
      fallbackPollTimer = setInterval(() => {
        void get().fetchMessages(roomId);
      }, 4000);
    };

    const stopFallbackPolling = () => {
      if (!fallbackPollTimer) return;
      clearInterval(fallbackPollTimer);
      fallbackPollTimer = null;
    };

    const channel = supabase
      .channel(`messages:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const newMessage = payload.new as Message;

          const { data: author } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", newMessage.author_id)
            .single();

          if (!author) {
            void get().fetchMessages(roomId);
            return;
          }

          const messageWithAuthor: MessageWithAuthor = {
            ...newMessage,
            author,
          };

          const { messagesByRoom } = get();
          const roomMessages = messagesByRoom.get(roomId) ?? [];
          if (roomMessages.some((message) => message.id === newMessage.id)) return;

          const nextMessagesByRoom = new Map(messagesByRoom);
          nextMessagesByRoom.set(roomId, [...roomMessages, messageWithAuthor]);
          set({ messagesByRoom: nextMessagesByRoom });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const updatedMessage = payload.new as Message;
          const { messagesByRoom, pinnedMessagesByRoom } = get();
          const roomMessages = messagesByRoom.get(roomId);
          if (!roomMessages) return;

          const nextMessagesByRoom = new Map(messagesByRoom);
          nextMessagesByRoom.set(
            roomId,
            roomMessages.map((message) =>
              message.id === updatedMessage.id
                ? { ...message, ...updatedMessage }
                : message
            )
          );

          const nextPinned = new Map(pinnedMessagesByRoom);
          nextPinned.set(
            roomId,
            (nextPinned.get(roomId) ?? []).map((message) =>
              message.id === updatedMessage.id
                ? { ...message, ...updatedMessage }
                : message
            )
          );

          set({
            messagesByRoom: nextMessagesByRoom,
            pinnedMessagesByRoom: nextPinned,
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const deletedMessage = payload.old as { id: string };
          const {
            messagesByRoom,
            reactionsByMessage,
            embedsByMessage,
            pinnedMessagesByRoom,
          } = get();
          const roomMessages = messagesByRoom.get(roomId);

          const nextReactions = new Map(reactionsByMessage);
          nextReactions.delete(deletedMessage.id);

          const nextEmbeds = new Map(embedsByMessage);
          nextEmbeds.delete(deletedMessage.id);

          const nextPinned = new Map(pinnedMessagesByRoom);
          nextPinned.set(
            roomId,
            (nextPinned.get(roomId) ?? []).filter(
              (message) => message.id !== deletedMessage.id
            )
          );

          if (!roomMessages) {
            set({
              reactionsByMessage: nextReactions,
              embedsByMessage: nextEmbeds,
              pinnedMessagesByRoom: nextPinned,
            });
            return;
          }

          const nextMessagesByRoom = new Map(messagesByRoom);
          nextMessagesByRoom.set(
            roomId,
            roomMessages.filter((message) => message.id !== deletedMessage.id)
          );
          set({
            messagesByRoom: nextMessagesByRoom,
            reactionsByMessage: nextReactions,
            embedsByMessage: nextEmbeds,
            pinnedMessagesByRoom: nextPinned,
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
        },
        () => {
          const roomMessages = get().messagesByRoom.get(roomId) ?? [];
          if (roomMessages.length === 0) return;
          void get().fetchReactionsForMessages(
            roomMessages.map((message) => message.id)
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_embeds",
        },
        () => {
          const roomMessages = get().messagesByRoom.get(roomId) ?? [];
          if (roomMessages.length === 0) return;
          void get().fetchEmbedsForMessages(
            roomMessages.map((message) => message.id)
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_pins",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void get().fetchPinnedMessagesForRoom(roomId);
        }
      )
      .subscribe((status, error) => {
        if (shouldLogRealtime) {
          if (error) {
            console.error(`[Realtime] messages:${roomId} -> ${status}`, error);
          } else {
            console.info(`[Realtime] messages:${roomId} -> ${status}`);
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

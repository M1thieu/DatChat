import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { useMessagesStore } from "@/stores/messages";
import { useAuthStore } from "@/stores/auth";
import { addToast } from "@/stores/toast";
import type { MessageEmbed, MessageReaction, MessageWithAuthor } from "@datchat/shared";

interface MessageListProps {
  roomId: string;
  searchQuery: string;
  jumpDate: string;
  pinnedPanelToggleSignal?: number;
}

interface GroupedReaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

interface ParsedSearchQuery {
  terms: string[];
  from: string[];
  mentions: string[];
  has: Set<string>;
  is: Set<string>;
  beforeDates: string[];
  afterDates: string[];
  onDates: string[];
}

const QUICK_REACTIONS = ["\u{1F602}", "\u{1F44D}", "\u{2764}\u{FE0F}", "\u{1F525}"];
const SEARCH_TOKEN_REGEX = /(?:[^\s"]+|"[^"]*")+/g;
const URL_IN_TEXT_REGEX = /\bhttps?:\/\/[^\s<>()]+/i;

function groupReactions(
  reactions: MessageReaction[],
  currentUserId?: string
): GroupedReaction[] {
  const grouped = new Map<string, GroupedReaction>();

  for (const reaction of reactions) {
    const existing = grouped.get(reaction.emoji);
    if (!existing) {
      grouped.set(reaction.emoji, {
        emoji: reaction.emoji,
        count: 1,
        reactedByMe: reaction.user_id === currentUserId,
      });
      continue;
    }

    existing.count += 1;
    if (reaction.user_id === currentUserId) {
      existing.reactedByMe = true;
    }
  }

  return [...grouped.values()].sort((a, b) => b.count - a.count);
}

function formatDateLabel(iso: string) {
  const date = new Date(iso);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d, yyyy");
}

function getEmbedHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getMessageSearchText(message: MessageWithAuthor): string {
  const author = getMessageAuthorDisplayName(message);
  return `${author} ${message.content}`.toLowerCase();
}

function getMessageAuthorDisplayName(message: MessageWithAuthor): string {
  return (
    message.author?.display_name ??
    message.author_display_name_snapshot ??
    message.author?.username ??
    message.author_username_snapshot ??
    "Unknown"
  );
}

function parseDateStart(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : null;
}

function stripWrappingQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

function parseSearchQuery(query: string): ParsedSearchQuery {
  const parsed: ParsedSearchQuery = {
    terms: [],
    from: [],
    mentions: [],
    has: new Set<string>(),
    is: new Set<string>(),
    beforeDates: [],
    afterDates: [],
    onDates: [],
  };

  const tokens = query.match(SEARCH_TOKEN_REGEX) ?? [];
  for (const rawToken of tokens) {
    const token = stripWrappingQuotes(rawToken.trim());
    if (!token) continue;

    const separator = token.indexOf(":");
    if (separator <= 0) {
      parsed.terms.push(token.toLowerCase());
      continue;
    }

    const key = token.slice(0, separator).toLowerCase();
    const rawValue = stripWrappingQuotes(token.slice(separator + 1)).trim().toLowerCase();
    if (!rawValue) {
      if (
        key === "from" ||
        key === "mentions" ||
        key === "mention" ||
        key === "has" ||
        key === "is" ||
        key === "before" ||
        key === "after" ||
        key === "on" ||
        key === "date"
      ) {
        continue;
      }
      parsed.terms.push(token.toLowerCase());
      continue;
    }

    switch (key) {
      case "from":
        parsed.from.push(rawValue);
        break;
      case "mentions":
      case "mention":
        parsed.mentions.push(rawValue.replace(/^@/, ""));
        break;
      case "has":
        parsed.has.add(rawValue);
        break;
      case "is":
        parsed.is.add(rawValue);
        break;
      case "before":
        parsed.beforeDates.push(rawValue);
        break;
      case "after":
        parsed.afterDates.push(rawValue);
        break;
      case "on":
      case "date":
        parsed.onDates.push(rawValue);
        break;
      default:
        parsed.terms.push(`${key}:${rawValue}`);
    }
  }

  return parsed;
}

function MessageEmbeds({ embeds }: { embeds: MessageEmbed[] }) {
  if (embeds.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {embeds.map((embed) => {
        const host = getEmbedHost(embed.url);
        const title = embed.title?.trim() || embed.url;
        const description = embed.description?.trim() || "";

        return (
          <a
            key={embed.id}
            href={embed.url}
            target="_blank"
            rel="noreferrer"
            className="group block rounded-md border border-bg-active bg-bg-secondary/60 p-2 transition hover:border-accent/60 hover:bg-bg-secondary"
          >
            <div className="flex items-start gap-2">
              {embed.image_url && (
                <img
                  src={embed.image_url}
                  alt={title}
                  className="h-14 w-14 flex-shrink-0 rounded object-cover"
                  loading="lazy"
                />
              )}
              <div className="min-w-0">
                <div className="truncate text-[11px] uppercase tracking-wide text-text-muted">
                  {embed.site_name || host}
                </div>
                <div className="line-clamp-2 text-sm font-semibold text-text-primary group-hover:text-accent">
                  {title}
                </div>
                {description && (
                  <div className="line-clamp-2 text-xs text-text-secondary">
                    {description}
                  </div>
                )}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

export function MessageList({
  roomId,
  searchQuery,
  jumpDate,
  pinnedPanelToggleSignal = 0,
}: MessageListProps) {
  const messagesByRoom = useMessagesStore((state) => state.messagesByRoom);
  const reactionsByMessage = useMessagesStore((state) => state.reactionsByMessage);
  const embedsByMessage = useMessagesStore((state) => state.embedsByMessage);
  const pinnedMessagesByRoom = useMessagesStore((state) => state.pinnedMessagesByRoom);
  const pinsAvailable = useMessagesStore((state) => state.pinsAvailable);
  const fetchMessages = useMessagesStore((state) => state.fetchMessages);
  const subscribeToRoom = useMessagesStore((state) => state.subscribeToRoom);
  const toggleReaction = useMessagesStore((state) => state.toggleReaction);
  const setReplyTarget = useMessagesStore((state) => state.setReplyTarget);
  const editMessage = useMessagesStore((state) => state.editMessage);
  const deleteMessage = useMessagesStore((state) => state.deleteMessage);
  const pinMessage = useMessagesStore((state) => state.pinMessage);
  const unpinMessage = useMessagesStore((state) => state.unpinMessage);
  const loading = useMessagesStore((state) => state.loading);
  const hasMore = useMessagesStore((state) => state.hasMore);
  const user = useAuthStore((state) => state.user);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastProcessedJumpDateRef = useRef("");
  const lastPinnedPanelToggleSignalRef = useRef(pinnedPanelToggleSignal);
  const prevMsgCount = useRef(0);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [pendingNewCount, setPendingNewCount] = useState(0);
  const [showPinnedPanel, setShowPinnedPanel] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const messages = useMemo(
    () => messagesByRoom.get(roomId) ?? [],
    [messagesByRoom, roomId]
  );
  const pinnedMessages = useMemo(
    () => pinnedMessagesByRoom.get(roomId) ?? [],
    [pinnedMessagesByRoom, roomId]
  );
  const latestPinnedMessage = pinnedMessages[0] ?? null;
  const pinnedMessageIds = useMemo(
    () => new Set(pinnedMessages.map((message) => message.id)),
    [pinnedMessages]
  );
  const canLoadMore = hasMore.get(roomId) ?? false;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const parsedSearch = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);

  useEffect(() => {
    void fetchMessages(roomId);
    const unsubscribe = subscribeToRoom(roomId);
    return unsubscribe;
  }, [roomId, fetchMessages, subscribeToRoom]);

  useEffect(() => {
    const previousCount = prevMsgCount.current;
    if (messages.length > previousCount) {
      const addedCount = messages.length - previousCount;
      if (isNearBottom) {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      } else {
        setPendingNewCount((count) => count + addedCount);
      }
    }
    prevMsgCount.current = messages.length;
  }, [messages.length, isNearBottom]);

  useEffect(() => {
    if (!highlightedMessageId) return;
    const timer = setTimeout(() => setHighlightedMessageId(null), 1800);
    return () => clearTimeout(timer);
  }, [highlightedMessageId]);

  useEffect(() => {
    if (lastPinnedPanelToggleSignalRef.current === pinnedPanelToggleSignal) return;
    lastPinnedPanelToggleSignalRef.current = pinnedPanelToggleSignal;

    const frameId = window.requestAnimationFrame(() => {
      if (!pinsAvailable) {
        setShowPinnedPanel(false);
        return;
      }

      setShowPinnedPanel((open) => !open);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [pinnedPanelToggleSignal, pinsAvailable]);

  const filteredMessages = useMemo(() => {
    if (!normalizedSearch) return messages;

    return messages.filter((message) => {
      const authorText = [
        message.author?.display_name ?? "",
        message.author_display_name_snapshot ?? "",
        message.author?.username ?? "",
        message.author_username_snapshot ?? "",
      ]
        .join(" ")
        .toLowerCase();
      const messageText = getMessageSearchText(message);
      const messageContent = message.content.toLowerCase();
      const embeds = embedsByMessage.get(message.id) ?? [];
      const messageCreatedAt = new Date(message.created_at).getTime();
      const embedText = embeds
        .map((embed) =>
          `${embed.title ?? ""} ${embed.description ?? ""} ${embed.site_name ?? ""} ${embed.url}`
        )
        .join(" ")
        .toLowerCase();
      const searchableText = `${messageText} ${embedText}`.trim();

      if (
        parsedSearch.terms.length > 0 &&
        !parsedSearch.terms.every((term) => searchableText.includes(term))
      ) {
        return false;
      }

      if (
        parsedSearch.from.length > 0 &&
        !parsedSearch.from.some((term) => authorText.includes(term))
      ) {
        return false;
      }

      if (parsedSearch.mentions.length > 0) {
        const mentionableText = `${messageContent} ${searchableText}`;
        const hasMention = parsedSearch.mentions.some(
          (term) =>
            mentionableText.includes(`@${term}`) || mentionableText.includes(term)
        );
        if (!hasMention) return false;
      }

      for (const hasFilter of parsedSearch.has) {
        if (hasFilter === "link" && !(URL_IN_TEXT_REGEX.test(message.content) || embeds.length > 0)) {
          return false;
        }
        if (hasFilter === "embed" && embeds.length === 0) {
          return false;
        }
        if (hasFilter === "reply" && !message.reply_to_id) {
          return false;
        }
        if (hasFilter === "image" && !embeds.some((embed) => Boolean(embed.image_url))) {
          return false;
        }
        if (hasFilter === "file" && (message.attachments?.length ?? 0) === 0) {
          return false;
        }
      }

      if (parsedSearch.is.has("pinned") && !pinnedMessageIds.has(message.id)) {
        return false;
      }
      if (parsedSearch.is.has("edited") && !message.edited_at) {
        return false;
      }

      if (parsedSearch.beforeDates.length > 0) {
        const matchesBefore = parsedSearch.beforeDates.some((value) => {
          const beforeStart = parseDateStart(value);
          return beforeStart !== null && messageCreatedAt < beforeStart;
        });
        if (!matchesBefore) return false;
      }

      if (parsedSearch.afterDates.length > 0) {
        const matchesAfter = parsedSearch.afterDates.some((value) => {
          const afterStart = parseDateStart(value);
          return afterStart !== null && messageCreatedAt >= afterStart;
        });
        if (!matchesAfter) return false;
      }

      if (parsedSearch.onDates.length > 0) {
        const matchesOn = parsedSearch.onDates.some((value) => {
          const onStart = parseDateStart(value);
          if (onStart === null) return false;
          const onEnd = onStart + 24 * 60 * 60 * 1000;
          return messageCreatedAt >= onStart && messageCreatedAt < onEnd;
        });
        if (!matchesOn) return false;
      }

      return true;
    });
  }, [messages, normalizedSearch, parsedSearch, embedsByMessage, pinnedMessageIds]);

  const groupedMessages = useMemo(() => {
    const grouped: { date: string; messages: MessageWithAuthor[] }[] = [];
    let currentDate = "";
    for (const message of filteredMessages) {
      const date = formatDateLabel(message.created_at);
      if (date !== currentDate) {
        currentDate = date;
        grouped.push({ date, messages: [] });
      }
      grouped[grouped.length - 1].messages.push(message);
    }
    return grouped;
  }, [filteredMessages]);

  const messageById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages]
  );

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom <= 80;

    setIsNearBottom((previous) => (previous === nearBottom ? previous : nearBottom));
    if (nearBottom) {
      setPendingNewCount(0);
    }
  };

  const jumpToLatest = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setPendingNewCount(0);
    setIsNearBottom(true);
  };

  const loadMore = () => {
    if (!canLoadMore || loading) return;
    const oldest = messages[0];
    if (!oldest) return;
    void fetchMessages(roomId, oldest.created_at);
  };

  const formatTime = (iso: string) => format(new Date(iso), "HH:mm");

  const scrollToMessage = useCallback((messageId: string) => {
    const target = messageRefs.current.get(messageId);
    if (!target) {
      addToast("Message is not loaded yet. Load older messages first.", "error");
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(messageId);
    setShowPinnedPanel(false);
  }, []);

  useEffect(() => {
    if (!jumpDate) {
      lastProcessedJumpDateRef.current = "";
      return;
    }

    if (lastProcessedJumpDateRef.current === jumpDate) return;
    lastProcessedJumpDateRef.current = jumpDate;

    const start = new Date(`${jumpDate}T00:00:00`);
    if (Number.isNaN(start.getTime())) return;

    const target = messages.find((message) => new Date(message.created_at) >= start);
    if (!target) {
      addToast("No loaded message found on or after that date.", "error");
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const targetNode = messageRefs.current.get(target.id);
      if (!targetNode) {
        addToast("Message is not loaded yet. Load older messages first.", "error");
        return;
      }

      targetNode.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMessageId(target.id);
      setShowPinnedPanel(false);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [jumpDate, messages]);

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    try {
      await toggleReaction(messageId, emoji);
    } catch (error) {
      console.error("Toggle reaction failed:", error);
      addToast("Could not update reaction right now", "error");
    }
  };

  const handleStartEditing = (message: MessageWithAuthor) => {
    setEditingMessageId(message.id);
    setEditingContent(message.content);
  };

  const handleSaveEdit = async (message: MessageWithAuthor) => {
    const trimmed = editingContent.trim();
    if (!trimmed) {
      addToast("Message cannot be empty", "error");
      return;
    }

    if (trimmed === message.content) {
      setEditingMessageId(null);
      setEditingContent("");
      return;
    }

    try {
      await editMessage(message.id, trimmed);
      setEditingMessageId(null);
      setEditingContent("");
    } catch (error) {
      console.error("Edit message failed:", error);
      addToast("Could not edit message", "error");
    }
  };

  const handleDelete = async (message: MessageWithAuthor) => {
    if (!window.confirm("Delete this message?")) return;
    try {
      await deleteMessage(message.id, roomId);
    } catch (error) {
      console.error("Delete message failed:", error);
      addToast("Could not delete message", "error");
    }
  };

  const handleCopyMessage = async (message: MessageWithAuthor) => {
    try {
      await navigator.clipboard.writeText(message.content);
      addToast("Message copied", "success");
    } catch {
      addToast("Could not copy message", "error");
    }
  };

  const handlePin = async (message: MessageWithAuthor) => {
    try {
      await pinMessage(roomId, message.id);
      addToast("Message pinned", "success");
    } catch (error) {
      if (error instanceof Error && error.message.includes("unavailable")) {
        addToast(error.message, "error");
        return;
      }
      console.error("Pin message failed:", error);
      addToast("Could not pin message", "error");
    }
  };

  const handleUnpin = async (message: MessageWithAuthor) => {
    try {
      await unpinMessage(roomId, message.id);
      addToast("Message unpinned", "success");
    } catch (error) {
      if (error instanceof Error && error.message.includes("unavailable")) {
        addToast(error.message, "error");
        return;
      }
      console.error("Unpin message failed:", error);
      addToast("Could not unpin message", "error");
    }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {pinsAvailable && latestPinnedMessage && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-md border border-bg-active bg-bg-secondary px-3 py-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-text-muted">Pinned</span>
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-text-primary hover:text-accent"
            onClick={() => scrollToMessage(latestPinnedMessage.id)}
            title={latestPinnedMessage.content}
          >
            {latestPinnedMessage.content}
          </button>
          <button
            type="button"
            onClick={() => setShowPinnedPanel((open) => !open)}
            className="inline-flex items-center gap-1 rounded bg-bg-active px-2 py-1 text-text-secondary hover:text-text-primary"
            title="Toggle pinned panel"
          >
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M7.2 2.2a1 1 0 011.41 0l1.2 1.2h2.99a1 1 0 01.7 1.71L11.2 7.4v2.1l2.5 2.5a1 1 0 01-1.4 1.4L9.8 10.9v6.1a1 1 0 11-2 0v-6.1l-2.5 2.5a1 1 0 11-1.4-1.4l2.5-2.5V7.4L4 5.1A1 1 0 014.7 3.4h3l1.2-1.2z" />
            </svg>
            <span>{pinnedMessages.length}</span>
          </button>
        </div>
      )}

      {pinsAvailable && showPinnedPanel && (
        <div className="absolute right-4 top-14 z-30 w-96 max-w-[calc(100%-2rem)] rounded-md border border-bg-active bg-bg-secondary p-2 shadow-xl">
          <div className="mb-2 flex items-center justify-between border-b border-bg-active px-1 pb-2">
            <span className="text-sm font-semibold text-text-primary">Pinned Messages</span>
            <button
              type="button"
              onClick={() => setShowPinnedPanel(false)}
              className="rounded px-2 py-1 text-xs text-text-muted hover:bg-bg-active hover:text-text-primary"
            >
              Close
            </button>
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {pinnedMessages.length === 0 && (
              <div className="px-2 py-3 text-xs text-text-muted">No pinned messages.</div>
            )}
            {pinnedMessages.map((message) => {
              const authorName = getMessageAuthorDisplayName(message);
              return (
                <div
                  key={`pinned:${message.id}`}
                  className="rounded border border-bg-active/50 bg-bg-primary/40 px-2 py-2"
                >
                  <div className="mb-1 flex items-center gap-2 text-[11px] text-text-muted">
                    <span className="font-semibold text-text-secondary">{authorName}</span>
                    <span>{formatDateLabel(message.created_at)}</span>
                    <span>{formatTime(message.created_at)}</span>
                  </div>
                  <div className="line-clamp-2 text-xs text-text-primary">{message.content}</div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => scrollToMessage(message.id)}
                      className="rounded bg-bg-active px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary"
                    >
                      Jump
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleUnpin(message)}
                      className="rounded bg-bg-active px-2 py-1 text-[11px] text-text-secondary hover:text-danger"
                    >
                      Unpin
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4"
      >
        {normalizedSearch && (
          <div className="mt-2 text-[11px] text-text-muted">
            {filteredMessages.length} result{filteredMessages.length !== 1 && "s"}
          </div>
        )}

        {canLoadMore && (
          <button
            onClick={loadMore}
            disabled={loading}
            className="my-2 self-center text-xs text-accent hover:underline"
          >
            {loading ? "Loading..." : "Load older messages"}
          </button>
        )}

        {filteredMessages.length === 0 && !loading && (
          <div className="flex flex-1 items-end pb-4">
            <p className="text-text-muted">
              {normalizedSearch ? "No messages match your search." : "No messages yet. Say something!"}
            </p>
          </div>
        )}

        {groupedMessages.map((group, groupIndex) => (
          <div key={`${group.date}:${group.messages[0]?.id ?? groupIndex}`}>
            <div className="my-2 flex items-center gap-2">
              <div className="flex-1 border-t border-bg-active" />
              <span className="text-xs font-semibold text-text-muted">{group.date}</span>
              <div className="flex-1 border-t border-bg-active" />
            </div>

            {group.messages.map((message, index) => {
              const previousMessage = group.messages[index - 1];
              const collapsed =
                !!previousMessage &&
                previousMessage.author_id === message.author_id &&
                new Date(message.created_at).getTime() -
                  new Date(previousMessage.created_at).getTime() <
                  5 * 60 * 1000;
              const isOwnMessage = message.author_id === user?.id;
              const isEditing = editingMessageId === message.id;
              const groupedReactions = groupReactions(
                reactionsByMessage.get(message.id) ?? [],
                user?.id
              );
              const embeds = embedsByMessage.get(message.id) ?? [];
              const isPinned = pinnedMessageIds.has(message.id);

              return (
                <div
                  key={message.id}
                  ref={(node) => {
                    if (node) {
                      messageRefs.current.set(message.id, node);
                    } else {
                      messageRefs.current.delete(message.id);
                    }
                  }}
                  className={`group flex gap-3 rounded px-2 py-1 hover:bg-bg-hover ${
                    collapsed ? "" : "mt-3"
                  } ${
                    highlightedMessageId === message.id
                      ? "bg-accent/10 ring-1 ring-accent/50"
                      : ""
                  }`}
                >
                  <div className="w-10 flex-shrink-0">
                    {!collapsed && (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
                        {(
                          getMessageAuthorDisplayName(message) ??
                          "?"
                        )
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {!collapsed && (
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            isOwnMessage ? "text-accent" : "text-text-primary"
                          }`}
                        >
                          {getMessageAuthorDisplayName(message)}
                        </span>
                        <span className="text-xs text-text-muted">
                          {formatTime(message.created_at)}
                        </span>
                        {message.edited_at && (
                          <span className="text-xs text-text-muted">(edited)</span>
                        )}
                        {isPinned && (
                          <span className="rounded bg-bg-active px-1.5 py-0.5 text-[10px] font-semibold uppercase text-text-secondary">
                            pinned
                          </span>
                        )}
                      </div>
                    )}

                    {isEditing ? (
                      <div className="mt-1">
                        <textarea
                          value={editingContent}
                          onChange={(event) => setEditingContent(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void handleSaveEdit(message);
                            }
                            if (event.key === "Escape") {
                              setEditingMessageId(null);
                              setEditingContent("");
                            }
                          }}
                          rows={2}
                          className="w-full rounded bg-bg-input px-3 py-2 text-sm text-text-primary outline-none"
                        />
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <button
                            onClick={() => void handleSaveEdit(message)}
                            className="rounded bg-accent px-2 py-0.5 font-medium text-white hover:opacity-90"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingMessageId(null);
                              setEditingContent("");
                            }}
                            className="text-text-muted hover:text-text-primary"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {message.reply_to_id && (
                          <div className="mb-1 max-w-xl rounded border-l-2 border-bg-active bg-bg-primary/40 px-2 py-1 text-xs text-text-muted">
                            {(() => {
                              const repliedMessage = messageById.get(message.reply_to_id);
                              if (!repliedMessage) {
                                return <span>Reply to an earlier message</span>;
                              }
                              const repliedAuthor =
                                getMessageAuthorDisplayName(repliedMessage);
                              const repliedSnippet = repliedMessage.content
                                .replace(/\s+/g, " ")
                                .slice(0, 90);
                              return (
                                <span>
                                  <span className="font-semibold text-text-secondary">
                                    {repliedAuthor}
                                  </span>
                                  {": "}
                                  {repliedSnippet}
                                  {repliedMessage.content.length > 90 ? "..." : ""}
                                </span>
                              );
                            })()}
                          </div>
                        )}

                        <p className="whitespace-pre-wrap break-words text-sm text-text-primary">
                          {message.content}
                          {collapsed && message.edited_at && (
                            <span className="ml-1 text-xs text-text-muted">(edited)</span>
                          )}
                        </p>
                        <MessageEmbeds embeds={embeds} />
                      </>
                    )}

                    {groupedReactions.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {groupedReactions.map((reaction) => (
                          <button
                            key={`${message.id}:${reaction.emoji}`}
                            onClick={() => void handleToggleReaction(message.id, reaction.emoji)}
                            className={`flex items-center gap-1 rounded border px-2 py-0.5 text-xs transition ${
                              reaction.reactedByMe
                                ? "border-accent bg-accent/20 text-text-primary"
                                : "border-bg-active bg-bg-active text-text-secondary hover:text-text-primary"
                            }`}
                          >
                            <span>{reaction.emoji}</span>
                            <span>{reaction.count}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="ml-2 flex min-w-[96px] items-start justify-end gap-1">
                    {collapsed && (
                      <span className="hidden self-center text-xs text-text-muted group-hover:inline">
                        {formatTime(message.created_at)}
                      </span>
                    )}

                    <div className="hidden items-center gap-1 group-hover:flex">
                      {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
                        <button
                          key={`${message.id}:quick:${emoji}`}
                          onClick={() => void handleToggleReaction(message.id, emoji)}
                          className="rounded bg-bg-active px-1.5 py-0.5 text-xs text-text-secondary hover:text-text-primary"
                          title={`React ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}

                      <button
                        onClick={() => void handleCopyMessage(message)}
                        className="rounded bg-bg-active px-1.5 py-0.5 text-xs text-text-secondary hover:text-text-primary"
                        title="Copy message"
                      >
                        Copy
                      </button>

                      <button
                        onClick={() => setReplyTarget(roomId, message)}
                        className="rounded bg-bg-active px-1.5 py-0.5 text-xs text-text-secondary hover:text-text-primary"
                        title="Reply"
                      >
                        Reply
                      </button>

                      {pinsAvailable && (
                        <button
                          onClick={() =>
                            void (isPinned ? handleUnpin(message) : handlePin(message))
                          }
                          className="rounded bg-bg-active px-1.5 py-0.5 text-xs text-text-secondary hover:text-text-primary"
                          title={isPinned ? "Unpin message" : "Pin message"}
                        >
                          {isPinned ? "Unpin" : "Pin"}
                        </button>
                      )}

                      {isOwnMessage && !isEditing && (
                        <>
                          <button
                            onClick={() => handleStartEditing(message)}
                            className="rounded bg-bg-active px-1.5 py-0.5 text-xs text-text-secondary hover:text-text-primary"
                            title="Edit message"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => void handleDelete(message)}
                            className="rounded bg-bg-active px-1.5 py-0.5 text-xs text-text-secondary hover:text-danger"
                            title="Delete message"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {!isNearBottom && pendingNewCount > 0 && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 right-4 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:opacity-90"
        >
          Jump to latest ({pendingNewCount})
        </button>
      )}
    </div>
  );
}

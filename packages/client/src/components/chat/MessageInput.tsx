import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMessagesStore } from "@/stores/messages";
import { useTyping } from "@/hooks/useTyping";
import { useAuthStore } from "@/stores/auth";
import {
  findEmojiShortcodeQuery,
  getEmojiShortcodeMatches,
  recordEmojiShortcodeUsage,
  recordEmojiUsageByCharacter,
  replaceEmojiShortcodes,
  type EmojiShortcodeMatch,
} from "@/lib/emoji";
import { MAX_MESSAGE_LENGTH } from "@datchat/shared";
import { EmojiPickerPopup } from "@/components/ui/EmojiPicker";
import {
  clearMessageDraft as clearDraftForRoom,
  getMessageDraft as getDraftForRoom,
  setMessageDraft as setDraftForRoom,
} from "@/lib/messageDrafts";

interface MessageInputProps {
  roomId: string;
  roomName: string;
}

export function MessageInput({ roomId, roomName }: MessageInputProps) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [content, setContent] = useState(() => getDraftForRoom(userId, roomId));
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiAutocomplete, setEmojiAutocomplete] = useState<EmojiShortcodeMatch[]>([]);
  const [emojiAutocompleteIndex, setEmojiAutocompleteIndex] = useState(0);
  const [dismissedEmojiQueryStart, setDismissedEmojiQueryStart] = useState<number | null>(
    null
  );
  const [emojiQueryRange, setEmojiQueryRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const sendMessage = useMessagesStore((s) => s.sendMessage);
  const replyTargetByRoom = useMessagesStore((s) => s.replyTargetByRoom);
  const clearReplyTarget = useMessagesStore((s) => s.clearReplyTarget);
  const sending = useMessagesStore((s) => s.sending);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef(content);
  const { typingUsers, notifyTypingActivity, stopTyping } = useTyping(roomId);
  const sentHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const historySnapshotRef = useRef("");
  const remainingChars = MAX_MESSAGE_LENGTH - content.length;
  const showCounter = remainingChars <= 300;
  const hasEmojiAutocomplete =
    emojiAutocomplete.length > 0 && !!emojiQueryRange;
  const replyTarget = replyTargetByRoom.get(roomId) ?? null;
  const replyTargetMessageId = replyTarget?.messageId ?? null;

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea || !replyTargetMessageId) return;

    setTimeout(() => {
      textarea.focus();
      const cursor = textarea.value.length;
      textarea.setSelectionRange(cursor, cursor);
    }, 0);
  }, [replyTargetMessageId]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        target.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
      );
    };

    const onGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length !== 1) return;
      if (isEditableTarget(event.target) && event.target !== textarea) return;
      if (document.activeElement === textarea) return;

      event.preventDefault();
      const nextContent = `${contentRef.current}${event.key}`.slice(0, MAX_MESSAGE_LENGTH);
      setContent(nextContent);
      setDraftForRoom(userId, roomId, nextContent);
      notifyTypingActivity(nextContent.length > 0);

      setTimeout(() => {
        textarea.focus();
        const cursor = nextContent.length;
        textarea.setSelectionRange(cursor, cursor);
      }, 0);
    };

    window.addEventListener("keydown", onGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", onGlobalKeyDown);
    };
  }, [roomId, userId, notifyTypingActivity]);

  const clearEmojiAutocomplete = () => {
    setEmojiAutocomplete([]);
    setEmojiAutocompleteIndex(0);
    setEmojiQueryRange(null);
  };

  const refreshEmojiAutocomplete = (nextContent: string, caretPosition: number) => {
    const query = findEmojiShortcodeQuery(nextContent, caretPosition);
    if (!query) {
      setDismissedEmojiQueryStart(null);
      clearEmojiAutocomplete();
      return;
    }

    if (dismissedEmojiQueryStart === query.start) {
      clearEmojiAutocomplete();
      return;
    }

    if (dismissedEmojiQueryStart !== null && dismissedEmojiQueryStart !== query.start) {
      setDismissedEmojiQueryStart(null);
    }

    const matches = getEmojiShortcodeMatches(query.query, 6);
    if (!matches.length) {
      clearEmojiAutocomplete();
      return;
    }

    setEmojiQueryRange({ start: query.start, end: query.end });
    setEmojiAutocomplete(matches);
    setEmojiAutocompleteIndex((current) => Math.min(current, matches.length - 1));
  };

  const applyEmojiAutocomplete = (index: number) => {
    if (!emojiQueryRange) return;

    const selected = emojiAutocomplete[index];
    if (!selected) return;

    const textarea = inputRef.current;
    const suffix = content.slice(emojiQueryRange.end);
    const shouldAppendSpace = suffix.length === 0 || !/^[\s.,!?)]/.test(suffix);
    const replacement = `${selected.emoji}${shouldAppendSpace ? " " : ""}`;
    const nextContent =
      content.slice(0, emojiQueryRange.start) + replacement + suffix;
    const nextCaret = emojiQueryRange.start + replacement.length;

    setContent(nextContent);
    setDraftForRoom(userId, roomId, nextContent);
    recordEmojiShortcodeUsage(selected.shortcode);
    notifyTypingActivity(nextContent.length > 0);
    setDismissedEmojiQueryStart(null);
    clearEmojiAutocomplete();

    setTimeout(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCaret, nextCaret);
    }, 0);
  };

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    stopTyping();

    trimmed.replace(/:([a-z0-9_+-]+):/gi, (matchedShortcode, shortcode: string) => {
      recordEmojiShortcodeUsage(`:${shortcode}:`);
      return matchedShortcode;
    });

    const withEmoji = replaceEmojiShortcodes(trimmed);
    clearEmojiAutocomplete();
    setDismissedEmojiQueryStart(null);
    setContent("");
    clearDraftForRoom(userId, roomId);

    if (sentHistoryRef.current[0] !== trimmed) {
      sentHistoryRef.current = [trimmed, ...sentHistoryRef.current].slice(0, 30);
    }
    historyIndexRef.current = -1;
    historySnapshotRef.current = "";

    await sendMessage(roomId, withEmoji, replyTarget?.messageId);
    clearReplyTarget(roomId);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (hasEmojiAutocomplete) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setEmojiAutocompleteIndex((current) => (current + 1) % emojiAutocomplete.length);
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setEmojiAutocompleteIndex((current) =>
          (current - 1 + emojiAutocomplete.length) % emojiAutocomplete.length
        );
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        applyEmojiAutocomplete(emojiAutocompleteIndex);
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        applyEmojiAutocomplete(emojiAutocompleteIndex);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (emojiQueryRange) {
          setDismissedEmojiQueryStart(emojiQueryRange.start);
        }
        clearEmojiAutocomplete();
        return;
      }
    }

    if (e.key === "Escape" && replyTarget) {
      e.preventDefault();
      clearReplyTarget(roomId);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
      return;
    }

    const textarea = inputRef.current;
    if (!textarea || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;

    if (e.key === "ArrowUp") {
      const atStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0;
      if (!atStart || sentHistoryRef.current.length === 0) return;

      e.preventDefault();
      if (historyIndexRef.current === -1) {
        historySnapshotRef.current = content;
      }

      const nextIndex = Math.min(
        historyIndexRef.current + 1,
        sentHistoryRef.current.length - 1
      );
      if (nextIndex === historyIndexRef.current) return;

      historyIndexRef.current = nextIndex;
      const nextContent = sentHistoryRef.current[nextIndex] ?? "";
      setContent(nextContent);
      setDraftForRoom(userId, roomId, nextContent);
      setTimeout(() => {
        textarea.setSelectionRange(0, 0);
      }, 0);
      return;
    }

    if (e.key === "ArrowDown" && historyIndexRef.current >= 0) {
      const atEnd =
        textarea.selectionStart === content.length &&
        textarea.selectionEnd === content.length;
      if (!atEnd) return;

      e.preventDefault();
      const nextIndex = historyIndexRef.current - 1;
      historyIndexRef.current = nextIndex;

      const nextContent =
        nextIndex >= 0 ? sentHistoryRef.current[nextIndex] ?? "" : historySnapshotRef.current;
      setContent(nextContent);
      setDraftForRoom(userId, roomId, nextContent);
      setTimeout(() => {
        const cursor = nextContent.length;
        textarea.setSelectionRange(cursor, cursor);
      }, 0);
    }
  };

  const insertEmoji = (emoji: string) => {
    const textarea = inputRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = content.slice(0, start) + emoji + content.slice(end);
    setContent(newContent);
    setDraftForRoom(userId, roomId, newContent);
    recordEmojiUsageByCharacter(emoji);
    notifyTypingActivity(newContent.length > 0);
    clearEmojiAutocomplete();

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 0);
  };

  return (
    <div className="flex-shrink-0 px-4 pb-6 pt-1">
      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="mb-1 px-4 text-xs text-text-muted">
          {typingUsers.length === 1
            ? `${typingUsers[0]} is typing...`
            : typingUsers.length === 2
              ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
              : `${typingUsers.length} people are typing...`}
        </div>
      )}

      <div className="relative">
        {replyTarget && (
          <div className="mb-2 flex items-start justify-between gap-2 rounded-md border border-bg-active bg-bg-secondary px-3 py-2">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Replying to {replyTarget.authorName}
              </div>
              <div className="truncate text-xs text-text-secondary">
                {replyTarget.content || "Message"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => clearReplyTarget(roomId)}
              className="rounded px-2 py-1 text-xs text-text-muted hover:bg-bg-active hover:text-text-primary"
              title="Cancel reply"
            >
              Cancel
            </button>
          </div>
        )}

        {hasEmojiAutocomplete && emojiQueryRange && (
          <div className="absolute bottom-full left-2 right-2 z-30 mb-2 overflow-hidden rounded-md border border-bg-active bg-bg-secondary shadow-lg">
            {emojiAutocomplete.map((match, index) => {
              const isActive = index === emojiAutocompleteIndex;
              return (
                <button
                  key={match.shortcode}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setEmojiAutocompleteIndex(index)}
                  onClick={() => applyEmojiAutocomplete(index)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                    isActive ? "bg-bg-active text-text-primary" : "text-text-secondary hover:bg-bg-hover"
                  }`}
                >
                  <span className="text-lg leading-none">{match.emoji}</span>
                  <span className="truncate font-medium text-text-primary">
                    :{match.name}:
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Emoji picker popup - using emoji-picker-react library */}
        {showEmojiPicker && (
          <EmojiPickerPopup
            onEmojiClick={insertEmoji}
            onClose={() => setShowEmojiPicker(false)}
          />
        )}

        <div className="flex items-end gap-2 rounded-lg bg-bg-input px-4 py-2.5">
          <textarea
            ref={inputRef}
            value={content}
            onChange={(e) => {
              const raw = e.target.value.slice(0, MAX_MESSAGE_LENGTH);
              setContent(raw);
              setDraftForRoom(userId, roomId, raw);
              if (!raw.length) setDismissedEmojiQueryStart(null);
              historyIndexRef.current = -1;
              historySnapshotRef.current = "";
              refreshEmojiAutocomplete(raw, e.target.selectionStart ?? raw.length);
              notifyTypingActivity(raw.length > 0);
            }}
            onKeyDown={handleKeyDown}
            onClick={(e) =>
              refreshEmojiAutocomplete(
                e.currentTarget.value,
                e.currentTarget.selectionStart ?? e.currentTarget.value.length
              )
            }
            onKeyUp={(e) =>
              refreshEmojiAutocomplete(
                e.currentTarget.value,
                e.currentTarget.selectionStart ?? e.currentTarget.value.length
              )
            }
            onBlur={() => {
              stopTyping();
              setTimeout(() => {
                clearEmojiAutocomplete();
              }, 100);
            }}
            placeholder={`Message ${roomName}`}
            rows={1}
            className="max-h-48 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            style={{
              height: "auto",
              overflowY: content.split("\n").length > 6 ? "auto" : "hidden",
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 192) + "px";
            }}
          />

          <button
            type="button"
            onClick={() => {
              setShowEmojiPicker((open) => !open);
              clearEmojiAutocomplete();
              setDismissedEmojiQueryStart(null);
            }}
            className="text-text-muted hover:text-text-primary transition"
            title="Emoji"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>

        <div className="mt-1 flex items-center justify-between px-1 text-[11px] text-text-muted">
          <span>
            {hasEmojiAutocomplete
              ? "Tab to autocomplete | Up/Down to navigate"
              : "Shift+Enter for newline"}
          </span>
          {showCounter && (
            <span className={remainingChars <= 50 ? "text-danger" : "text-text-muted"}>
              {remainingChars}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

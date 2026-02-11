import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Profile, RoomType } from "@datchat/shared";

const SEARCH_HISTORY_STORAGE_KEY = "datchat.search.history";
const MAX_SEARCH_HISTORY_ITEMS = 6;

type SearchDateOperator = "on" | "before" | "after";

function statusDotClass(status: string) {
  if (status === "online") return "bg-online";
  if (status === "idle") return "bg-idle";
  if (status === "dnd") return "bg-dnd";
  return "bg-offline";
}

function loadSearchHistory(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, MAX_SEARCH_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

function saveSearchHistory(entries: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    SEARCH_HISTORY_STORAGE_KEY,
    JSON.stringify(entries.slice(0, MAX_SEARCH_HISTORY_ITEMS))
  );
}

function appendSearchToken(query: string, token: string): string {
  const trimmed = query.trim();
  if (!trimmed) return `${token} `;
  if (trimmed.endsWith(" ")) return `${trimmed}${token} `;
  return `${trimmed} ${token} `;
}

interface RoomHeaderProps {
  roomType: RoomType;
  roomName: string;
  memberCount: number;
  dmProfile: Profile | null;
  dmStatus: string;
  searchableMembers: string[];
  pinsAvailable: boolean;
  pinnedCount: number;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  jumpDate: string;
  setJumpDate: Dispatch<SetStateAction<string>>;
  onTogglePinnedPanel: () => void;
  inVoiceInThisRoom: boolean;
  inVoiceInAnotherRoom: boolean;
  inRoomCallCount: number;
  isMuted: boolean;
  isDeafened: boolean;
  connecting: boolean;
  onJoinVoice: () => void;
  onLeaveVoice: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
}

export function RoomHeader({
  roomType,
  roomName,
  memberCount,
  dmProfile,
  dmStatus,
  searchableMembers,
  pinsAvailable,
  pinnedCount,
  searchQuery,
  setSearchQuery,
  jumpDate,
  setJumpDate,
  onTogglePinnedPanel,
  inVoiceInThisRoom,
  inVoiceInAnotherRoom,
  inRoomCallCount,
  isMuted,
  isDeafened,
  connecting,
  onJoinVoice,
  onLeaveVoice,
  onToggleMute,
  onToggleDeafen,
}: RoomHeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => loadSearchHistory());
  const [searchDateOperator, setSearchDateOperator] = useState<SearchDateOperator>("on");
  const [searchDateValue, setSearchDateValue] = useState("");
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searchOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (searchContainerRef.current?.contains(target)) return;
      setSearchOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [searchOpen]);

  const rememberSearch = (query: string) => {
    const normalized = query.trim();
    if (!normalized) return;

    setSearchHistory((previous) => {
      const withoutDuplicate = previous.filter(
        (entry) => entry.toLowerCase() !== normalized.toLowerCase()
      );
      const next = [normalized, ...withoutDuplicate].slice(0, MAX_SEARCH_HISTORY_ITEMS);
      saveSearchHistory(next);
      return next;
    });
  };

  const removeSearchHistoryEntry = (entryToRemove: string) => {
    setSearchHistory((previous) => {
      const next = previous.filter((entry) => entry !== entryToRemove);
      saveSearchHistory(next);
      return next;
    });
  };

  const clearSearchHistory = () => {
    setSearchHistory([]);
    saveSearchHistory([]);
  };

  const applyFilterToken = (token: string) => {
    setSearchQuery((previous) => appendSearchToken(previous, token));
    setSearchOpen(true);
  };

  const applyDateFilter = () => {
    if (!searchDateValue) return;
    applyFilterToken(`${searchDateOperator}:${searchDateValue}`);
    setSearchDateValue("");
  };

  const submitSearch = () => {
    rememberSearch(searchQuery);
    setSearchOpen(false);
  };

  return (
    <div className="flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-bg-primary/50 px-4">
      <div className="flex items-center gap-2">
        {roomType === "dm" && (
          <div className="relative">
            {dmProfile?.avatar_url ? (
              <img
                src={dmProfile.avatar_url}
                alt={roomName}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                {roomName.charAt(0).toUpperCase()}
              </div>
            )}
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg-chat ${statusDotClass(dmStatus)}`}
            />
          </div>
        )}
        <span className="font-semibold text-text-primary">{roomName}</span>
        <span className="text-xs text-text-muted">
          {memberCount} member{memberCount !== 1 && "s"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onTogglePinnedPanel}
          disabled={!pinsAvailable}
          className="relative flex h-8 items-center justify-center rounded-md border border-bg-active/80 bg-bg-secondary/80 px-2 text-text-secondary transition hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          title={pinsAvailable ? "Toggle pinned messages" : "Pinned messages unavailable"}
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7.2 2.2a1 1 0 011.41 0l1.2 1.2h2.99a1 1 0 01.7 1.71L11.2 7.4v2.1l2.5 2.5a1 1 0 01-1.4 1.4L9.8 10.9v6.1a1 1 0 11-2 0v-6.1l-2.5 2.5a1 1 0 11-1.4-1.4l2.5-2.5V7.4L4 5.1A1 1 0 014.7 3.4h3l1.2-1.2z" />
          </svg>
          {pinsAvailable && pinnedCount > 0 && (
            <span className="absolute -right-1 -top-1 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">
              {pinnedCount}
            </span>
          )}
        </button>

        <div className="hidden items-center gap-2 md:flex">
          <div className="relative" ref={searchContainerRef}>
            <label className="flex h-8 w-[220px] items-center gap-2 rounded-md border border-bg-active/80 bg-bg-secondary/80 px-2.5 lg:w-[300px]">
              <svg
                className="h-3.5 w-3.5 flex-shrink-0 text-text-muted"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M8.5 3a5.5 5.5 0 014.363 8.85l3.643 3.643a1 1 0 01-1.414 1.414l-3.643-3.643A5.5 5.5 0 118.5 3zm-3.5 5.5a3.5 3.5 0 117 0 3.5 3.5 0 01-7 0z"
                  clipRule="evenodd"
                />
              </svg>
              <input
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitSearch();
                  }
                  if (event.key === "Escape") {
                    setSearchOpen(false);
                  }
                }}
                placeholder="Search in this room"
                className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
              />
              {searchQuery.trim().length > 0 && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    setSearchQuery("");
                    setSearchDateValue("");
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded text-text-muted hover:bg-bg-active hover:text-text-primary"
                  title="Clear search filters"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M4.22 4.22a.75.75 0 011.06 0L10 8.94l4.72-4.72a.75.75 0 111.06 1.06L11.06 10l4.72 4.72a.75.75 0 11-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 11-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 010-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}
            </label>

            {searchOpen && (
              <div className="absolute right-0 top-10 z-40 w-[340px] rounded-md border border-bg-active bg-bg-secondary shadow-2xl">
                <div className="border-b border-bg-active px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    Filters
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-1">
                    <button
                      type="button"
                      onClick={() => applyFilterToken("from:")}
                      className="flex items-center justify-between rounded px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-active hover:text-text-primary"
                    >
                      <span className="flex items-center gap-2">
                        <svg
                          className="h-3.5 w-3.5 text-text-muted"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M10 2a4 4 0 100 8 4 4 0 000-8zM3 16a7 7 0 1114 0v1H3v-1z" />
                        </svg>
                        <span>From a specific user</span>
                      </span>
                      <span className="text-[11px] text-text-muted">from:user</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFilterToken("has:link")}
                      className="flex items-center justify-between rounded px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-active hover:text-text-primary"
                    >
                      <span className="flex items-center gap-2">
                        <svg
                          className="h-3.5 w-3.5 text-text-muted"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M12.59 7.41a1 1 0 010 1.41l-3.3 3.3a1 1 0 01-1.42-1.42l3.3-3.3a1 1 0 011.42 0z" />
                          <path d="M7.76 14.24a4 4 0 010-5.66l2.12-2.12a4 4 0 015.66 5.66l-1.41 1.41a1 1 0 11-1.42-1.41l1.41-1.42a2 2 0 10-2.83-2.83L9.17 10a2 2 0 002.83 2.83 1 1 0 011.42 1.41 4 4 0 01-5.66 0z" />
                        </svg>
                        <span>Includes links</span>
                      </span>
                      <span className="text-[11px] text-text-muted">has:link</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFilterToken("mentions:")}
                      className="flex items-center justify-between rounded px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-active hover:text-text-primary"
                    >
                      <span className="flex items-center gap-2">
                        <svg
                          className="h-3.5 w-3.5 text-text-muted"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M10 2a8 8 0 00-8 8v2a4 4 0 004 4h1a1 1 0 000-2H6a2 2 0 01-2-2v-2a6 6 0 1112 0v2a2 2 0 01-2 2h-1.5a2.5 2.5 0 10.05 2H14a4 4 0 004-4v-2a8 8 0 00-8-8z" />
                        </svg>
                        <span>Mentions a user</span>
                      </span>
                      <span className="text-[11px] text-text-muted">mentions:user</span>
                    </button>
                  </div>

                  <div className="mt-2 rounded border border-bg-active/70 bg-bg-primary/40 p-2">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      Date Filter
                    </div>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={searchDateOperator}
                        onChange={(event) =>
                          setSearchDateOperator(event.target.value as SearchDateOperator)
                        }
                        className="rounded bg-bg-active px-1.5 py-1 text-[11px] text-text-secondary outline-none"
                      >
                        <option value="on">on</option>
                        <option value="before">before</option>
                        <option value="after">after</option>
                      </select>
                      <input
                        type="date"
                        value={searchDateValue}
                        onChange={(event) => setSearchDateValue(event.target.value)}
                        className="flex-1 rounded bg-bg-active px-1.5 py-1 text-[11px] text-text-secondary outline-none"
                      />
                      <button
                        type="button"
                        onClick={applyDateFilter}
                        disabled={!searchDateValue}
                        className="rounded bg-bg-active px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                    <div className="mt-1 text-[10px] text-text-muted">
                      Uses tokens like <code>{searchDateOperator}:YYYY-MM-DD</code>
                    </div>
                  </div>
                </div>

                {searchableMembers.length > 0 && (
                  <div className="border-b border-bg-active px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      Members
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {searchableMembers.map((memberName) => (
                        <button
                          key={memberName}
                          type="button"
                          onClick={() => applyFilterToken(`from:${memberName}`)}
                          className="rounded bg-bg-active px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary"
                        >
                          {memberName}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="px-3 py-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      History
                    </span>
                    {searchHistory.length > 0 && (
                      <button
                        type="button"
                        onClick={clearSearchHistory}
                        className="text-[11px] text-text-muted hover:text-text-primary"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {searchHistory.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-text-muted">
                        No recent searches.
                      </div>
                    )}
                    {searchHistory.map((entry) => (
                      <div
                        key={entry}
                        className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-bg-active"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery(entry);
                            setSearchOpen(false);
                          }}
                          className="min-w-0 flex-1 truncate text-left text-xs text-text-secondary hover:text-text-primary"
                          title={entry}
                        >
                          {entry}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSearchHistoryEntry(entry)}
                          className="text-[11px] text-text-muted hover:text-text-primary"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <label className="flex h-8 items-center rounded-md border border-bg-active/80 bg-bg-secondary/80 px-2">
            <input
              type="date"
              value={jumpDate}
              onChange={(event) => setJumpDate(event.target.value)}
              className="bg-transparent text-xs text-text-secondary outline-none"
            />
          </label>
        </div>

        {inVoiceInThisRoom ? (
          <div className="flex items-center gap-1.5">
            <span className="hidden rounded bg-success/15 px-2 py-1 text-[11px] font-semibold text-success lg:inline">
              In call {inRoomCallCount > 0 ? `(${inRoomCallCount})` : ""}
            </span>

            <button
              onClick={onToggleMute}
              className={`rounded p-1.5 transition ${
                isMuted
                  ? "bg-danger text-white"
                  : "bg-bg-active text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              }`}
              title={isMuted ? "Unmute microphone" : "Mute microphone"}
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
              </svg>
            </button>

            <button
              onClick={onToggleDeafen}
              className={`rounded p-1.5 transition ${
                isDeafened
                  ? "bg-danger text-white"
                  : "bg-bg-active text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              }`}
              title={isDeafened ? "Undeafen audio" : "Deafen audio"}
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            <button
              onClick={onLeaveVoice}
              className="flex items-center gap-1.5 rounded bg-danger px-3 py-1.5 text-xs font-medium text-white transition hover:bg-danger/80"
              title="Leave voice call"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 10a8 8 0 1116 0c0 1.44-.38 2.8-1.05 3.97a1 1 0 01-1.73-.99A5.98 5.98 0 0016 10a6 6 0 10-12 0c0 1.07.28 2.08.78 2.98a1 1 0 11-1.73.99A7.96 7.96 0 012 10z" />
              </svg>
              Leave
            </button>
          </div>
        ) : (
          <button
            onClick={onJoinVoice}
            disabled={connecting}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
              inVoiceInAnotherRoom
                ? "bg-accent/20 text-accent hover:bg-accent/30"
                : "bg-bg-active text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            }`}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
            </svg>
            {connecting
              ? "Connecting..."
              : inVoiceInAnotherRoom
                ? "Switch Voice"
                : "Join Voice"}
          </button>
        )}
      </div>
    </div>
  );
}

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { format, isToday, isYesterday } from "date-fns";
import { useAuthStore } from "@/stores/auth";
import { useFriendsStore } from "@/stores/friends";
import { useRoomsStore, type RoomWithDetails } from "@/stores/rooms";
import { addToast } from "@/stores/toast";
import { usePresenceStore, type StatusMode } from "@/stores/presence";

function statusDotClass(status: string) {
  if (status === "online") return "bg-online";
  if (status === "idle") return "bg-idle";
  if (status === "dnd") return "bg-dnd";
  return "bg-offline";
}

function statusModeLabel(mode: StatusMode, currentStatus: string) {
  if (mode === "auto") {
    return currentStatus === "idle" ? "Idle" : "Idle (Auto)";
  }
  if (mode === "dnd") return "Do Not Disturb";
  if (mode === "invisible") return "Invisible";
  return "Online";
}

function statusOptionDotClass(mode: StatusMode) {
  if (mode === "online") return "bg-online";
  if (mode === "auto") return "bg-idle";
  if (mode === "dnd") return "bg-dnd";
  return "bg-offline";
}

export function Sidebar() {
  const profile = useAuthStore((state) => state.profile);
  const logout = useAuthStore((state) => state.logout);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const user = useAuthStore((state) => state.user);
  const incoming = useFriendsStore((state) => state.incoming);
  const friends = useFriendsStore((state) => state.friends);
  const dmRooms = useRoomsStore((state) => state.dmRooms);
  const groupRooms = useRoomsStore((state) => state.groupRooms);
  const dmPeerByRoomId = useRoomsStore((state) => state.dmPeerByRoomId);
  const unreadByRoom = useRoomsStore((state) => state.unreadByRoom);
  const activeRoomId = useRoomsStore((state) => state.activeRoomId);
  const setActiveRoom = useRoomsStore((state) => state.setActiveRoom);
  const statusMode = usePresenceStore((state) => state.statusMode);
  const myStatus = usePresenceStore((state) => state.myStatus);
  const presenceByUser = usePresenceStore((state) => state.presenceByUser);
  const setStatusMode = usePresenceStore((state) => state.setStatusMode);

  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [avatarUrlDraft, setAvatarUrlDraft] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [roomQuery, setRoomQuery] = useState("");
  const [roomKeyboardIndex, setRoomKeyboardIndex] = useState(-1);
  const statusMenuContainerRef = useRef<HTMLDivElement | null>(null);

  const pendingCount = incoming().length;
  const dmRoomList = dmRooms();
  const groupRoomList = groupRooms();
  const normalizedRoomQuery = roomQuery.trim().toLowerCase();

  useEffect(() => {
    if (!profileEditorOpen) return;
    setDisplayNameDraft(profile?.display_name ?? "");
    setAvatarUrlDraft(profile?.avatar_url ?? "");
  }, [profileEditorOpen, profile?.display_name, profile?.avatar_url]);

  useEffect(() => {
    if (!statusMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!statusMenuContainerRef.current) return;
      if (!statusMenuContainerRef.current.contains(event.target as Node)) {
        setStatusMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setStatusMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [statusMenuOpen]);

  const getDmProfile = (room: RoomWithDetails) => {
    if (!user) return null;
    const other = room.members.find((member) => member.user_id !== user.id);
    if (other?.profile) return other.profile;

    const peerUserId = dmPeerByRoomId.get(room.id);
    if (!peerUserId) {
      if (dmRoomList.length === 1) {
        return friends()[0]?.profile ?? null;
      }
      return null;
    }

    const friend = friends().find((relationship) => relationship.to_id === peerUserId);
    return friend?.profile ?? null;
  };

  const getDmDisplayName = (room: RoomWithDetails) => {
    const roomProfile = getDmProfile(room);
    return roomProfile?.display_name ?? roomProfile?.username ?? "Direct Message";
  };

  const getRoomPreview = (room: RoomWithDetails) => {
    if (!room.last_message_content) {
      return "Start a conversation";
    }
    const prefix = room.last_message_author_id === user?.id ? "You: " : "";
    return `${prefix}${room.last_message_content}`;
  };

  const formatRoomTimestamp = (timestamp: string | null | undefined) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (isToday(date)) return format(date, "HH:mm");
    if (isYesterday(date)) return "Yday";
    return format(date, "MMM d");
  };

  const filteredDmRooms = normalizedRoomQuery
    ? dmRoomList.filter((room) => {
        const displayName = getDmDisplayName(room).toLowerCase();
        const preview = getRoomPreview(room).toLowerCase();
        return `${displayName} ${preview}`.includes(normalizedRoomQuery);
      })
    : dmRoomList;

  const filteredGroupRooms = normalizedRoomQuery
    ? groupRoomList.filter((room) => {
        const name = (room.name ?? "Group").toLowerCase();
        const preview = getRoomPreview(room).toLowerCase();
        return `${name} ${preview}`.includes(normalizedRoomQuery);
      })
    : groupRoomList;

  const navigableRooms = [
    ...filteredDmRooms.map((room) => room.id),
    ...filteredGroupRooms.map((room) => room.id),
  ];
  const navigableRoomsKey = navigableRooms.join("|");

  useEffect(() => {
    if (!normalizedRoomQuery) {
      setRoomKeyboardIndex(-1);
      return;
    }

    const roomIds = navigableRoomsKey ? navigableRoomsKey.split("|") : [];
    const currentIndex = roomIds.findIndex((roomId) => roomId === activeRoomId);
    setRoomKeyboardIndex(currentIndex);
  }, [normalizedRoomQuery, navigableRoomsKey, activeRoomId]);

  const handleStatusModeChange = async (mode: StatusMode) => {
    try {
      await setStatusMode(mode);
      addToast(`Status set to ${statusModeLabel(mode, myStatus)}`, "success");
      setStatusMenuOpen(false);
    } catch (error) {
      console.error("Failed to change status mode:", error);
      addToast("Could not update status mode", "error");
    }
  };

  const handleProfileSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingProfile) return;

    setSavingProfile(true);

    try {
      await updateProfile({
        display_name: displayNameDraft.trim() || null,
        avatar_url: avatarUrlDraft.trim() || null,
      });
      addToast("Profile updated", "success");
      setProfileEditorOpen(false);
    } catch (error) {
      console.error("Failed to update profile:", error);
      addToast("Could not update profile", "error");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleRoomSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && roomQuery) {
      event.preventDefault();
      setRoomQuery("");
      setRoomKeyboardIndex(-1);
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") {
      return;
    }

    if (navigableRooms.length === 0) return;

    if (event.key === "Enter") {
      if (roomKeyboardIndex >= 0) {
        setActiveRoom(navigableRooms[roomKeyboardIndex]);
      }
      return;
    }

    event.preventDefault();

    const delta = event.key === "ArrowDown" ? 1 : -1;
    let nextIndex = roomKeyboardIndex;

    if (nextIndex < 0) {
      nextIndex = delta > 0 ? 0 : navigableRooms.length - 1;
    } else {
      nextIndex = (nextIndex + delta + navigableRooms.length) % navigableRooms.length;
    }

    setRoomKeyboardIndex(nextIndex);
    setActiveRoom(navigableRooms[nextIndex]);
  };

  return (
    <>
      <div className="flex h-full w-60 flex-shrink-0 flex-col bg-bg-secondary">
        <div className="flex h-12 items-center border-b border-bg-primary/50 px-4">
          <span className="text-sm font-semibold text-text-primary">DatChat</span>
        </div>

        <div className="px-2 pt-2">
          <button
            onClick={() => setActiveRoom(null)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition ${
              activeRoomId === null
                ? "bg-bg-active text-text-primary"
                : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            }`}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Friends
            {pendingCount > 0 && (
              <span className="ml-auto rounded-full bg-danger px-1.5 py-0.5 text-xs font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        <div className="mt-2 px-2">
          <input
            value={roomQuery}
            onChange={(event) => setRoomQuery(event.target.value)}
            onKeyDown={handleRoomSearchKeyDown}
            placeholder="Search DMs and groups"
            className="w-full rounded bg-bg-input px-2 py-1.5 text-xs text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>

        <div className="mt-2 flex-1 overflow-y-auto px-2">
          <h3 className="mb-1 flex items-center px-2 text-xs font-semibold uppercase text-text-muted">
            Direct Messages
          </h3>
          {filteredDmRooms.map((room) => (
            <button
              key={room.id}
              onClick={() => setActiveRoom(room.id)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition ${
                activeRoomId === room.id
                  ? "bg-bg-active text-text-primary"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              } ${
                roomKeyboardIndex >= 0 && navigableRooms[roomKeyboardIndex] === room.id
                  ? "ring-1 ring-accent/60"
                  : ""
              }`}
            >
              {(() => {
                const roomProfile = getDmProfile(room);
                const displayName = getDmDisplayName(room);
                const dmStatus = roomProfile?.id
                  ? presenceByUser.get(roomProfile.id) ?? roomProfile.status ?? "offline"
                  : "offline";
                const unreadCount = unreadByRoom.get(room.id) ?? 0;

                return (
                  <>
                    <div className="relative">
                      {roomProfile?.avatar_url ? (
                        <img
                          src={roomProfile.avatar_url}
                          alt={displayName}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg-secondary ${statusDotClass(dmStatus)}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-medium">{displayName}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
                        <span className="truncate">{getRoomPreview(room)}</span>
                        <span className="ml-auto flex shrink-0 items-center gap-1">
                          {room.last_message_at && (
                            <span>{formatRoomTimestamp(room.last_message_at)}</span>
                          )}
                          {unreadCount > 0 && (
                            <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </button>
          ))}

          {filteredGroupRooms.length > 0 && (
            <>
              <h3 className="mb-1 mt-4 flex items-center px-2 text-xs font-semibold uppercase text-text-muted">
                Groups
              </h3>
              {filteredGroupRooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => setActiveRoom(room.id)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition ${
                    activeRoomId === room.id
                      ? "bg-bg-active text-text-primary"
                      : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                  } ${
                    roomKeyboardIndex >= 0 && navigableRooms[roomKeyboardIndex] === room.id
                      ? "ring-1 ring-accent/60"
                      : ""
                  }`}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-tertiary text-xs font-bold text-text-secondary">
                    {(room.name ?? "G").charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate flex-1 text-left">{room.name ?? "Group"}</span>
                  {(() => {
                    const unreadCount = unreadByRoom.get(room.id) ?? 0;
                    if (!unreadCount) return null;
                    return (
                      <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    );
                  })()}
                </button>
              ))}
            </>
          )}

          {normalizedRoomQuery && filteredDmRooms.length === 0 && filteredGroupRooms.length === 0 && (
            <div className="px-2 py-3 text-xs text-text-muted">
              No rooms match "{roomQuery.trim()}".
            </div>
          )}
        </div>

        <div
          ref={statusMenuContainerRef}
          className="relative border-t border-bg-primary/50 bg-bg-primary/30 px-2 py-2"
        >
          <div className="flex items-center gap-2">
            <div className="relative">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name ?? profile.username}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                  {(profile?.username ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={() => setStatusMenuOpen((open) => !open)}
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-secondary ${statusDotClass(myStatus)}`}
                title="Change status"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-text-primary">
                {profile?.display_name ?? profile?.username}
              </div>
              <button
                type="button"
                onClick={() => setStatusMenuOpen((open) => !open)}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
              >
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${statusDotClass(myStatus)}`}
                />
                <span className="truncate">{statusModeLabel(statusMode, myStatus)}</span>
              </button>
            </div>

            <button
              onClick={() => setProfileEditorOpen(true)}
              className="rounded p-1 text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
              title="Edit profile"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.586-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.414-8.586z"
                />
              </svg>
            </button>

            <button
              onClick={logout}
              className="rounded p-1 text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
              title="Logout"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>

          {statusMenuOpen && (
            <div
              className="absolute bottom-[calc(100%+8px)] left-2 right-2 z-40 rounded-md border border-bg-active bg-bg-secondary py-1 shadow-xl"
            >
              {[
                { mode: "online", label: "Online", description: "" },
                {
                  mode: "auto",
                  label: "Idle",
                  description: "Auto-idle after 5 minutes without activity.",
                },
                {
                  mode: "dnd",
                  label: "Do Not Disturb",
                  description: "You will not receive desktop notifications.",
                },
                {
                  mode: "invisible",
                  label: "Invisible",
                  description: "You will appear offline.",
                },
              ].map((option) => {
                const isSelected = option.mode === statusMode;
                return (
                  <button
                    key={option.mode}
                    type="button"
                    onClick={() => void handleStatusModeChange(option.mode as StatusMode)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-bg-hover"
                  >
                    <span
                      className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${statusOptionDotClass(option.mode as StatusMode)}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-text-primary">
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="block text-xs text-text-muted">
                          {option.description}
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <span className="text-xs font-semibold text-accent">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {profileEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={(event) => void handleProfileSave(event)}
            className="w-full max-w-md rounded-lg border border-bg-active bg-bg-secondary p-4"
          >
            <h2 className="text-lg font-semibold text-text-primary">Edit Profile</h2>
            <p className="mt-1 text-xs text-text-muted">
              Keep it simple for now — display name + avatar URL.
            </p>

            <label className="mt-4 block text-xs font-semibold text-text-muted">
              Display Name
            </label>
            <input
              value={displayNameDraft}
              onChange={(event) => setDisplayNameDraft(event.target.value)}
              placeholder={profile?.username ?? "Display name"}
              className="mt-1 w-full rounded bg-bg-input px-3 py-2 text-sm text-text-primary outline-none"
            />

            <label className="mt-3 block text-xs font-semibold text-text-muted">
              Avatar URL
            </label>
            <input
              value={avatarUrlDraft}
              onChange={(event) => setAvatarUrlDraft(event.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded bg-bg-input px-3 py-2 text-sm text-text-primary outline-none"
            />

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setProfileEditorOpen(false)}
                className="rounded bg-bg-active px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingProfile}
                className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {savingProfile ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

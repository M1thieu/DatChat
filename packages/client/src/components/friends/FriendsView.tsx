import { useState } from "react";
import { useFriendsStore } from "@/stores/friends";
import { useRoomsStore } from "@/stores/rooms";
import { addToast } from "@/stores/toast";
import { AddFriend } from "./AddFriend";

type Tab = "online" | "all" | "pending" | "blocked" | "add";
const shouldLogRealtime = import.meta.env.VITE_REALTIME_DEBUG === "true";

export function FriendsView() {
  const [tab, setTab] = useState<Tab>("online");
  const friendsList = useFriendsStore((s) => s.friends);
  const incomingList = useFriendsStore((s) => s.incoming);
  const outgoingList = useFriendsStore((s) => s.outgoing);
  const blockedList = useFriendsStore((s) => s.blocked);
  const acceptRequest = useFriendsStore((s) => s.acceptRequest);
  const rejectRequest = useFriendsStore((s) => s.rejectRequest);
  const removeFriend = useFriendsStore((s) => s.removeFriend);
  const unblockUser = useFriendsStore((s) => s.unblockUser);
  const setActiveRoom = useRoomsStore((s) => s.setActiveRoom);
  const fetchRooms = useRoomsStore((s) => s.fetchRooms);
  const setDmPeer = useRoomsStore((s) => s.setDmPeer);
  const dmPeerByRoomId = useRoomsStore((s) => s.dmPeerByRoomId);

  const friends = friendsList();
  const incoming = incomingList();
  const outgoing = outgoingList();
  const blocked = blockedList();
  const onlineFriends = friends.filter((f) => f.profile?.status !== "offline");
  const pendingCount = incoming.length + outgoing.length;

  const findDmRoomId = (friendId: string) => {
    const storeState = useRoomsStore.getState();
    const roomByMembers = storeState.rooms.find(
      (r) => r.type === "dm" && r.members.some((m) => m.user_id === friendId)
    )?.id;
    if (roomByMembers) return roomByMembers;

    const roomByStoredPeer = [...storeState.dmPeerByRoomId.entries()].find(
      ([roomId, peerId]) =>
        peerId === friendId &&
        storeState.rooms.some((room) => room.id === roomId && room.type === "dm")
    )?.[0];
    if (roomByStoredPeer) return roomByStoredPeer;

    const onlyDmRooms = storeState.rooms.filter((room) => room.type === "dm");
    if (onlyDmRooms.length === 1) return onlyDmRooms[0].id;

    return undefined;
  };

  const openDm = async (friendId: string) => {
    let dmRoomId = findDmRoomId(friendId);
    if (!dmRoomId) {
      await fetchRooms();
      dmRoomId = findDmRoomId(friendId);
    }

    if (shouldLogRealtime) {
      console.info("[DM] open request", {
        friendId,
        resolvedRoomId: dmRoomId ?? null,
        dmPeersStored: dmPeerByRoomId.size,
      });
    }

    if (dmRoomId) {
      setDmPeer(dmRoomId, friendId);
      setActiveRoom(dmRoomId);
      addToast("Opening DM", "success");
    } else {
      addToast(
        "No DM room found yet. If you just accepted, wait a second and try again.",
        "error"
      );
    }
  };

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "online", label: "Online" },
    { id: "all", label: "All" },
    { id: "pending", label: "Pending", badge: pendingCount || undefined },
    { id: "blocked", label: "Blocked" },
    { id: "add", label: "Add Friend" },
  ];

  return (
    <div className="flex h-full flex-1 flex-col bg-bg-chat">
      {/* Header with tabs */}
      <div className="flex h-12 flex-shrink-0 items-center gap-4 border-b border-bg-primary/50 px-4">
        <span className="font-semibold text-text-primary">Friends</span>
        <div className="h-6 w-px bg-bg-active" />
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1 rounded px-2 py-1 text-sm transition ${
              tab === t.id
                ? t.id === "add"
                  ? "bg-success text-white"
                  : "bg-bg-active text-text-primary"
                : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            }`}
          >
            {t.label}
            {t.badge && (
              <span className="ml-1 rounded-full bg-danger px-1.5 text-xs font-bold text-white">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "add" && <AddFriend />}

        {tab === "online" && (
          <>
            <h3 className="mb-2 text-xs font-semibold uppercase text-text-muted">
              Online — {onlineFriends.length}
            </h3>
            {onlineFriends.map((rel) => (
              <FriendRow
                key={rel.id}
                name={
                  rel.profile?.display_name ?? rel.profile?.username ?? "User"
                }
                status={rel.profile?.status ?? "offline"}
                onMessage={() => openDm(rel.to_id)}
                onRemove={async () => {
                  try {
                    await removeFriend(rel.to_id);
                    addToast("Friend removed", "success");
                  } catch (error) {
                    console.error("Remove friend error:", error);
                    addToast(error instanceof Error ? error.message : "Failed to remove friend", "error");
                  }
                }}
              />
            ))}
            {onlineFriends.length === 0 && (
              <p className="text-sm text-text-muted">
                No friends online right now.
              </p>
            )}
          </>
        )}

        {tab === "all" && (
          <>
            <h3 className="mb-2 text-xs font-semibold uppercase text-text-muted">
              All Friends — {friends.length}
            </h3>
            {friends.map((rel) => (
              <FriendRow
                key={rel.id}
                name={
                  rel.profile?.display_name ?? rel.profile?.username ?? "User"
                }
                status={rel.profile?.status ?? "offline"}
                onMessage={() => openDm(rel.to_id)}
                onRemove={async () => {
                  try {
                    await removeFriend(rel.to_id);
                    addToast("Friend removed", "success");
                  } catch (error) {
                    console.error("Remove friend error:", error);
                    addToast(error instanceof Error ? error.message : "Failed to remove friend", "error");
                  }
                }}
              />
            ))}
            {friends.length === 0 && (
              <p className="text-sm text-text-muted">
                No friends yet. Add someone!
              </p>
            )}
          </>
        )}

        {tab === "pending" && (
          <>
            {incoming.length > 0 && (
              <>
                <h3 className="mb-2 text-xs font-semibold uppercase text-text-muted">
                  Incoming — {incoming.length}
                </h3>
                {incoming.map((rel) => (
                  <div
                    key={rel.id}
                    className="flex items-center gap-3 rounded p-2 hover:bg-bg-hover"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                      {(
                        rel.profile?.display_name ??
                        rel.profile?.username ??
                        "?"
                      )
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <span className="flex-1 text-sm text-text-primary">
                      {rel.profile?.display_name ?? rel.profile?.username}
                    </span>
                    <button
                      onClick={async () => {
                        try {
                          const result = await acceptRequest(rel.to_id);

                          // Manually refetch rooms to load the new DM
                          await fetchRooms();

                          addToast("Friend request accepted! DM room created.", "success");

                          // Auto-open the DM room if it was created
                          if (result.room_id) {
                            setDmPeer(result.room_id, rel.to_id);
                            setActiveRoom(result.room_id);
                          }
                        } catch (error) {
                          console.error("Accept error:", error);
                          addToast(error instanceof Error ? error.message : "Failed to accept request", "error");
                        }
                      }}
                      className="rounded bg-success px-3 py-1 text-xs text-white hover:bg-success/80"
                    >
                      Accept
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await rejectRequest(rel.to_id);
                          addToast("Friend request ignored", "info");
                        } catch (error) {
                          console.error("Reject error:", error);
                          addToast(error instanceof Error ? error.message : "Failed to reject request", "error");
                        }
                      }}
                      className="rounded bg-bg-active px-3 py-1 text-xs text-text-secondary hover:bg-danger hover:text-white"
                    >
                      Ignore
                    </button>
                  </div>
                ))}
              </>
            )}
            {outgoing.length > 0 && (
              <>
                <h3 className="mb-2 mt-4 text-xs font-semibold uppercase text-text-muted">
                  Outgoing — {outgoing.length}
                </h3>
                {outgoing.map((rel) => (
                  <div
                    key={rel.id}
                    className="flex items-center gap-3 rounded p-2 hover:bg-bg-hover"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-tertiary text-xs font-bold text-text-secondary">
                      {(
                        rel.profile?.display_name ??
                        rel.profile?.username ??
                        "?"
                      )
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <span className="flex-1 text-sm text-text-secondary">
                      {rel.profile?.display_name ?? rel.profile?.username}
                    </span>
                    <span className="text-xs text-text-muted">
                      Outgoing request
                    </span>
                  </div>
                ))}
              </>
            )}
            {incoming.length === 0 && outgoing.length === 0 && (
              <p className="text-sm text-text-muted">
                No pending friend requests.
              </p>
            )}
          </>
        )}

        {tab === "blocked" && (
          <>
            <h3 className="mb-2 text-xs font-semibold uppercase text-text-muted">
              Blocked — {blocked.length}
            </h3>
            {blocked.map((rel) => (
              <div
                key={rel.id}
                className="flex items-center gap-3 rounded p-2 hover:bg-bg-hover"
              >
                <span className="flex-1 text-sm text-text-secondary">
                  {rel.profile?.display_name ?? rel.profile?.username}
                </span>
                <button
                  onClick={async () => {
                    await unblockUser(rel.to_id);
                    addToast("User unblocked", "success");
                  }}
                  className="rounded bg-bg-active px-3 py-1 text-xs text-text-secondary hover:text-text-primary"
                >
                  Unblock
                </button>
              </div>
            ))}
            {blocked.length === 0 && (
              <p className="text-sm text-text-muted">
                No blocked users.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FriendRow({
  name,
  status,
  onMessage,
  onRemove,
}: {
  name: string;
  status: string;
  onMessage: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 rounded p-2 hover:bg-bg-hover">
      <div className="relative">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
          {name.charAt(0).toUpperCase()}
        </div>
        <div
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-chat ${
            status === "online"
              ? "bg-online"
              : status === "idle"
                ? "bg-idle"
                : status === "dnd"
                  ? "bg-dnd"
                  : "bg-offline"
          }`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text-primary">{name}</div>
        <div className="text-xs capitalize text-text-muted">{status}</div>
      </div>
      <div className="hidden gap-1 group-hover:flex">
        <button
          onClick={onMessage}
          className="rounded-full bg-bg-active p-2 text-text-secondary hover:text-text-primary"
          title="Message"
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
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </button>
        <button
          onClick={onRemove}
          className="rounded-full bg-bg-active p-2 text-text-secondary hover:text-danger"
          title="Remove friend"
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

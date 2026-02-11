import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useRoomsStore } from "@/stores/rooms";
import { useAuthStore } from "@/stores/auth";
import { useFriendsStore } from "@/stores/friends";
import { useMessagesStore } from "@/stores/messages";
import { usePresenceStore } from "@/stores/presence";
import { useVoiceStore } from "@/stores/voice";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import { RoomHeader } from "@/components/chat/RoomHeader";
import { FriendsView } from "@/components/friends/FriendsView";

interface RoomSearchState {
  query: string;
  jumpDate: string;
}

export function ChatArea() {
  const activeRoom = useRoomsStore((s) => s.activeRoom);
  const dmRooms = useRoomsStore((s) => s.dmRooms);
  const dmPeerByRoomId = useRoomsStore((s) => s.dmPeerByRoomId);
  const activeRoomId = useRoomsStore((s) => s.activeRoomId);
  const markRoomRead = useRoomsStore((s) => s.markRoomRead);
  const user = useAuthStore((s) => s.user);
  const friends = useFriendsStore((s) => s.friends);
  const pinnedMessagesByRoom = useMessagesStore((s) => s.pinnedMessagesByRoom);
  const pinsAvailable = useMessagesStore((s) => s.pinsAvailable);
  const presenceByUser = usePresenceStore((s) => s.presenceByUser);
  const currentRoomId = useVoiceStore((s) => s.currentRoomId);
  const participants = useVoiceStore((s) => s.participants);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const connecting = useVoiceStore((s) => s.connecting);
  const voiceError = useVoiceStore((s) => s.error);
  const joinVoice = useVoiceStore((s) => s.joinVoice);
  const leaveVoice = useVoiceStore((s) => s.leaveVoice);
  const toggleMute = useVoiceStore((s) => s.toggleMute);
  const toggleDeafen = useVoiceStore((s) => s.toggleDeafen);
  const clearVoiceError = useVoiceStore((s) => s.clearError);
  const [searchByRoom, setSearchByRoom] = useState<Record<string, RoomSearchState>>({});
  const [pinnedPanelToggleSignal, setPinnedPanelToggleSignal] = useState(0);

  useEffect(() => {
    if (!activeRoomId) return;
    markRoomRead(activeRoomId);
  }, [activeRoomId, markRoomRead]);

  if (!activeRoomId || !activeRoom()) {
    return <FriendsView />;
  }

  const setSearchQuery: Dispatch<SetStateAction<string>> = (value) => {
    setSearchByRoom((previous) => {
      const current = previous[activeRoomId]?.query ?? "";
      const nextValue =
        typeof value === "function" ? (value as (previousValue: string) => string)(current) : value;

      if (nextValue === current) return previous;

      return {
        ...previous,
        [activeRoomId]: {
          query: nextValue,
          jumpDate: previous[activeRoomId]?.jumpDate ?? "",
        },
      };
    });
  };

  const setJumpDate: Dispatch<SetStateAction<string>> = (value) => {
    setSearchByRoom((previous) => {
      const current = previous[activeRoomId]?.jumpDate ?? "";
      const nextValue =
        typeof value === "function" ? (value as (previousValue: string) => string)(current) : value;

      if (nextValue === current) return previous;

      return {
        ...previous,
        [activeRoomId]: {
          query: previous[activeRoomId]?.query ?? "",
          jumpDate: nextValue,
        },
      };
    });
  };

  const searchState = searchByRoom[activeRoomId];
  const searchQuery = searchState?.query ?? "";
  const jumpDate = searchState?.jumpDate ?? "";

  const room = activeRoom()!;
  const inVoiceInThisRoom = currentRoomId === activeRoomId;
  const inVoiceInAnotherRoom = Boolean(currentRoomId && currentRoomId !== activeRoomId);
  const inRoomCallCount = inVoiceInThisRoom ? participants.length : 0;
  const otherMember = room.members.find((member) => member.user_id !== user?.id)?.profile;
  const peerUserId = dmPeerByRoomId.get(room.id);
  const fallbackFriendProfile = peerUserId
    ? friends().find((relationship) => relationship.to_id === peerUserId)?.profile
    : room.type === "dm" && dmRooms().length === 1
      ? friends()[0]?.profile ?? null
      : null;
  const dmProfile = otherMember ?? fallbackFriendProfile ?? null;
  const dmStatus = dmProfile?.id
    ? presenceByUser.get(dmProfile.id) ?? dmProfile.status ?? "offline"
    : "offline";

  const roomName =
    room.type === "dm"
      ? dmProfile?.display_name ?? dmProfile?.username ?? "Direct Message"
      : room.name ?? "Group";

  const memberCount =
    room.type === "dm"
      ? dmProfile
        ? 2
        : Math.max(room.members.length, 1)
      : room.members.length;
  const pinnedCount = pinnedMessagesByRoom.get(room.id)?.length ?? 0;

  const searchableMembers = (() => {
    const seen = new Set<string>();
    const members: string[] = [];

    for (const member of room.members) {
      const profile = member.profile;
      if (!profile) continue;

      const currentLabel = profile.display_name?.trim() || profile.username?.trim();
      if (!currentLabel) continue;

      const normalized = currentLabel.toLowerCase();
      if (seen.has(normalized)) continue;

      seen.add(normalized);
      members.push(currentLabel);
    }

    return members.slice(0, 6);
  })();

  const handleJoinVoice = () => {
    if (voiceError) {
      clearVoiceError();
    }
    void joinVoice(activeRoomId);
  };

  return (
    <div className="flex h-full flex-1 flex-col bg-bg-chat">
      <RoomHeader
        key={room.id}
        roomType={room.type}
        roomName={roomName}
        memberCount={memberCount}
        dmProfile={dmProfile}
        dmStatus={dmStatus}
        searchableMembers={searchableMembers}
        pinsAvailable={pinsAvailable}
        pinnedCount={pinnedCount}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        jumpDate={jumpDate}
        setJumpDate={setJumpDate}
        onTogglePinnedPanel={() => setPinnedPanelToggleSignal((value) => value + 1)}
        inVoiceInThisRoom={inVoiceInThisRoom}
        inVoiceInAnotherRoom={inVoiceInAnotherRoom}
        inRoomCallCount={inRoomCallCount}
        isMuted={isMuted}
        isDeafened={isDeafened}
        connecting={connecting}
        onJoinVoice={handleJoinVoice}
        onLeaveVoice={leaveVoice}
        onToggleMute={toggleMute}
        onToggleDeafen={toggleDeafen}
      />

      {voiceError && !inVoiceInThisRoom && (
        <div className="mx-4 mt-2 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          Voice setup: {voiceError}
        </div>
      )}

      <MessageList
        key={`${activeRoomId}:${user?.id ?? "anon"}:messages`}
        roomId={activeRoomId}
        searchQuery={searchQuery}
        jumpDate={jumpDate}
        pinnedPanelToggleSignal={pinnedPanelToggleSignal}
      />

      <MessageInput
        key={`${activeRoomId}:${user?.id ?? "anon"}:composer`}
        roomId={activeRoomId}
        roomName={roomName}
      />
    </div>
  );
}

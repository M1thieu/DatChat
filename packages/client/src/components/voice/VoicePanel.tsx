import { useRoomsStore } from "@/stores/rooms";
import { useVoiceStore } from "@/stores/voice";

function audioLevelPercent(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 6;
  return Math.max(6, Math.min(100, Math.round(level * 100)));
}

/**
 * Bottom panel showing voice participants and quick controls.
 * Visible while connecting, connected, or when a voice error occurs.
 */
export function VoicePanel() {
  const currentRoomId = useVoiceStore((s) => s.currentRoomId);
  const connecting = useVoiceStore((s) => s.connecting);
  const error = useVoiceStore((s) => s.error);
  const clearError = useVoiceStore((s) => s.clearError);
  const participants = useVoiceStore((s) => s.participants);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const toggleMute = useVoiceStore((s) => s.toggleMute);
  const toggleDeafen = useVoiceStore((s) => s.toggleDeafen);
  const leaveVoice = useVoiceStore((s) => s.leaveVoice);

  const rooms = useRoomsStore((s) => s.rooms);
  const activeRoomId = useRoomsStore((s) => s.activeRoomId);
  const setActiveRoom = useRoomsStore((s) => s.setActiveRoom);

  const currentRoom = currentRoomId ? rooms.find((room) => room.id === currentRoomId) : null;
  const roomName = currentRoom?.name ?? (currentRoom?.type === "dm" ? "Direct Message" : "Voice Room");

  if (!currentRoomId) {
    if (connecting) {
      return (
        <div className="flex min-h-12 flex-shrink-0 items-center justify-between gap-3 border-t border-bg-primary/50 bg-bg-secondary px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-text-muted/40 border-t-text-muted" />
            <span>Connecting to voice...</span>
          </div>
        </div>
      );
    }

    if (!error) return null;

    return (
      <div className="flex min-h-12 flex-shrink-0 items-center justify-between gap-3 border-t border-bg-primary/50 bg-bg-secondary px-4 py-2">
        <div>
          <div className="text-xs font-semibold text-danger">Voice unavailable</div>
          <div className="text-xs text-text-muted">{error}</div>
        </div>
        <button
          onClick={clearError}
          className="rounded bg-bg-active px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-16 flex-shrink-0 items-center gap-3 border-t border-bg-primary/50 bg-bg-secondary px-4 py-2">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success">
          <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
          </svg>
        </div>
        <div>
          <div className="text-xs font-semibold text-success">Voice connected</div>
          <div className="text-xs text-text-muted">
            {roomName} - {participants.length} participant{participants.length !== 1 && "s"}
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center gap-2 overflow-x-auto">
        {participants.map((participant) => (
          <div
            key={participant.userId}
            className={`min-w-[128px] rounded border px-2 py-1.5 transition ${
              participant.isSpeaking
                ? "border-success/80 bg-success/10"
                : "border-bg-active/60 bg-bg-primary/60"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-xs font-medium text-text-primary">
                {participant.username}
                {participant.isLocal ? " (You)" : ""}
              </div>
              {participant.isMuted && (
                <svg className="h-3 w-3 flex-shrink-0 text-danger" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>
            <div className="mt-1 h-1 rounded bg-bg-active/80">
              <div
                className={`h-1 rounded ${
                  participant.isSpeaking ? "bg-success" : "bg-text-muted/60"
                }`}
                style={{ width: `${audioLevelPercent(participant.audioLevel)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {activeRoomId !== currentRoomId && (
          <button
            onClick={() => setActiveRoom(currentRoomId)}
            className="hidden rounded bg-bg-active px-2 py-1.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary lg:inline"
            title="Open voice room"
          >
            Open room
          </button>
        )}

        <button
          onClick={toggleMute}
          className={`rounded p-2 transition ${
            isMuted
              ? "bg-danger text-white"
              : "bg-bg-active text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          }`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            {isMuted ? (
              <path
                fillRule="evenodd"
                d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z"
                clipRule="evenodd"
              />
            ) : (
              <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
            )}
          </svg>
        </button>

        <button
          onClick={toggleDeafen}
          className={`rounded p-2 transition ${
            isDeafened
              ? "bg-danger text-white"
              : "bg-bg-active text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          }`}
          title={isDeafened ? "Undeafen" : "Deafen"}
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            {isDeafened ? (
              <path
                fillRule="evenodd"
                d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            ) : (
              <path
                fillRule="evenodd"
                d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"
                clipRule="evenodd"
              />
            )}
          </svg>
        </button>

        <button
          onClick={leaveVoice}
          className="rounded bg-danger px-3 py-2 text-xs font-medium text-white transition hover:bg-danger/80"
          title="Disconnect voice"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

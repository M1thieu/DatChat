import { create } from "zustand";
import { Room, RoomEvent, Track } from "livekit-client";
import { supabase } from "@/lib/supabase";
import { addToast } from "@/stores/toast";

const VOICE_SESSION_STORAGE_KEY = "datchat.voice.activeSession";
const VOICE_SESSION_HEARTBEAT_MS = 10_000;
const VOICE_SESSION_STALE_MS = 45_000;

interface VoiceParticipant {
  userId: string;
  username: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  audioLevel: number;
}

interface VoiceState {
  currentRoomId: string | null;
  livekitRoom: Room | null;
  participants: VoiceParticipant[];
  isMuted: boolean;
  isDeafened: boolean;
  connecting: boolean;
  error: string | null;

  joinVoice: (roomId: string) => Promise<void>;
  leaveVoice: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  clearError: () => void;
}

const attachedAudioElements = new Set<HTMLMediaElement>();
let voiceSessionHeartbeatTimer: ReturnType<typeof setInterval> | null = null;

interface PersistedVoiceSession {
  roomId: string;
  userId: string;
  updatedAt: number;
}

function readPersistedVoiceSession(): PersistedVoiceSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(VOICE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedVoiceSession;
    if (!parsed?.roomId || !parsed?.userId || !parsed?.updatedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersistedVoiceSession(session: PersistedVoiceSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VOICE_SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearPersistedVoiceSession() {
  if (voiceSessionHeartbeatTimer) {
    clearInterval(voiceSessionHeartbeatTimer);
    voiceSessionHeartbeatTimer = null;
  }

  if (typeof window === "undefined") return;
  window.localStorage.removeItem(VOICE_SESSION_STORAGE_KEY);
}

function startVoiceSessionHeartbeat(roomId: string, userId: string) {
  writePersistedVoiceSession({ roomId, userId, updatedAt: Date.now() });

  if (voiceSessionHeartbeatTimer) {
    clearInterval(voiceSessionHeartbeatTimer);
  }

  voiceSessionHeartbeatTimer = setInterval(() => {
    writePersistedVoiceSession({ roomId, userId, updatedAt: Date.now() });
  }, VOICE_SESSION_HEARTBEAT_MS);
}

function pruneStaleVoiceSession(currentUserId: string) {
  const persistedSession = readPersistedVoiceSession();
  if (!persistedSession) return;

  const isDifferentUser = persistedSession.userId !== currentUserId;
  const isStale = Date.now() - persistedSession.updatedAt > VOICE_SESSION_STALE_MS;
  if (isDifferentUser || isStale) {
    clearPersistedVoiceSession();
  }
}

function cleanupAttachedAudioElements() {
  for (const element of attachedAudioElements) {
    try {
      element.pause();
    } catch {
      // Ignore playback errors during teardown.
    }
    element.remove();
  }
  attachedAudioElements.clear();
}

function resetVoiceState(set: (state: Partial<VoiceState>) => void) {
  set({
    currentRoomId: null,
    livekitRoom: null,
    participants: [],
    isMuted: false,
    isDeafened: false,
    connecting: false,
  });
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  currentRoomId: null,
  livekitRoom: null,
  participants: [],
  isMuted: false,
  isDeafened: false,
  connecting: false,
  error: null,

  joinVoice: async (roomId: string) => {
    set({ connecting: true, error: null });

    try {
      const currentRoom = get().livekitRoom;
      if (currentRoom) {
        currentRoom.disconnect();
        cleanupAttachedAudioElements();
        clearPersistedVoiceSession();
        resetVoiceState(set);
      }

      let {
        data: { session },
      } = await supabase.auth.getSession();

      const expiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
      const needsRefresh = !session || Date.now() >= expiresAt - 30_000;
      if (needsRefresh) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          throw new Error("Session expired. Please sign in again.");
        }
        session = refreshed.session;
      }

      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error("Please sign in again before joining voice.");
      }

      const currentUserId = session?.user?.id;
      if (!currentUserId) {
        throw new Error("Please sign in again before joining voice.");
      }
      pruneStaleVoiceSession(currentUserId);

      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-token`;
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ room_id: roomId }),
      });

      if (!response.ok) {
        const raw = await response.text();
        let errorMessage = raw;
        try {
          const parsed = JSON.parse(raw) as { error?: string; message?: string };
          errorMessage = parsed.error ?? parsed.message ?? raw;
        } catch {
          // Keep raw text
        }

        throw new Error(`Voice token request failed (${response.status}): ${errorMessage}`);
      }

      const data = (await response.json()) as { token?: string; url?: string };
      if (!data?.token || !data?.url) {
        throw new Error("Invalid voice token response");
      }

      // Create LiveKit room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      // Set up event listeners
      room.on(RoomEvent.TrackSubscribed, (track: Track) => {
        if (track.kind === Track.Kind.Audio) {
          const audioElement = track.attach();
          document.body.appendChild(audioElement);
          attachedAudioElements.add(audioElement);
        }
        updateParticipants(room, set);
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: Track) => {
        if (track.kind === Track.Kind.Audio) {
          const detached = track.detach();
          detached.forEach((element) => {
            attachedAudioElements.delete(element);
            element.remove();
          });
        }
        updateParticipants(room, set);
      });

      room.on(RoomEvent.ParticipantConnected, () => {
        updateParticipants(room, set);
      });

      room.on(RoomEvent.ParticipantDisconnected, () => {
        updateParticipants(room, set);
      });

      room.on(RoomEvent.ActiveSpeakersChanged, () => {
        updateParticipants(room, set);
      });

      room.on(RoomEvent.LocalTrackPublished, () => {
        updateParticipants(room, set);
      });

      room.on(RoomEvent.LocalTrackUnpublished, () => {
        updateParticipants(room, set);
      });

      room.on(RoomEvent.TrackMuted, () => {
        updateParticipants(room, set);
      });

      room.on(RoomEvent.TrackUnmuted, () => {
        updateParticipants(room, set);
      });

      room.on(RoomEvent.Disconnected, () => {
        cleanupAttachedAudioElements();
        clearPersistedVoiceSession();
        resetVoiceState(set);
      });

      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        // Handle audio playback
      });

      // Connect to LiveKit
      await room.connect(data.url, data.token);

      set({
        currentRoomId: roomId,
        livekitRoom: room,
        isMuted: !room.localParticipant.isMicrophoneEnabled,
        connecting: false,
      });
      startVoiceSessionHeartbeat(roomId, currentUserId);

      updateParticipants(room, set);
    } catch (err) {
      console.error("Failed to join voice:", err);
      clearPersistedVoiceSession();

      const rawMessage =
        err instanceof Error ? err.message : "Failed to join voice";
      const normalized = rawMessage.toLowerCase();

      const friendlyMessage = normalized.includes("not a member")
        ? "You are not a member of this room."
        : normalized.includes("401") || normalized.includes("unauthorized")
          ? "Voice auth failed. Please sign out and sign in again."
        : normalized.includes("voice server not configured")
          ? "Voice server is not configured (LIVEKIT secrets missing)."
          : normalized.includes("failed to send a request") ||
              normalized.includes("fetch")
            ? "Voice service unreachable. Deploy voice-token and fix CORS/secrets."
            : rawMessage;

      addToast(friendlyMessage, "error");
      set({
        error: friendlyMessage,
        connecting: false,
      });
    }
  },

  leaveVoice: () => {
    const { livekitRoom } = get();
    if (livekitRoom) {
      livekitRoom.disconnect();
    }

    cleanupAttachedAudioElements();
    clearPersistedVoiceSession();
    resetVoiceState(set);
  },

  toggleMute: () => {
    const { livekitRoom, isMuted } = get();
    if (!livekitRoom) return;

    livekitRoom.localParticipant.setMicrophoneEnabled(isMuted);
    set({ isMuted: !isMuted });
  },

  toggleDeafen: () => {
    const { livekitRoom, isDeafened } = get();
    if (!livekitRoom) return;

    const newDeafened = !isDeafened;

    // Deafen = mute + disable audio output
    if (newDeafened) {
      livekitRoom.localParticipant.setMicrophoneEnabled(false);
      // Mute all remote tracks
      livekitRoom.remoteParticipants.forEach((p) => {
        p.audioTrackPublications.forEach((pub) => {
          pub.setEnabled(false);
        });
      });
    } else {
      // Unmute all remote tracks
      livekitRoom.remoteParticipants.forEach((p) => {
        p.audioTrackPublications.forEach((pub) => {
          pub.setEnabled(true);
        });
      });
    }

    set({ isDeafened: newDeafened, isMuted: newDeafened });
  },

  clearError: () => {
    set({ error: null });
  },
}));

// Helper to update participant list
function updateParticipants(room: Room, set: (state: Partial<VoiceState>) => void) {
  const participants: VoiceParticipant[] = [];

  // Add local participant
  participants.push({
    userId: room.localParticipant.identity,
    username: room.localParticipant.name || "You",
    isLocal: true,
    isSpeaking: room.localParticipant.isSpeaking,
    isMuted: !room.localParticipant.isMicrophoneEnabled,
    audioLevel: room.localParticipant.audioLevel,
  });

  // Add remote participants
  room.remoteParticipants.forEach((p) => {
    participants.push({
      userId: p.identity,
      username: p.name || "User",
      isLocal: false,
      isSpeaking: p.isSpeaking,
      isMuted: !p.isMicrophoneEnabled,
      audioLevel: p.audioLevel,
    });
  });

  set({ participants });
}

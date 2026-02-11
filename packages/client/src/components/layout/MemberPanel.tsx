import { useRoomsStore } from "@/stores/rooms";

export function MemberPanel() {
  const activeRoom = useRoomsStore((s) => s.activeRoom);
  const room = activeRoom();

  if (!room) return null;

  return (
    <div className="flex h-full w-60 flex-shrink-0 flex-col bg-bg-secondary">
      <div className="flex h-12 items-center border-b border-bg-primary/50 px-4">
        <span className="text-xs font-semibold uppercase text-text-muted">
          Members — {room.members.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {room.members.map((member) => (
          <div
            key={member.user_id}
            className="flex items-center gap-2 rounded px-2 py-1 hover:bg-bg-hover"
          >
            <div className="relative">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                {(
                  member.profile?.display_name ??
                  member.profile?.username ??
                  "?"
                )
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <div
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-secondary ${
                  member.profile?.status === "online"
                    ? "bg-online"
                    : member.profile?.status === "idle"
                      ? "bg-idle"
                      : member.profile?.status === "dnd"
                        ? "bg-dnd"
                        : "bg-offline"
                }`}
              />
            </div>
            <span className="truncate text-sm text-text-secondary">
              {member.profile?.display_name ?? member.profile?.username}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

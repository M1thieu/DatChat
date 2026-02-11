import { useState, type FormEvent } from "react";
import { useFriendsStore } from "@/stores/friends";

export function AddFriend() {
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const sendRequest = useFriendsStore((s) => s.sendRequest);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) return;

    try {
      await sendRequest(trimmed);
      setStatus("success");
      setMessage(`Friend request sent to ${trimmed}!`);
      setUsername("");
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Failed to send request"
      );
    }
  };

  return (
    <div className="mb-6">
      <h3 className="mb-1 text-sm font-semibold uppercase text-text-primary">
        Add Friend
      </h3>
      <p className="mb-3 text-sm text-text-secondary">
        You can add friends by their username.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setStatus("idle");
            }}
            placeholder="Enter a username"
            className={`w-full rounded-lg bg-bg-primary px-4 py-2.5 text-sm text-text-primary outline-none ring-1 ${
              status === "error"
                ? "ring-danger"
                : status === "success"
                  ? "ring-success"
                  : "ring-bg-active focus:ring-accent"
            }`}
          />
        </div>
        <button
          type="submit"
          disabled={!username.trim()}
          className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
        >
          Send Friend Request
        </button>
      </form>

      {status !== "idle" && (
        <p
          className={`mt-2 text-sm ${
            status === "success" ? "text-success" : "text-danger"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

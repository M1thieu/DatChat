import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars.\n" +
      "Create a .env.local file in packages/client/ with:\n" +
      "VITE_SUPABASE_URL=http://127.0.0.1:54321\n" +
      "VITE_SUPABASE_ANON_KEY=<your-anon-key>"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const shouldLogRealtime = import.meta.env.VITE_REALTIME_DEBUG === "true";

if (shouldLogRealtime) {
  supabase.realtime.stateChangeCallbacks.open.push(() => {
    console.info("[Realtime] socket OPEN");
  });

  supabase.realtime.stateChangeCallbacks.close.push((event: unknown) => {
    console.warn("[Realtime] socket CLOSE", {
      event,
    });
  });

  supabase.realtime.stateChangeCallbacks.error.push((error: unknown) => {
    console.error("[Realtime] socket ERROR", error);
  });

  supabase.realtime.onHeartbeat((status, latency) => {
    if (status === "ok" || status === "sent") return;
    console.warn("[Realtime] heartbeat", { status, latency });
  });
}

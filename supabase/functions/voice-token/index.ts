// Edge Function: Generate LiveKit voice token
// Called when a user wants to join a voice room.
//
// POST /functions/v1/voice-token
// Body: { room_id: string }
// Returns: { token: string, url: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET") ?? "";
const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return new Response(JSON.stringify({ error: "Supabase function env not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: authError?.message ?? "Unauthorized" }),
        {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request
    const { room_id } = await req.json();
    if (!room_id) {
      return new Response(JSON.stringify({ error: "room_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is a member of the room
    const { data: membership } = await supabase
      .from("room_members")
      .select("user_id")
      .eq("room_id", room_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Not a member of this room" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user profile for display name
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", user.id)
      .single();

    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      return new Response(
        JSON.stringify({ error: "Voice server not configured" }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate LiveKit token
    // Using LiveKit's JWT format manually (no Deno SDK yet)
    const token = await generateLiveKitToken({
      apiKey: LIVEKIT_API_KEY,
      apiSecret: LIVEKIT_API_SECRET,
      roomName: room_id,
      participantIdentity: user.id,
      participantName: profile?.display_name ?? profile?.username ?? "User",
    });

    return new Response(
      JSON.stringify({ token, url: LIVEKIT_URL }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// ── LiveKit JWT generation ───────────────────────────
// LiveKit tokens are standard JWTs with specific claims.

async function generateLiveKitToken(opts: {
  apiKey: string;
  apiSecret: string;
  roomName: string;
  participantIdentity: string;
  participantName: string;
}): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: opts.apiKey,
    sub: opts.participantIdentity,
    name: opts.participantName,
    nbf: now,
    exp: now + 6 * 3600, // 6 hours
    iat: now,
    jti: crypto.randomUUID(),
    video: {
      room: opts.roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };

  const enc = new TextEncoder();
  const b64Header = base64url(JSON.stringify(header));
  const b64Payload = base64url(JSON.stringify(payload));
  const signingInput = `${b64Header}.${b64Payload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(opts.apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(signingInput)
  );

  const b64Signature = base64url(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return `${signingInput}.${b64Signature}`;
}

function base64url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

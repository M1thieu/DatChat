// Edge Function: Unfurl link (Open Graph preview)
// Called client-side after a message with a URL is sent.
//
// POST /functions/v1/unfurl-link
// Body: { url: string, message_id: string }
// Returns: { title, description, image_url, site_name }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to insert embed (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify the user is authenticated
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { url, message_id } = await req.json();
    if (!url || !message_id) {
      return new Response(
        JSON.stringify({ error: "url and message_id required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if embed already exists for this URL + message
    const { data: existing } = await supabaseAdmin
      .from("message_embeds")
      .select("id")
      .eq("message_id", message_id)
      .eq("url", url)
      .single();

    if (existing) {
      return new Response(JSON.stringify({ status: "already_exists" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the URL and extract Open Graph data
    const og = await fetchOpenGraph(url);

    if (!og.title && !og.description && !og.image_url) {
      return new Response(JSON.stringify({ status: "no_og_data" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert embed
    const { data: embed, error: insertError } = await supabaseAdmin
      .from("message_embeds")
      .insert({
        message_id,
        url,
        title: og.title,
        description: og.description,
        image_url: og.image_url,
        site_name: og.site_name,
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return new Response(JSON.stringify(embed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// ── Open Graph fetcher ───────────────────────────────

interface OGData {
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
}

async function fetchOpenGraph(url: string): Promise<OGData> {
  const result: OGData = {
    title: null,
    description: null,
    image_url: null,
    site_name: null,
  };

  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "DatChat/1.0 (Link Preview Bot)",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) return result;

    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return result;

    // Only read first 50KB to avoid huge pages
    const reader = resp.body?.getReader();
    if (!reader) return result;

    let html = "";
    const decoder = new TextDecoder();
    let bytesRead = 0;
    const maxBytes = 50_000;

    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      bytesRead += value.length;
    }
    reader.cancel();

    // Extract OG tags with regex (good enough for meta tags)
    result.title = extractMeta(html, "og:title") ?? extractTag(html, "title");
    result.description =
      extractMeta(html, "og:description") ??
      extractMeta(html, "description");
    result.image_url = extractMeta(html, "og:image");
    result.site_name = extractMeta(html, "og:site_name");

    // Truncate
    if (result.title && result.title.length > 256)
      result.title = result.title.slice(0, 256);
    if (result.description && result.description.length > 1024)
      result.description = result.description.slice(0, 1024);
  } catch {
    // Silently fail — unfurling is best-effort
  }

  return result;
}

function extractMeta(html: string, property: string): string | null {
  // Match <meta property="og:title" content="..."> or <meta name="description" content="...">
  const re = new RegExp(
    `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`,
    "i"
  );
  const match = html.match(re);
  if (match) return decodeEntities(match[1]);

  // Also try reversed order: content before property
  const re2 = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
    "i"
  );
  const match2 = html.match(re2);
  return match2 ? decodeEntities(match2[1]) : null;
}

function extractTag(html: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const match = html.match(re);
  return match ? decodeEntities(match[1].trim()) : null;
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

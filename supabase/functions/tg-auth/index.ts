// tg-auth — verifies Telegram WebApp initData and returns a Supabase session.
//
// Flow:
//  1) Parse + HMAC-verify initData against TELEGRAM_BOT_TOKEN (Telegram spec).
//  2) Derive a deterministic email/password from the bot token + telegram_id.
//  3) Ensure auth.users row exists (admin.createUser idempotent).
//  4) Upsert tg_users row, linking auth_user_id.
//  5) Sign in via password to obtain access_token + refresh_token, return JSON.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const enc = new TextEncoder();

async function hmacSha256(keyBytes: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes instanceof Uint8Array ? keyBytes : new Uint8Array(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, enc.encode(message));
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyInitData(initData: string, botToken: string): Promise<URLSearchParams | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => [k, v] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = await hmacSha256(enc.encode("WebAppData"), botToken);
  const expected = toHex(await hmacSha256(secretKey, dataCheckString));
  if (expected !== hash) return null;

  // Optional auth_date freshness check (24h)
  const authDate = Number(params.get("auth_date") ?? "0");
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

  return params;
}

async function derivePassword(botToken: string, tgId: number): Promise<string> {
  const sig = await hmacSha256(enc.encode(botToken), `tg:${tgId}`);
  return toHex(sig);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN not configured");

    const { initData } = await req.json();
    if (!initData || typeof initData !== "string") {
      return new Response(JSON.stringify({ error: "missing initData" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const params = await verifyInitData(initData, botToken);
    if (!params) {
      return new Response(JSON.stringify({ error: "invalid initData" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userJson = params.get("user");
    if (!userJson) {
      return new Response(JSON.stringify({ error: "no user" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const tgUser = JSON.parse(userJson) as {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      photo_url?: string;
      language_code?: string;
    };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const email = `tg_${tgUser.id}@cryptotime.local`;
    const password = await derivePassword(botToken, tgUser.id);

    // Ensure auth user exists.
    const { data: existing, error: lookupErr } = await supabase.auth.admin.listUsers({
      page: 1, perPage: 1,
    });
    if (lookupErr) console.warn("[tg-auth] listUsers error", lookupErr.message);

    // Try create; if already exists, ignore.
    let authUserId: string | null = null;
    const created = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: tgUser.first_name ?? tgUser.username ?? `tg${tgUser.id}`,
        avatar_url: tgUser.photo_url ?? null,
        telegram_id: tgUser.id,
        telegram_username: tgUser.username ?? null,
        provider: "telegram",
      },
    });

    if (created.error) {
      // Likely "User already registered" — look it up by email.
      // Iterate (small) — Supabase doesn't expose getUserByEmail directly via admin.
      let found: { id: string } | null = null;
      let page = 1;
      while (!found && page < 20) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (error) break;
        found = data.users.find((u) => u.email === email) as { id: string } | undefined ?? null;
        if (data.users.length < 200) break;
        page++;
      }
      authUserId = found?.id ?? null;
    } else {
      authUserId = created.data.user?.id ?? null;
    }

    if (!authUserId) throw new Error("failed to ensure auth user");
    void existing; // keep tsc happy

    // Upsert tg_users row.
    await supabase.from("tg_users").upsert({
      telegram_id: tgUser.id,
      username: tgUser.username ?? null,
      first_name: tgUser.first_name ?? null,
      last_name: tgUser.last_name ?? null,
      photo_url: tgUser.photo_url ?? null,
      lang: tgUser.language_code ?? "uk",
      auth_user_id: authUserId,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "telegram_id" });

    // Ensure profile exists (handle_new_user trigger covers brand-new users; fallback for older).
    await supabase.from("profiles").upsert({
      id: authUserId,
      display_name: tgUser.first_name ?? tgUser.username ?? `tg${tgUser.id}`,
      avatar_url: tgUser.photo_url ?? null,
    }, { onConflict: "id", ignoreDuplicates: true });

    // Sign in via password against the Auth REST endpoint to get a real session.
    const tokenResp = await fetch(
      `${Deno.env.get("SUPABASE_URL")!}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "",
        },
        body: JSON.stringify({ email, password }),
      },
    );
    if (!tokenResp.ok) {
      const txt = await tokenResp.text();
      throw new Error(`token exchange failed: ${tokenResp.status} ${txt}`);
    }
    const tokens = await tokenResp.json();

    return new Response(JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user: {
        telegram_id: tgUser.id,
        first_name: tgUser.first_name,
        username: tgUser.username,
        photo_url: tgUser.photo_url,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[tg-auth]", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

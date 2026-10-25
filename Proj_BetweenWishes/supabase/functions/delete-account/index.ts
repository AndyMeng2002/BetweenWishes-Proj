/**
 * Between Wishes — account deletion Supabase Edge Function.
 * Deploy as a protected function with JWT verification ENABLED.
 *
 * Hosted Supabase injects SUPABASE_URL, SUPABASE_PUBLISHABLE_KEYS
 * and SUPABASE_SECRET_KEYS automatically. Legacy keys are supported
 * temporarily for older Supabase projects.
 * Secret keys must NEVER be sent to a browser or a Git repository.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return reply(401, { error: "Missing authorization" });

  let payload: { confirm?: string };
  try { payload = await req.json(); }
  catch { return reply(400, { error: "Invalid JSON" }); }
  if (payload.confirm !== "DELETE_MY_ACCOUNT")
    return reply(400, { error: "Missing confirmation" });

  const url = Deno.env.get("SUPABASE_URL");
  // New (2026) Supabase key names; fall back to legacy keys if needed.
  const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const clientKey: string | undefined =
    publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY") ?? undefined;
  const adminKey: string | undefined =
    secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? undefined;
  if (!url || !clientKey || !adminKey)
    return reply(500, { error: "Function server credentials not configured" });

  const visitor = createClient(url, clientKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  // Never trust a userId supplied in the request body.
  const { data: { user }, error: whoError } = await visitor.auth.getUser(token);
  if (whoError || !user) return reply(401, { error: "Invalid session" });

  const admin = createClient(url, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Remove the user's private files BEFORE auth.users delete (FK cascade).
    // Supabase Storage objects are not automatically removed by deleting
    // application tables or the auth user.
    const paths: string[] = [];
    async function walk(prefix: string): Promise<void> {
      const size = 100;
      for (let offset = 0; ; offset += size) {
        const { data, error } = await admin.storage.from("wish-images").list(prefix, {
          limit: size, offset, sortBy: { column: "name", order: "asc" },
        });
        if (error) throw error;
        for (const entry of data ?? []) {
          const path = `${prefix}/${entry.name}`;
          if (!entry.id) await walk(path);
          else paths.push(path);
        }
        if (!data || data.length < size) break;
      }
    }
    await walk(user.id);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await admin.storage.from("wish-images").remove(paths.slice(i, i + 100));
      if (error) throw error;
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
    return reply(200, { ok: true });
  } catch (e) {
    // Do not leak secrets or internal stack traces to the browser.
    console.error("account deletion failed", e);
    return reply(500, { error: "删除失败，请联系管理员处理" });
  }
});

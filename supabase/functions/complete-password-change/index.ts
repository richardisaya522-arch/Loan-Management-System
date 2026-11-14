import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://richardisaya522-arch.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwerty123", "qwertyuiop", "admin123", "admin1234", "11111111", "00000000",
  "iloveyou", "welcome1", "abc12345", "letmein1", "changeme", "tanzania"
]);

function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin : "https://richardisaya522-arch.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" }
  });
}

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);

  const len = Number(req.headers.get("content-length") || 0);
  if (len > 1024) return json(req, { error: "Ombi ni kubwa mno." }, 413);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(req, { error: "Haujatambuliwa." }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) {
    return json(req, { error: "Huduma haipatikani." }, 500);
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false }
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json(req, { error: "Haujatambuliwa." }, 401);

  let body: { password?: unknown };
  try { body = await req.json(); } catch { body = {}; }
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8 || password.length > 128) {
    return json(req, { error: "Password iwe herufi 8 hadi 128." }, 400);
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return json(req, { error: "Password hii ni rahisi kubashiri. Tumia password nyingine." }, 400);
  }
  if (/^\d+$/.test(password) || /^[A-Za-z]+$/.test(password)) {
    return json(req, { error: "Changanya herufi pamoja na nambari au alama." }, 400);
  }

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: profile, error: profErr } = await admin
    .from("profiles").select("username, must_change_password, temp_password_hash")
    .eq("id", user.id).maybeSingle();
  if (profErr) {
    console.error("profErr", profErr.message);
    return json(req, { error: "Imeshindikana. Jaribu tena." }, 500);
  }
  if (!profile || !profile.must_change_password) {
    return json(req, { error: "Hakuna ombi la kubadilisha password." }, 400);
  }
  if (profile.username &&
      password.toLowerCase() === String(profile.username).toLowerCase()) {
    return json(req, { error: "Password isiwe sawa na namba yako." }, 400);
  }
  if (profile.temp_password_hash &&
      (await sha256Hex(password)) === profile.temp_password_hash) {
    return json(req, { error: "Password mpya isiwe sawa na password ya muda." }, 400);
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password });
  if (updErr) {
    console.error("updErr", updErr.message);
    return json(req, { error: "Imeshindikana kubadilisha password. Jaribu tena." }, 400);
  }

  const { error: clearErr } = await admin.from("profiles").update({
    must_change_password: false,
    temp_password_hash: null
  }).eq("id", user.id);
  if (clearErr) {
    console.error("clearErr", clearErr.message);
    return json(req, { error: "Password imebadilishwa lakini ombi la kubadilisha limefeli. Jaribu tena." }, 500);
  }

  await admin.from("audit").insert({
    actor: String(profile.username || user.email || "user").slice(0, 80),
    action: "user.password_changed",
    target: `user#${user.id}`,
    details: "forced change"
  });

  return json(req, { ok: true });
});

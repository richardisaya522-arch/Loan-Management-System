import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://richardisaya522-arch.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
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

function normPhone(raw: string) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("255")) d = "0" + d.slice(3);
  return d;
}

Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);

  const len = Number(req.headers.get("content-length") || 0);
  if (len > 4096) return json(req, { error: "Ombi ni kubwa mno." }, 413);

  let body: { identifier?: unknown; password?: unknown };
  try { body = await req.json(); } catch { body = {}; }

  const identifier = String(body.identifier || "").trim();
  const password = String(body.password || "");
  if (!identifier || !password) {
    return json(req, { error: "Weka barua pepe/simu na password." }, 400);
  }
  if (identifier.length > 200 || password.length > 200) {
    return json(req, { error: "Taarifa si sahihi." }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) {
    return json(req, { error: "Huduma haipatikani." }, 500);
  }

  let email = identifier.includes("@") ? identifier.toLowerCase() : "";

  if (!email) {
    const phone = normPhone(identifier);
    if (!/^0[67]\d{8}$/.test(phone)) {
      return json(req, { error: "Namba ya simu si sahihi." }, 400);
    }
    const alt = "255" + phone.slice(1);
    const admin = createClient(url, service, { auth: { persistSession: false } });

    const { data: customer } = await admin
      .from("customers").select("user_id")
      .or(`phone.eq.${phone},phone.eq.${alt}`)
      .limit(1).maybeSingle();

    let userId = customer?.user_id as string | undefined;
    if (!userId) {
      const { data: prof } = await admin
        .from("profiles").select("id").eq("username", phone).limit(1).maybeSingle();
      userId = prof?.id as string | undefined;
    }

    if (userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data?.user?.email) {
        return json(req, { error: "Akaunti haipatikani." }, 404);
      }
      email = data.user.email;
    } else {
      email = `${phone}@zaburiya23.local`;
    }
  }

  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return json(req, { error: "Taarifa za kuingia si sahihi." }, 401);
  }

  return json(req, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    email: data.user?.email || email
  });
});

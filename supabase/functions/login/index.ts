import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" }
  });
}

function normPhone(raw: string) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("255")) d = "0" + d.slice(3);
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let body: { identifier?: unknown; password?: unknown };
  try { body = await req.json(); } catch { body = {}; }

  const identifier = String(body.identifier || "").trim();
  const password = String(body.password || "");
  if (!identifier || !password) {
    return json({ error: "Weka barua pepe/simu na password." }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) {
    return json({ error: "Function haijasanidiwa vizuri." }, 500);
  }

  let email = identifier.includes("@") ? identifier.toLowerCase() : "";

  if (!email) {
    const phone = normPhone(identifier);
    if (!/^0[67]\d{8}$/.test(phone)) {
      return json({ error: "Namba ya simu si sahihi." }, 400);
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
        return json({ error: "Akaunti haipatikani." }, 404);
      }
      email = data.user.email;
    } else {
      email = `${phone}@zaburiya23.local`;
    }
  }

  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return json({ error: "Taarifa za kuingia si sahihi." }, 401);
  }

  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    email: data.user?.email || email
  });
});

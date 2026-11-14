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

function tempPassword() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const chars = Array.from(bytes).map((b) => letters[b % letters.length]).join("");
  const digits = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => String(b % 10)).join("");
  return `Zaburi#${chars}${digits}`;
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

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: profile, error: profErr } = await admin
    .from("profiles").select("role, username").eq("id", user.id).maybeSingle();
  if (profErr) {
    console.error("profErr", profErr.message);
    return json(req, { error: "Imeshindikana. Jaribu tena." }, 500);
  }
  if (!profile || profile.role !== "admin") {
    return json(req, { error: "Ruhusa imekataliwa." }, 403);
  }

  let body: { customer_id?: unknown };
  try { body = await req.json(); } catch { body = {}; }
  const customerId = Number(body.customer_id);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return json(req, { error: "Mteja si sahihi." }, 400);
  }

  const { data: customer, error: custErr } = await admin
    .from("customers").select("id, user_id, name, phone")
    .eq("id", customerId).maybeSingle();
  if (custErr) {
    console.error("custErr", custErr.message);
    return json(req, { error: "Imeshindikana. Jaribu tena." }, 500);
  }
  if (!customer) return json(req, { error: "Mteja hapatikani." }, 404);
  if (!customer.user_id) {
    return json(req, { error: "Mteja hana akaunti ya kuingia." }, 400);
  }

  const password = tempPassword();
  const { error: updErr } = await admin.auth.admin.updateUserById(customer.user_id, { password });
  if (updErr) {
    console.error("updErr", updErr.message);
    return json(req, { error: "Imeshindikana kubadilisha password. Jaribu tena." }, 400);
  }

  await admin.from("audit").insert({
    actor: String(profile.username || user.email || "admin").slice(0, 80),
    action: "customer.password_reset",
    target: `customer#${customer.id}`,
    details: String(customer.name || "").slice(0, 300)
  });

  return json(req, {
    ok: true,
    password,
    name: customer.name || "",
    phone: customer.phone || ""
  });
});

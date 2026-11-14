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

function tempPassword() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const chars = Array.from(bytes).map((b) => letters[b % letters.length]).join("");
  const digits = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => String(b % 10)).join("");
  return `Zaburi#${chars}${digits}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Haujatambuliwa." }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) {
    return json({ error: "Function haijasanidiwa vizuri." }, 500);
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false }
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: "Haujatambuliwa." }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: profile, error: profErr } = await admin
    .from("profiles").select("role, username").eq("id", user.id).maybeSingle();
  if (profErr) return json({ error: profErr.message }, 500);
  if (!profile || profile.role !== "admin") {
    return json({ error: "Ruhusa imekataliwa." }, 403);
  }

  let body: { customer_id?: unknown };
  try { body = await req.json(); } catch { body = {}; }
  const customerId = Number(body.customer_id);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return json({ error: "Mteja si sahihi." }, 400);
  }

  const { data: customer, error: custErr } = await admin
    .from("customers").select("id, user_id, name, phone")
    .eq("id", customerId).maybeSingle();
  if (custErr) return json({ error: custErr.message }, 500);
  if (!customer) return json({ error: "Mteja hapatikani." }, 404);
  if (!customer.user_id) {
    return json({ error: "Mteja hana akaunti ya kuingia." }, 400);
  }

  const password = tempPassword();
  const { error: updErr } = await admin.auth.admin.updateUserById(customer.user_id, { password });
  if (updErr) return json({ error: updErr.message }, 400);

  await admin.from("audit").insert({
    actor: String(profile.username || user.email || "admin").slice(0, 80),
    action: "customer.password_reset",
    target: `customer#${customer.id}`,
    details: String(customer.name || "").slice(0, 300)
  });

  return json({
    ok: true,
    password,
    name: customer.name || "",
    phone: customer.phone || ""
  });
});

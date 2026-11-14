import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://richardisaya522-arch.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);

const DEFAULT_APP_URL = "https://richardisaya522-arch.github.io/Loan-Management-System/";

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

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

function esc(s: unknown) {
  return String(s == null ? "" : s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}

function emailHtml(name: string, email: string, password: string, appUrl: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222">
  <h2 style="color:#0d6efd;margin:0 0 12px">ZABURI YA 23 MICROFINANCE</h2>
  <p>Ndugu ${esc(name || "mteja")},</p>
  <p>Password yako ya muda ni:</p>
  <p style="font-size:20px;font-weight:bold;letter-spacing:1px;background:#f1f3f5;padding:12px;
    border-radius:6px;text-align:center">${esc(password)}</p>
  <p>Ingia <a href="${esc(appUrl)}">${esc(appUrl)}</a> kwa barua pepe
    <b>${esc(email)}</b> na password hii. Utaombwa kuweka password mpya mara moja.</p>
  <p style="color:#666;font-size:13px">Usiseme password hii na mtu yeyote. Kama hukuomba
    mabadiliko, wasiliana na ofisi.</p>
</div>`;
}

async function sendEmail(name: string, email: string, password: string, appUrl: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    return { sent: false, message: "Email haijasanidiwa. Copy password hii na mpe mteja." };
  }
  if (!email) {
    return { sent: false, message: "Mteja hana barua pepe. Copy password hii na mpe mteja." };
  }
  const from = Deno.env.get("EMAIL_FROM") || "ZABURI YA 23 <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Password ya muda - ZABURI YA 23 MICROFINANCE",
        html: emailHtml(name, email, password, appUrl)
      })
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("email_failed", res.status, text.slice(0, 300));
      return { sent: false, message: "Imeshindikana kutuma email. Copy password hii na mpe mteja." };
    }
    return { sent: true, message: `Email imetumwa kwa ${email}.` };
  } catch (e) {
    console.error("email_error", String(e).slice(0, 200));
    return { sent: false, message: "Imeshindikana kutuma email. Copy password hii na mpe mteja." };
  }
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
    .from("customers").select("id, user_id, name, phone, email")
    .eq("id", customerId).maybeSingle();
  if (custErr) {
    console.error("custErr", custErr.message);
    return json(req, { error: "Imeshindikana. Jaribu tena." }, 500);
  }
  if (!customer) return json(req, { error: "Mteja hapatikani." }, 404);
  if (!customer.user_id) {
    return json(req, { error: "Mteja hana akaunti ya kuingia." }, 400);
  }

  let toEmail = String(customer.email || "").trim().toLowerCase();
  if (!toEmail) {
    const { data: authUser } = await admin.auth.admin.getUserById(customer.user_id);
    toEmail = String(authUser && authUser.user ? authUser.user.email : "").trim().toLowerCase();
  }

  const password = tempPassword();
  const { error: updErr } = await admin.auth.admin.updateUserById(customer.user_id, { password });
  if (updErr) {
    console.error("updErr", updErr.message);
    return json(req, { error: "Imeshindikana kubadilisha password. Jaribu tena." }, 400);
  }

  const { error: flagErr } = await admin.from("profiles").update({
    must_change_password: true,
    temp_password_hash: await sha256Hex(password)
  }).eq("id", customer.user_id);
  if (flagErr) {
    console.error("flagErr", flagErr.message);
  }

  const appUrl = (Deno.env.get("APP_URL") || DEFAULT_APP_URL).trim();
  const mail = flagErr
    ? { sent: false, message: "Password imebadilishwa lakini ombi la kubadilisha limefeli. Mpe mteja password hii na umwambie abadilishe." }
    : await sendEmail(customer.name || "", toEmail, password, appUrl);

  await admin.from("audit").insert({
    actor: String(profile.username || user.email || "admin").slice(0, 80),
    action: "customer.password_reset",
    target: `customer#${customer.id}`,
    details: String(`${customer.name || ""} | ${toEmail || "no-email"} | sent:${mail.sent} | forced:${!flagErr}`).slice(0, 300)
  });

  return json(req, {
    ok: true,
    password,
    name: customer.name || "",
    phone: customer.phone || "",
    email: toEmail,
    email_sent: mail.sent,
    email_message: mail.message
  });
});

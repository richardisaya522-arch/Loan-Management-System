/* ZABURI YA 23 MICROFINANCE - Supabase static app (GitHub Pages) */
(function () {
  "use strict";

  // Kinga ya clickjacking (GitHub Pages haiwezi kuweka header ya X-Frame-Options).
  if (window.top !== window.self) {
    try { window.top.location = window.self.location.href; }
    catch (e) { document.documentElement.innerHTML = ""; }
  }

  const CFG = window.APP_CONFIG || {};
  const $app = document.getElementById("app");

  // ---------- Config check ----------
  if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes("WEWA_") ||
      !window.supabase || !window.supabase.createClient) {
    if (window.console) console.error("Config haijakamilika.");
    $app.innerHTML = `<div class="container py-5"><div class="alert alert-danger">
      <h5>Mfumo haujasanidiwa</h5>
      Wasiliana na ofisi kwa msaada.</div></div>`;
    return;
  }

  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  const METHODS = CFG.METHODS || ["Cash"];
  const RESET_REDIRECT = location.origin + location.pathname.replace(/index\.html?$/i, "");
  // Supabase huweka type=recovery kwenye URL baada ya kubonyeza kiungo cha barua pepe.
  const RECOVERY_LINK = /(?:^|[#&?])type=recovery(?:&|$)/.test(location.href);

  // ---------- Helpers ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tzs = (v) => "TZS " + Number(v || 0).toLocaleString("en-US");
  const digits = (p) => String(p || "").replace(/\D/g, "");
  const validPhone = (p) => /^(0[67]\d{8}|255[67]\d{8})$/.test(digits(p));
  const normPhone = (p) => { let d = digits(p); if (d.startsWith("255")) d = "0" + d.slice(3); return d; };
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || "").trim());

  // Majina yote yaliyojazwa kwenye fomu yanaanza kwa herufi kubwa.
  const capText = (s, max) => String(s == null ? "" : s).trim().replace(/\s+/g, " ")
    .replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (m, p1, p2) => p1 + p2.toUpperCase())
    .slice(0, max || 999);
  // Saini zote ziko kwa mtindo wa mfano: A.C. mwanjoka.
  const signStyle = (s) => {
    const t = capText(s).match(/[A-Za-z]\.|[^\s]+/g) || [];
    const isInitial = (x) => /^[A-Za-z]\.$/.test(x);
    const initials = t.filter(isInitial).map((x) => x[0].toUpperCase());
    const words = t.filter((x) => !isInitial(x));
    if (!initials.length && words.length > 1)
      words.slice(0, -1).forEach((w) => initials.push(w[0]));
    const last = words.length ? words[words.length - 1].toLowerCase() : "";
    return (initials.map((x) => x + ".").join("") + " " + last).trim();
  };
  const signatureMatches = (sign, name) => {
    const norm = (x) => String(x || "").trim().replace(/\s+/g, " ").toLowerCase();
    return !!name && [norm(name), norm(signStyle(name))].includes(norm(sign));
  };
  const displaySign = (sign, name) => sign || signStyle(name);
  let _settingsReady = null;
  async function settingsReady() {
    if (_settingsReady === null) {
      const { error } = await sb.rpc("get_app_settings");
      _settingsReady = !error;
    }
    return _settingsReady;
  }
  async function fetchAppSettings() {
    try {
      const { data, error } = await sb.rpc("get_app_settings");
      return !error && data && data[0] ? data[0] : null;
    } catch (_) { return null; }
  }

  // Sera ya password (ulingane na app ya Flask). Uthibitisho halisi uko Supabase Auth.
  const COMMON_PASSWORDS = new Set([
    "password", "password1", "password123", "12345678", "123456789", "1234567890",
    "qwerty123", "qwertyuiop", "admin123", "admin1234", "11111111", "00000000",
    "iloveyou", "welcome1", "abc12345", "letmein1", "changeme", "tanzania"
  ]);
  function passwordProblem(pw, phone) {
    if (!pw || pw.length < 8) return "Password iwe angalau herufi 8.";
    if (pw.length > 128) return "Password isizidi herufi 128.";
    if (COMMON_PASSWORDS.has(pw.toLowerCase()))
      return "Password hii ni rahisi kubashiri. Tumia password nyingine.";
    if (phone && pw.toLowerCase() === String(phone).toLowerCase())
      return "Password isiwe sawa na namba yako.";
    if (/^\d+$/.test(pw) || /^[A-Za-z]+$/.test(pw))
      return "Changanya herufi pamoja na nambari au alama.";
    return null;
  }
  const TZ = "Africa/Nairobi"; // Saa za Tanzania (EAT, UTC+3)
  const fmtDate = (d) => {
    if (!d) return "-";
    const dateOnly = typeof d === "string" && d.length <= 10;
    const dt = (typeof d === "string") ? new Date(dateOnly ? d + "T00:00:00" : d) : d;
    if (isNaN(dt)) return "-";
    const opts = { day: "2-digit", month: "short", year: "numeric" };
    if (!dateOnly) opts.timeZone = TZ;
    return dt.toLocaleDateString("en-GB", opts);
  };
  const fmtDateTime = (d) => {
    if (!d) return "-";
    const dt = new Date(d);
    if (isNaN(dt)) return "-";
    return dt.toLocaleString("en-GB", {
      timeZone: TZ, day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false
    });
  };
  function tzDateKey(d) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(d || new Date());
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  function addMonths(dateStr, n) {
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDate(), y = d.getFullYear(), m = d.getMonth() + n;
    const ny = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
    const last = new Date(ny, mm + 1, 0).getDate();
    return new Date(ny, mm, Math.min(day, last));
  }
  function calc(principal, rate, months) {
    const interest = Math.round(principal * rate / 100 * months);
    const total = principal + interest;
    return { interest, total, installment: Math.round(total / months) };
  }
  function buildLoan(loan, payments, today) {
    const p = Number(loan.principal), r = Number(loan.rate || 0);
    const { interest, total, installment } = calc(p, r, loan.months);
    const paid = (payments || []).reduce((s, x) => s + Number(x.amount), 0);
    let left = paid; const rows = [];
    for (let n = 1; n <= loan.months; n++) {
      const amt = n < loan.months ? installment : total - installment * (loan.months - 1);
      const due = addMonths(loan.start_date, n);
      const got = Math.min(left, amt); left -= got;
      const status = got >= amt ? "paid" : (due < today ? "overdue" : got > 0 ? "partial" : "pending");
      rows.push({ no: n, due, amount: amt, paid: got, status });
    }
    const balance = total - paid;
    const overdue = rows.filter((x) => x.status === "overdue");
    const status = balance <= 0 ? "completed" : (overdue.length ? "overdue" : "active");
    return { ...loan, interest, total, installment, balance, status, rows, paid,
             nextDue: rows.find((x) => x.status !== "paid") || null,
             overdueAmount: overdue.reduce((s, x) => s + (x.amount - x.paid), 0) };
  }
  const badge = (s) => ({
    pending: "text-bg-secondary", active: "text-bg-primary", paid: "text-bg-success",
    partial: "text-bg-warning", overdue: "text-bg-danger", completed: "text-bg-success",
    approved: "text-bg-primary", rejected: "text-bg-danger"
  }[s] || "text-bg-secondary");

  let state = { user: null, profile: null, customer: null, recovery: RECOVERY_LINK };
  let pendingLoginIdentifier = "";
  const IDLE_LIMIT_MS = 10 * 60 * 1000;
  let idleTimer = null;
  let idleBound = false;
  let idleLocking = false;
  let lastActivityAt = 0;
  const today = () => new Date(tzDateKey() + "T00:00:00");
  const localDate = () => tzDateKey();

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = null;
    if (!state.user) return;
    idleTimer = setTimeout(lockForInactivity, IDLE_LIMIT_MS);
  }

  function noteActivity() {
    const now = Date.now();
    if (now - lastActivityAt < 1000) return;
    lastActivityAt = now;
    resetIdleTimer();
  }

  function bindIdleWatch() {
    if (idleBound) return;
    idleBound = true;
    ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"].forEach((ev) =>
      window.addEventListener(ev, noteActivity, { passive: true }));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (state.user && lastActivityAt && Date.now() - lastActivityAt >= IDLE_LIMIT_MS) {
        lockForInactivity();
      } else {
        noteActivity();
      }
    });
  }

  async function lockForInactivity() {
    if (idleLocking) return;
    idleLocking = true;
    try { await sb.auth.signOut({ scope: "local" }); } catch (_) {}
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith("sb-") && (k.includes("auth-token") || k.includes("code-verifier")))
          localStorage.removeItem(k);
      });
      sessionStorage.setItem("idleReload", "1");
    } catch (_) {}
    state = { user: null, profile: null, customer: null, recovery: false };
    location.hash = "#/";
    location.reload();
  }

  // ---------- Toast/alert ----------
  function toast(msg, kind) {
    const el = document.createElement("div");
    el.className = `alert alert-${kind || "info"} alert-dismissible fade show position-fixed`;
    el.style.cssText = "top:1rem;right:1rem;z-index:2000;max-width:360px";
    el.innerHTML = esc(msg) + '<button class="btn-close" data-bs-dismiss="alert"></button>';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  }

  function errorView(v, error) {
    if (error && window.console) console.error(error);
    v.innerHTML = `<div class="alert alert-danger"><i class="bi bi-exclamation-triangle"></i>
      <b>Hitilafu:</b> Imeshindikana kupata taarifa. Jaribu tena au wasiliana na ofisi.</div>`;
  }

  async function fnError(error, fallback) {
    try {
      const ctx = error && error.context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        if (body && body.error) return body.error;
      }
      if (ctx && typeof ctx.text === "function") {
        const text = await ctx.text();
        if (text) return text.slice(0, 300);
      }
    } catch (_) { /* ignore */ }
    return (error && error.message) || fallback;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try {
        const ok = document.execCommand("copy");
        ta.remove();
        ok ? resolve() : reject(new Error("copy failed"));
      } catch (e) {
        ta.remove();
        reject(e);
      }
    });
  }

  function showTempPasswordModal(info) {
    if (!window.bootstrap || !window.bootstrap.Modal) {
      window.prompt("Password ya muda (copy kisha bonyeza OK):", info.password);
      return;
    }
    const el = document.createElement("div");
    el.className = "modal fade";
    el.tabIndex = -1;
    el.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-key"></i> Password ya muda</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Funga"></button>
          </div>
          <div class="modal-body">
            <p class="mb-2">Password ya muda kwa <b>${esc(info.name || info.phone || "mteja")}</b>:</p>
            ${info.emailSent
              ? `<div class="alert alert-success small py-2"><i class="bi bi-envelope-check"></i>
                Email imetumwa kwa <b>${esc(info.email || "")}</b>.</div>`
              : `<div class="alert alert-secondary small py-2"><i class="bi bi-envelope-x"></i>
                ${esc(info.emailMessage || "Email haijatumwa. Copy password hii na mpe mteja.")}</div>`}
            <div class="input-group mb-3">
              <input class="form-control font-monospace" id="tempPasswordValue" readonly
                value="${esc(info.password)}">
              <button class="btn btn-primary" id="copyTempPassword" type="button">
                <i class="bi bi-clipboard"></i> Copy</button>
            </div>
            <div class="alert alert-warning small mb-0">
              <i class="bi bi-exclamation-triangle"></i> Bonyeza <b>Copy</b> au chagua password
              kisha ubonyeze <b>Ctrl+C</b>. Mpe mteja password hii sasa; ni ya muda na
              atalazimika kuibadilisha mara ya kwanza.
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Funga</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    const modal = new bootstrap.Modal(el, { backdrop: "static", keyboard: true });
    const input = el.querySelector("#tempPasswordValue");
    const btn = el.querySelector("#copyTempPassword");
    el.addEventListener("shown.bs.modal", () => { input.focus(); input.select(); });
    btn.addEventListener("click", async () => {
      try {
        await copyText(info.password);
        btn.innerHTML = '<i class="bi bi-check-lg"></i> Imenakiliwa';
        btn.classList.remove("btn-primary");
        btn.classList.add("btn-success");
        toast("Password ya muda imenakiliwa.", "success");
      } catch (_) {
        input.focus();
        input.select();
        toast("Chagua password kisha bonyeza Ctrl+C kunakili.", "warning");
      }
    });
    el.addEventListener("hidden.bs.modal", () => { modal.dispose(); el.remove(); });
    modal.show();
  }

  // Ongeza kitufe cha kuonyesha/kuficha kwenye kila password input.
  function enhancePasswordInputs(root) {
    if (!root) return;
    root.querySelectorAll('input[type="password"]').forEach((input) => {
      if (input.dataset.pwEnhanced === "1") return;
      if (input.parentElement && input.parentElement.classList.contains("input-group")) return;
      input.dataset.pwEnhanced = "1";
      const wrap = document.createElement("div");
      wrap.className = "input-group";
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-outline-secondary";
      btn.innerHTML = '<i class="bi bi-eye"></i>';
      btn.setAttribute("aria-label", "Onyesha password");
      btn.setAttribute("title", "Onyesha password");
      btn.addEventListener("click", () => {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.innerHTML = show ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-eye"></i>';
        btn.setAttribute("aria-label", show ? "Ficha password" : "Onyesha password");
        btn.setAttribute("title", show ? "Ficha password" : "Onyesha password");
        input.focus();
      });
      wrap.appendChild(btn);
    });
  }

  const pwObserver = new MutationObserver(() => enhancePasswordInputs($app));
  pwObserver.observe($app, { childList: true, subtree: true });

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type: type + ";charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function downloadCSV(name, rows) {
    const data = rows && rows.length ? rows : [{}];
    const cols = Array.from(new Set(data.flatMap((r) => Object.keys(r))));
    const cell = (v) => {
      let s = v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v));
      if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const lines = [cols.join(",")].concat(data.map((r) => cols.map((c) => cell(r[c])).join(",")));
    downloadFile(name, "\ufeff" + lines.join("\r\n"), "text/csv");
  }

  // ---------- Boot ----------
  async function boot() {
    bindIdleWatch();
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      state.user = session.user;
      await loadProfile();
    }
    sb.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") {
        state.recovery = true;
        if (s) {
          state.user = s.user;
          resetIdleTimer();
          loadProfile().then(() => {
            if (location.hash !== "#/reset-password") location.hash = "#/reset-password";
            render();
          });
        }
        return;
      }
      if (!s && !state.recovery) {
        clearTimeout(idleTimer);
        idleTimer = null;
        state = { user: null, profile: null, customer: null, recovery: false };
        render();
      }
    });
    window.addEventListener("hashchange", route);
    if (state.recovery && state.user) location.hash = "#/reset-password";
    render();
    route();
  }

  async function loadProfile() {
    let { data: prof, error } = await sb.from("profiles").select("*").eq("id", state.user.id).maybeSingle();
    if (error) {
      await new Promise((r) => setTimeout(r, 600));
      ({ data: prof, error } = await sb.from("profiles").select("*").eq("id", state.user.id).maybeSingle());
    }
    state.profile = prof || null;
    state.profileError = error || null;
    if (prof && prof.role === "customer") {
      const { data: cust } = await sb.from("customers").select("*").eq("user_id", state.user.id).maybeSingle();
      state.customer = cust;
    }
    resetIdleTimer();
  }

  // ---------- Router ----------
  function route() { render(); }

  function render() {
    if (!state.user) return renderAuth();
    renderShell();
  }

  // ================= AUTH =================
  function renderAuth() {
    $app.innerHTML = `
    <div class="container py-4 py-lg-5">
      <div class="auth-card row g-0">
        <div class="col-lg-5 auth-side d-flex flex-column justify-content-between">
          <div>
            <div class="d-flex align-items-center gap-2 mb-4">
              <span class="auth-logo"><i class="bi bi-cash-coin"></i></span>
              <div>
                <div class="fst-italic small">${esc(CFG.BRAND)}</div>
                <div class="fw-bold">LOAN MANAGEMENT</div>
              </div>
            </div>
            <h3 class="fw-bold mb-2">Karibu</h3>
            <p class="auth-sub mb-0">Omba mkopo kwa urahisi, fuatilia malipo, na pata risiti zako.</p>
          </div>
          <p class="auth-sub small mb-0">&copy; ${new Date().getFullYear()} ${esc(CFG.BRAND)}</p>
        </div>
        <div class="col-lg-7 auth-form">
          <ul class="nav nav-pills mb-4" id="authTabs">
            <li class="nav-item"><button class="nav-link active" data-tab="login">Ingia</button></li>
            <li class="nav-item"><button class="nav-link" data-tab="register">Jisajili</button></li>
          </ul>
          <div id="authPane"></div>
          <p class="text-muted small mb-0 mt-4 pt-3 border-top">
            Kwa msaada, wasiliana na ofisi ya ${esc(CFG.BRAND)}.
          </p>
        </div>
      </div>
    </div>`;
    $app.querySelectorAll("#authTabs .nav-link").forEach((b) =>
      b.addEventListener("click", () => {
        $app.querySelectorAll("#authTabs .nav-link").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        b.dataset.tab === "login" ? authLoginForm() : authRegisterForm();
      }));
    if (state.recovery) {
      state.recovery = false;
      setTimeout(() => toast("Kiungo cha kubadilisha password hakifai au kimeisha muda. Omba kiungo kipya.", "warning"), 100);
      authForgotForm();
    } else {
      authLoginForm();
    }
  }

  function authLoginForm() {
    let idle = "";
    try {
      idle = sessionStorage.getItem("idleReload") || "";
      if (idle) sessionStorage.removeItem("idleReload");
    } catch (_) {}
    $app.querySelector("#authPane").innerHTML = `
      ${idle ? `<div class="alert alert-warning py-2 small"><i class="bi bi-clock-history"></i>
        Umekaa dakika 10 bila shughuli. Tafadhali ingia tena na password yako.</div>` : ""}
      <form id="loginForm">
        <div class="mb-3"><label class="form-label">Barua pepe au namba ya simu</label>
          <input class="form-control form-control-lg" name="identifier" autocomplete="username"
            placeholder="jina@barua.com au 0712345678" required></div>
        <div class="mb-2"><label class="form-label">Password</label>
          <input class="form-control form-control-lg" type="password" name="password"
            autocomplete="current-password" required></div>
        <div class="text-end mb-3">
          <a href="#" class="small fw-semibold" id="forgotLink">Umesahau password?</a>
        </div>
        <button class="btn btn-primary btn-lg w-100">Ingia</button>
      </form>`;
    if (pendingLoginIdentifier) {
      const idInput = $app.querySelector('#loginForm input[name="identifier"]');
      if (idInput) idInput.value = pendingLoginIdentifier;
    }
    document.getElementById("forgotLink").addEventListener("click", (ev) => {
      ev.preventDefault();
      authForgotForm();
    });
    $app.querySelector("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const identifier = f.identifier.value.trim();
      if (!identifier) return toast("Weka barua pepe au namba ya simu.", "danger");
      const { data, error } = await sb.functions.invoke("login", {
        body: { identifier, password: f.password.value }
      });
      if (error) return toast(await fnError(error, "Imeshindikana kuingia."), "danger");
      if (!data || data.error) return toast((data && data.error) || "Taarifa si sahihi.", "danger");
      const { error: se } = await sb.auth.setSession({
        access_token: data.access_token, refresh_token: data.refresh_token
      });
      if (se) return toast(se.message, "danger");
      state.user = (await sb.auth.getUser()).data.user;
      pendingLoginIdentifier = "";
      await loadProfile();
      location.hash = "#/";
      render();
    });
  }

  function authForgotForm() {
    $app.querySelector("#authPane").innerHTML = `
      <h4 class="fw-bold mb-2">Umesahau password?</h4>
      <p class="text-muted small">Weka barua pepe uliyotumia kujisajili. Tutakutumia kiungo cha
        kubadilisha password kwenye barua pepe hiyo.</p>
      <form id="forgotForm">
        <div class="mb-3"><label class="form-label">Barua pepe</label>
          <input class="form-control form-control-lg" type="email" name="email"
            autocomplete="email" placeholder="jina@barua.com" required></div>
        <button class="btn btn-primary btn-lg w-100">Tuma kiungo</button>
      </form>
      <p class="text-center mt-3 mb-0"><a href="#" id="backLogin" class="fw-semibold">Rudi kuingia</a></p>`;
    document.getElementById("backLogin").addEventListener("click", (ev) => {
      ev.preventDefault();
      authLoginForm();
    });
    $app.querySelector("#forgotForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const email = f.email.value.trim().toLowerCase();
      if (!validEmail(email)) return toast("Barua pepe si sahihi.", "danger");
      const btn = f.querySelector("button");
      btn.disabled = true;
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: RESET_REDIRECT });
      btn.disabled = false;
      if (error) return toast(error.message, "danger");
      $app.querySelector("#authPane").innerHTML = `
        <div class="alert alert-success mb-3">
          <i class="bi bi-envelope-check"></i> Kama barua pepe hii ipo kwenye mfumo,
          tumetuma kiungo cha kubadilisha password. Angalia inbox/spam kisha fungua kiungo.
        </div>
        <p class="text-center mb-0"><a href="#" id="backLogin2" class="fw-semibold">Rudi kuingia</a></p>`;
      document.getElementById("backLogin2").addEventListener("click", (ev) => {
        ev.preventDefault();
        authLoginForm();
      });
    });
  }

  function authRegisterForm() {
    $app.querySelector("#authPane").innerHTML = `
      <form id="regForm">
        <div class="row g-3">
          <div class="col-md-6"><label class="form-label">Jina kamili</label>
            <input class="form-control" name="name" autocomplete="name" required></div>
          <div class="col-md-6"><label class="form-label">Namba ya simu</label>
            <input class="form-control" name="phone" autocomplete="tel"
              placeholder="0712345678" required></div>
          <div class="col-12"><label class="form-label">Barua pepe</label>
            <input class="form-control" type="email" name="email" autocomplete="email"
              placeholder="jina@barua.com" required></div>
          <div class="col-md-6"><label class="form-label">Password</label>
            <input class="form-control" type="password" name="password"
              autocomplete="new-password" required></div>
          <div class="col-md-6"><label class="form-label">Rudia password</label>
            <input class="form-control" type="password" name="password2"
              autocomplete="new-password" required></div>
        </div>
        <p class="form-text">Angalau herufi 8, changanya herufi na nambari/alama.
          Tutatumia barua pepe hii kwa reset ya password.</p>
        <button class="btn btn-success btn-lg w-100">Jisajili</button>
      </form>`;
    $app.querySelector("#regForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const name = capText(f.name.value, 120);
      const phone = normPhone(f.phone.value);
      const email = f.email.value.trim().toLowerCase();
      if (name.length < 2) return toast("Weka jina kamili.", "danger");
      if (!validPhone(phone)) return toast("Namba si sahihi. Mfano: 0712345678", "danger");
      if (!validEmail(email)) return toast("Barua pepe si sahihi.", "danger");
      const pwErr = passwordProblem(f.password.value, phone);
      if (pwErr) return toast(pwErr, "danger");
      if (f.password.value !== f.password2.value) return toast("Password mbili hazifanani.", "danger");
      const { data: taken } = await sb.rpc("phone_registered", { p_phone: phone });
      if (taken) return toast("Namba hii tayari imesajiliwa. Ingia kwa simu au barua pepe.", "danger");
      const { data, error } = await sb.auth.signUp({
        email, password: f.password.value,
        options: { data: { username: phone, phone, name, email } }
      });
      if (error) return toast(error.message, "danger");
      if (!data.session) {
        $app.querySelector("#authPane").innerHTML = `
          <div class="alert alert-success">Akaunti imeundwa. Angalia barua pepe yako
            kuthibitisha, kisha ingia.</div>
          <p class="text-center mb-0"><a href="#" id="afterRegLogin" class="fw-semibold">Ingia</a></p>`;
        document.getElementById("afterRegLogin").addEventListener("click", (ev) => {
          ev.preventDefault();
          authLoginForm();
        });
        return;
      }
      state.user = data.user;
      await loadProfile();
      location.hash = "#/";
      render();
    });
  }

  // ================= SHELL =================
  function navItems() {
    const isAdmin = state.profile && state.profile.role === "admin";
    if (isAdmin) return [
      ["#/", "Dashboard", "speedometer2"],
      ["#/applications", "Maombi", "inbox"],
      ["#/customers", "Wateja", "people"],
      ["#/loans", "Mikopo", "cash-stack"],
      ["#/payments", "Malipo", "receipt"],
      ["#/backups", "Nakala", "hdd"],
      ["#/audit", "Kumbukumbu", "journal-text"],
      ["#/settings", "Mkopeshaji", "pencil-square"],
      ["#/password", "Badilisha password", "key"]
    ];
    return [
      ["#/", "Akaunti yangu", "house"],
      ["#/apply", "Omba mkopo", "plus-circle"],
      ["#/profile", "Profile", "person-gear"],
      ["#/password", "Badilisha password", "key"]
    ];
  }

  function renderShell() {
    if (state.profile && state.profile.must_change_password) {
      $app.innerHTML = `
      <nav class="navbar navbar-expand-lg navbar-dark mb-4">
        <div class="container">
          <span class="navbar-brand d-flex align-items-center gap-2">
            <i class="bi bi-cash-coin fs-4"></i>
            <span><span class="fst-italic small d-block lh-1">${esc(CFG.BRAND)}</span>
            <span class="brand-name small">LOAN MANAGEMENT</span></span>
          </span>
          <button class="btn btn-outline-light btn-sm" id="logoutBtn">
            <i class="bi bi-box-arrow-right"></i> Toka (${esc(state.profile.username || "")})</button>
        </div>
      </nav>
      <main class="container pb-5" id="view"></main>
      <footer class="container pb-4 pt-2 text-center text-muted small border-top">
        &copy; ${new Date().getFullYear()} ${esc(CFG.BRAND)}
      </footer>`;
      document.getElementById("logoutBtn").addEventListener("click", async () => {
        pendingLoginIdentifier = "";
        await sb.auth.signOut();
      });
      renderView();
      return;
    }
    const items = navItems();
    const cur = location.hash || "#/";
    $app.innerHTML = `
    <nav class="navbar navbar-expand-lg navbar-dark mb-4">
      <div class="container">
        <a class="navbar-brand d-flex align-items-center gap-2" href="#/">
          <i class="bi bi-cash-coin fs-4"></i>
          <span><span class="fst-italic small d-block lh-1">${esc(CFG.BRAND)}</span>
          <span class="brand-name small">LOAN MANAGEMENT</span></span>
        </a>
        <button class="navbar-toggler" data-bs-toggle="collapse" data-bs-target="#nav"><span class="navbar-toggler-icon"></span></button>
        <div class="collapse navbar-collapse" id="nav">
          <ul class="navbar-nav me-auto">
            ${items.map(([h, t, ic]) => `<li class="nav-item"><a class="nav-link ${cur === h ? "active fw-semibold" : ""}" href="${h}"${h === "#/applications" ? ' id="navApplications"' : ""}><i class="bi bi-${ic}"></i> ${t}</a></li>`).join("")}
          </ul>
          <button class="btn btn-outline-light btn-sm" id="logoutBtn">
            <i class="bi bi-box-arrow-right"></i> Toka (${esc(state.profile ? state.profile.username : "")})</button>
        </div>
      </div>
    </nav>
    <main class="container pb-5" id="view"></main>
    <footer class="container pb-4 pt-2 text-center text-muted small border-top">
      &copy; ${new Date().getFullYear()} ${esc(CFG.BRAND)}
    </footer>`;
    document.getElementById("logoutBtn").addEventListener("click", async () => {
      pendingLoginIdentifier = "";
      await sb.auth.signOut();
    });
    renderView();
    refreshPendingBadge();
  }

  async function refreshPendingBadge() {
    if (!state.profile || state.profile.role !== "admin") return;
    const { count, error } = await sb.from("loans")
      .select("id", { count: "exact", head: true }).eq("decision", "pending");
    if (error || !count) return;
    const el = document.getElementById("navApplications");
    if (el && !el.querySelector(".badge")) {
      el.insertAdjacentHTML("beforeend",
        ` <span class="badge text-bg-warning">${count}</span>`);
    }
  }

  function renderView() {
    const v = document.getElementById("view");
    const isAdmin = state.profile && state.profile.role === "admin";
    const h = location.hash || "#/";
    if (state.recovery || h === "#/reset-password") return resetPasswordView(v);
    if (state.profileError) return errorView(v, state.profileError);
    if (!state.profile) {
      v.innerHTML = `<div class="alert alert-warning"><i class="bi bi-person-exclamation"></i>
        Profile yako haijapatikana. Ingia tena au wasiliana na ofisi.</div>`;
      return;
    }
    if (state.profile.must_change_password) return forcePasswordView(v);
    if (h === "#/" || h === "") return isAdmin ? adminDashboard(v) : customerHome(v);
    if (h === "#/apply") return applyView(v);
    if (h === "#/profile") return profileView(v);
    if (h === "#/password") return passwordView(v);
    if (h.startsWith("#/loan/")) return loanDetailView(v, +h.split("/")[2]);
    if (isAdmin) {
      if (h === "#/applications") return applicationsView(v);
      if (h === "#/customers") return customersView(v);
      if (h.startsWith("#/customer/")) return customerDetailView(v, +h.split("/")[2]);
      if (h === "#/loans") return loansView(v);
      if (h === "#/payments") return paymentsView(v);
      if (h === "#/backups") return backupsView(v);
      if (h === "#/audit") return auditView(v);
      if (h === "#/settings") return adminSettingsView(v);
    }
    v.innerHTML = `<div class="alert alert-warning">Ukurasa haupatikani.</div>`;
  }

  // ================= CUSTOMER =================
  async function customerHome(v) {
    v.innerHTML = `<div class="spinner-wrap"><div class="spinner-border text-primary"></div></div>`;
    const { data: loans, error } = await sb.from("loans").select("*").order("id", { ascending: false });
    if (error) return errorView(v, error);
    const c = state.customer;
    const done = c && c.profile_done;
    let cards = "";
    for (const l of loans || []) {
      const b = buildLoan(l, await paymentsFor(l.id), today());
      const st = l.decision === "approved" ? b.status : l.decision;
      cards += `<div class="col-md-6 col-xl-4"><div class="card h-100"><div class="card-body">
        <div class="d-flex justify-content-between"><span class="text-muted small">Mkopo #${l.id}</span>
        <span class="badge ${badge(st)}">${statusTxt(st)}</span></div>
        <div class="fs-4 fw-bold my-2">${tzs(l.principal)}</div>
        ${l.decision === "approved" ? `
          <div class="small text-muted">Deni lililobaki: <b>${tzs(b.balance)}</b> / ${tzs(b.total)}</div>
          <div class="progress my-2" style="height:6px"><div class="progress-bar" style="width:${Math.min(100, Math.round(b.paid / b.total * 100))}%"></div></div>` :
          `<div class="small text-muted">Hali: ${l.decision === "pending" ? "Inasubiri ukaguzi" : "Imekataliwa"}</div>
          ${l.decision === "pending" && l.review_note ? `<div class="small text-warning mt-1">
            <i class="bi bi-chat-left-text"></i> Ujumbe: ${esc(l.review_note)}</div>` : ""}`}
        <a href="#/loan/${l.id}" class="btn btn-sm btn-outline-primary mt-2">Fungua</a>
      </div></div></div>`;
    }
    v.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h3 class="mb-0">Habari, ${esc(c ? (c.name || c.phone) : "")}</h3>
        ${done ? `<a href="#/apply" class="btn btn-success"><i class="bi bi-plus-circle"></i> Omba mkopo</a>` : ""}
      </div>
      ${!done ? `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle"></i>
        Kamilisha <a href="#/profile">profile yako</a> kabla ya kuomba mkopo.</div>` : ""}
      ${(loans && loans.length) ? `<div class="row g-3">${cards}</div>` :
        `<div class="card p-4 text-center text-muted"><i class="bi bi-inbox fs-1"></i><br>Hakuna mikopo bado.</div>`}`;
  }

  async function paymentsFor(loanId) {
    const { data } = await sb.from("payments").select("*").eq("loan_id", loanId).order("paid_on");
    return data || [];
  }

  function statusTxt(s) {
    return { pending: "Inasubiri", active: "Hai", paid: "Imelipwa", partial: "Nusu",
      overdue: "Imechelewa", completed: "Imekamilika", approved: "Imeidhinishwa",
      rejected: "Imekataliwa" }[s] || s;
  }

  // ---------- Mkataba wa mkopo ----------
  function contractFieldsHtml(c, loan, agr, prefix) {
    const cust = c || {};
    const a = agr || {};
    const gname = a.guarantor || cust.guarantor_name || "";
    const gphone = a.guarantor_phone || cust.guarantor_phone || "";
    const signed = a.signed_on ? String(a.signed_on).slice(0, 10) : localDate();
    const val = (x) => esc(x == null ? "" : x);
    return `
      <div class="col-12"><div class="form-section">Taarifa za mkopo</div></div>
      <div class="col-md-4">
        <label class="form-label" for="${prefix}Principal">Kiasi (TZS)</label>
        <input class="form-control" type="number" id="${prefix}Principal" name="principal"
          min="${CFG.MIN_LOAN}" max="${CFG.MAX_LOAN}" value="${loan ? loan.principal : ""}" required>
        <div class="form-text">Kati ya ${tzs(CFG.MIN_LOAN)} na ${tzs(CFG.MAX_LOAN)}.</div>
      </div>
      <div class="col-md-4">
        <label class="form-label" for="${prefix}Months">Muda (miezi)</label>
        <input class="form-control" type="number" id="${prefix}Months" name="months"
          min="1" max="${CFG.MAX_MONTHS}" value="${loan ? loan.months : ""}" required>
      </div>
      <div class="col-md-4">
        <label class="form-label" for="${prefix}Purpose">Mkopo utatumika kwa nini?</label>
        <textarea class="form-control" id="${prefix}Purpose" name="purpose" maxlength="200"
          required>${val(loan && loan.purpose)}</textarea>
      </div>
      <div class="col-12">
        <div class="alert alert-info py-2 small mb-0">
          Riba, jumla ya kulipa na tarehe ya mwisho vitawekwa na ofisi baada ya ukaguzi.
          Mkataba utakuwa kamili baada ya idhini.
        </div>
      </div>

      <div class="col-12"><hr class="my-1"><div class="form-section">Mkataba</div></div>
      <div class="col-md-4">
        <label class="form-label" for="${prefix}Place">Mahali ulipokazia mkataba</label>
        <input class="form-control" id="${prefix}Place" name="place" maxlength="120"
          value="${val(a.borrower_place)}" placeholder="Mfano: Dar es Salaam" required>
      </div>
      <div class="col-md-4">
        <label class="form-label" for="${prefix}SignedOn">Tarehe ya kusaini</label>
        <input class="form-control" type="date" id="${prefix}SignedOn" name="signed_on"
          value="${val(signed)}" max="${localDate()}" required>
      </div>
      <div class="col-md-4">
        <label class="form-label" for="${prefix}BorrowerWitness">Jina la shahidi wa mkopaji</label>
        <input class="form-control" id="${prefix}BorrowerWitness" name="borrower_witness"
          maxlength="80" value="${val(a.borrower_witness)}" placeholder="Jina kamili la shahidi wako" required>
      </div>
      <div class="col-md-4">
        <label class="form-label" for="${prefix}BorrowerWitnessSign">Saini ya shahidi wa mkopaji</label>
        <input class="form-control" id="${prefix}BorrowerWitnessSign" name="borrower_witness_sign"
          maxlength="80" value="${val(a.borrower_witness_sign)}"
          placeholder="Andika jina la shahidi kama saini" required>
        <div class="form-text">Muundo wa saini: A.C. mwanjoka.</div>
      </div>
      <div class="col-md-4">
        <label class="form-label" for="${prefix}BorrowerSign">Saini ya mkopaji (andika jina lako)</label>
        <input class="form-control" id="${prefix}BorrowerSign" name="borrower_sign" maxlength="80"
          value="${val(a.borrower_sign)}" placeholder="Andika jina lako kama saini" required>
        <div class="form-text">Lazima liwe kama jina lako: <b>${esc(cust.name || "")}</b> (au mtindo wa A.C. mwanjoka).</div>
      </div>

      <div class="col-12"><hr class="my-1"><div class="form-section">Mdhamini</div></div>
      <div class="col-md-4">
        <label class="form-label">Jina la mdhamini</label>
        <input class="form-control" value="${val(gname || "Hakuna kwenye profile")}" readonly disabled>
        ${gname ? "" : `<div class="form-text text-warning"><a href="#/profile">Ongeza mdhamini kwenye profile</a> ili jina lithibitike.</div>`}
      </div>
      <div class="col-md-4">
        <label class="form-label">Simu ya mdhamini</label>
        <input class="form-control" value="${val(gphone || "-")}" readonly disabled>
      </div>
      <div class="col-md-4">
        <label class="form-label" for="${prefix}GuarantorSign">Saini ya mdhamini (andika jina lake)</label>
        <input class="form-control" id="${prefix}GuarantorSign" name="guarantor_sign" maxlength="80"
          value="${val(a.guarantor_sign)}" placeholder="Andika jina la mdhamini kama saini" required>
      </div>
      <div class="col-md-6">
        <label class="form-label" for="${prefix}GuarantorWitness">Jina la shahidi wa mdhamini</label>
        <input class="form-control" id="${prefix}GuarantorWitness" name="guarantor_witness"
          maxlength="80" value="${val(a.guarantor_witness)}" placeholder="Jina kamili la shahidi wa mdhamini" required>
      </div>
      <div class="col-md-6">
        <label class="form-label" for="${prefix}GuarantorWitnessSign">Saini ya shahidi wa mdhamini</label>
        <input class="form-control" id="${prefix}GuarantorWitnessSign" name="guarantor_witness_sign"
          maxlength="80" value="${val(a.guarantor_witness_sign)}"
          placeholder="Andika jina la shahidi kama saini" required>
      </div>

      <div class="col-12"><hr class="my-1"><div class="form-section">Dhamana ya mkataba</div></div>
      <div class="col-md-6">
        <label class="form-label" for="${prefix}Collateral1">Dhamana Na. 1 (kitu kinachowekwa dhamana)</label>
        <input class="form-control" id="${prefix}Collateral1" name="collateral_1" maxlength="160"
          value="${val(a.collateral_1)}" placeholder="Mfano: Pikipiki yenye namba ..." required>
      </div>
      <div class="col-md-3">
        <label class="form-label" for="${prefix}Collateral2">Dhamana Na. 2 (hiari)</label>
        <input class="form-control" id="${prefix}Collateral2" name="collateral_2" maxlength="160"
          value="${val(a.collateral_2)}" placeholder="Hiari">
      </div>
      <div class="col-md-3">
        <label class="form-label" for="${prefix}Collateral3">Dhamana Na. 3 (hiari)</label>
        <input class="form-control" id="${prefix}Collateral3" name="collateral_3" maxlength="160"
          value="${val(a.collateral_3)}" placeholder="Hiari">
      </div>
      <div class="col-md-6">
        <label class="form-label" for="${prefix}CollateralValue">Thamani ya dhamana (TZS)</label>
        <input class="form-control" type="number" id="${prefix}CollateralValue" name="collateral_value"
          min="1" value="${val(a.collateral_value)}" placeholder="Mfano: 500000" required>
        <div class="form-text">Thamani iliyokubaliwa na pande zote.</div>
      </div>

      <div class="col-12">
        <div class="form-check">
          <input class="form-check-input" type="checkbox" name="accept" id="${prefix}Accept" required>
          <label class="form-check-label small" for="${prefix}Accept">
            <b>Nakubali na kukubaliana</b> na masharti yote ya mkataba huu (vipindi a hadi f),
            ikiwa ni pamoja na sheria za Jamhuri ya Muungano wa Tanzania.
          </label>
        </div>
      </div>
      <div class="col-12">
        <details>
          <summary class="text-muted small" style="cursor:pointer">Soma masharti (vipindi a - f)</summary>
          <ol class="small text-muted mt-2 mb-0 ps-3">
            <li class="mb-1"><b>MKOPAJI</b> amekopa fedha kiasi alichotaja hapo juu, na ameahidi
              kulipa kiasi cha jumla ya mkopo pamoja na riba kwa muda uliowekwa.</li>
            <li class="mb-1"><b>MKOPAJI</b> ana wajibu wa kumtafuta <b>MKOPESHAJI</b> wake mara
              anapohitaji kurudisha deni lake, na si vinginevyo.</li>
            <li class="mb-1"><b>MKOPAJI</b> ana wajibu kuzingatia muda ulioandikwa kwenye makubaliano haya.</li>
            <li class="mb-1">Kwa kuweka saini <b>MKOPAJI</b> anakiri kukubaliana na utaratibu huu.</li>
            <li class="mb-1">Kwamba <b>MKOPAJI</b> kwa hiari yake yeye mwenyewe ndiye aliyeamua kukopa.</li>
            <li class="mb-1">Kwamba mkataba huu unatafsiriwa na sheria za
              <b>JAMHURI YA MUUNGANO WA TANZANIA</b>, na kwamba upande wowote utakaovunja
              mkataba huu, hatua kali za kisheria zitachukuliwa dhidi yake.</li>
            <li class="mb-1"><b>DHAMANA:</b> MKOPAJI anakiri kuweka dhamana kama hakikisho la
              marejesho. Endapo atashindwa kurejesha mkopo wote pamoja na riba ndani ya miezi 3,
              MKOPESHAJI atatoa notisi ya maandishi ya siku 14; baada ya hapo anaweza kuiuza
              dhamana kwa bei ya soko (inayothibitishwa kwa tathmini au makubaliano ya pande mbili).
              Fedha za mauzo zitachukua kiasi cha mkopo, riba halali na gharama za mauzo;
              ziada itarudishwa kwa MKOPAJI ndani ya siku 7.</li>
          </ol>
        </details>
      </div>`;
  }

  function contractValues(f) {
    return {
      p_principal: Number(f.principal.value),
      p_months: Number(f.months.value),
      p_purpose: capText(f.purpose.value, 200),
      p_place: capText(f.place.value, 120),
      p_signed_on: f.signed_on.value,
      p_borrower_witness: capText(f.borrower_witness.value, 80),
      p_borrower_witness_sign: signStyle(f.borrower_witness_sign.value || f.borrower_witness.value).slice(0, 80),
      p_borrower_sign: signStyle(f.borrower_sign.value).slice(0, 80),
      p_guarantor_sign: signStyle(f.guarantor_sign.value).slice(0, 80),
      p_guarantor_witness: capText(f.guarantor_witness.value, 80),
      p_guarantor_witness_sign: signStyle(f.guarantor_witness_sign.value || f.guarantor_witness.value).slice(0, 80),
      p_collateral_1: capText(f.collateral_1.value, 160),
      p_collateral_2: capText(f.collateral_2.value, 160),
      p_collateral_3: capText(f.collateral_3.value, 160),
      p_collateral_value: Number(f.collateral_value.value)
    };
  }

  async function contractRpc(name, f, extra) {
    const vals = { ...contractValues(f), ...(extra || {}) };
    if (!(await settingsReady())) {
      delete vals.p_borrower_witness_sign;
      delete vals.p_guarantor_witness_sign;
    }
    return sb.rpc(name, vals);
  }

  function validateContract(f, c) {
    const v = contractValues(f);
    if (!f.accept.checked) return "Kubali masharti ya mkataba kwanza.";
    if (!Number.isFinite(v.p_principal) || v.p_principal < CFG.MIN_LOAN || v.p_principal > CFG.MAX_LOAN)
      return `Kiasi kiwe kati ya ${tzs(CFG.MIN_LOAN)} na ${tzs(CFG.MAX_LOAN)}.`;
    if (!Number.isInteger(v.p_months) || v.p_months < 1 || v.p_months > CFG.MAX_MONTHS)
      return `Muda uwe miezi 1 hadi ${CFG.MAX_MONTHS}.`;
    if (v.p_purpose.length < 3) return "Eleza kwa ufupi mkopo utatumika kwa nini.";
    if (v.p_place.length < 3) return "Weka mahali ulipokazia mkataba.";
    if (!v.p_signed_on) return "Weka tarehe ya kusaini.";
    if (new Date(v.p_signed_on + "T00:00:00") > today())
      return "Tarehe ya kusaini isizidi leo.";
    if (v.p_borrower_witness.length < 3) return "Weka jina la shahidi wa mkopaji.";
    if (v.p_borrower_witness_sign.length < 2) return "Weka saini ya shahidi wa mkopaji.";
    if (v.p_borrower_sign.length < 2) return "Weka saini ya mkopaji.";
    if (!signatureMatches(v.p_borrower_sign, c && c.name))
      return `Saini ya mkopaji iwe kama jina lako: ${(c && c.name) || ""}.`;
    if (v.p_guarantor_sign.length < 2) return "Weka saini ya mdhamini.";
    if (c && c.guarantor_name && !signatureMatches(v.p_guarantor_sign, c.guarantor_name))
      return `Saini ya mdhamini iwe kama jina la mdhamini: ${c.guarantor_name}.`;
    if (v.p_guarantor_witness.length < 3) return "Weka jina la shahidi wa mdhamini.";
    if (v.p_guarantor_witness_sign.length < 2) return "Weka saini ya shahidi wa mdhamini.";
    if (v.p_collateral_1.length < 3) return "Weka dhamana ya kwanza.";
    if (!Number.isFinite(v.p_collateral_value) || v.p_collateral_value <= 0)
      return "Weka thamani sahihi ya dhamana.";
    return null;
  }

  function contractSectionHtml(loan, agr, cust, b) {
    if (!agr) {
      return `<div class="card p-3 mb-3"><h6><i class="bi bi-file-earmark-text"></i> Mkataba</h6>
        <div class="alert alert-warning mb-0">Mkataba haujajazwa bado. Mteja anapaswa kujaza
        taarifa za mkataba.</div></div>`;
    }
    const approved = loan.decision === "approved";
    const gname = agr.guarantor || (cust && cust.guarantor_name) || "";
    const gphone = agr.guarantor_phone || (cust && cust.guarantor_phone) || "";
    const lastDue = approved && b && b.rows.length ? b.rows[b.rows.length - 1].due : null;
    const money = approved ? `
      <div class="row g-2 small mb-2">
        <div class="col-md-4"><span class="text-muted">Riba:</span> <b>${tzs(b.interest)}</b></div>
        <div class="col-md-4"><span class="text-muted">Jumla ya kulipa:</span> <b>${tzs(b.total)}</b></div>
        <div class="col-md-4"><span class="text-muted">Kila mwezi:</span> <b>${tzs(b.installment)}</b></div>
        <div class="col-md-4"><span class="text-muted">Mwisho wa kulipa:</span> <b>${fmtDate(lastDue)}</b></div>
      </div>` : `
      <div class="alert alert-info py-2 small mb-2">Riba, jumla ya kulipa na tarehe ya mwisho
        vitawekwa na ofisi baada ya idhini.</div>`;
    const collateral = [agr.collateral_1, agr.collateral_2, agr.collateral_3]
      .map((x, i) => x ? `<div class="small"><span class="text-muted">Dhamana Na. ${i + 1}:</span>
        ${esc(x)}</div>` : "").join("");
    return `<div class="card p-3 mb-3">
      <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
        <div><h6 class="mb-1"><i class="bi bi-file-earmark-text"></i> Mkataba wa mkopo #${loan.id}</h6>
          <div class="text-muted small">Mahali: ${esc(agr.borrower_place || "-")} &middot;
            Tarehe: ${fmtDate(agr.signed_on)}</div></div>
        <button class="btn btn-sm btn-outline-secondary" data-print-contract>
          <i class="bi bi-printer"></i> Chapisha mkataba</button>
      </div>
      <hr class="my-2">
      <div class="row g-2 small">
        <div class="col-md-6"><span class="text-muted">Mkopaji:</span>
          <b>${esc((cust && cust.name) || "")}</b></div>
        <div class="col-md-6"><span class="text-muted">Mdhamini:</span>
          <b>${esc(gname || "-")}</b>${gphone ? ` (${esc(gphone)})` : ""}</div>
        <div class="col-md-6"><span class="text-muted">Shahidi wa mkopaji:</span>
          ${esc(agr.borrower_witness || "-")}</div>
        <div class="col-md-6"><span class="text-muted">Shahidi wa mdhamini:</span>
          ${esc(agr.guarantor_witness || "-")}</div>
        <div class="col-12"><span class="text-muted">Matumizi:</span>
          ${esc(loan.purpose || "-")}</div>
      </div>
      ${money}
      ${collateral || `<div class="small text-muted">Dhamana: -</div>`}
      <div class="small mt-2"><span class="text-muted">Thamani ya dhamana:</span>
        <b>${tzs(agr.collateral_value || 0)}</b></div>
      <details class="mt-2">
        <summary class="text-muted small" style="cursor:pointer">Soma masharti (vipindi a - f)</summary>
        <ol class="small text-muted mt-2 mb-0 ps-3">
          <li class="mb-1"><b>MKOPAJI</b> amekopa fedha kiasi cha <b>${tzs(loan.principal)}</b>${approved
            ? `, ambapo ameahidi kulipa fedha hizo kiasi cha <b>${tzs(b.total)}</b> kwa muda wa
              <b>${loan.months} miezi</b>, ifikapo tarehe <b>${fmtDate(lastDue)}</b>`
            : `, kwa muda wa <b>${loan.months} miezi</b>; riba, jumla ya kulipa na tarehe ya mwisho
              vitawekwa na ofisi baada ya idhini`}.</li>
          <li class="mb-1"><b>MKOPAJI</b> ana wajibu wa kumtafuta <b>MKOPESHAJI</b> wake mara
            anapohitaji kurudisha deni lake, na si vinginevyo.</li>
          <li class="mb-1"><b>MKOPAJI</b> ana wajibu kuzingatia muda ulioandikwa kwenye makubaliano haya.</li>
          <li class="mb-1">Kwa kuweka saini <b>MKOPAJI</b> anakiri kukubaliana na utaratibu huu.</li>
          <li class="mb-1">Kwamba <b>MKOPAJI</b> kwa hiari yake yeye mwenyewe ndiye aliyeamua kukopa.</li>
          <li class="mb-1">Kwamba mkataba huu unatafsiriwa na sheria za
            <b>JAMHURI YA MUUNGANO WA TANZANIA</b>, na kwamba upande wowote utakaovunja
            mkataba huu, hatua kali za kisheria zitachukuliwa dhidi yake.</li>
          <li class="mb-1"><b>DHAMANA:</b> MKOPAJI anakiri kuweka dhamana kama hakikisho la
            marejesho. Endapo atashindwa kurejesha mkopo wote pamoja na riba ndani ya miezi 3,
            MKOPESHAJI atatoa notisi ya maandishi ya siku 14; baada ya hapo anaweza kuiuza
            dhamana kwa bei ya soko (inayothibitishwa kwa tathmini au makubaliano ya pande mbili).
            Fedha za mauzo zitachukua kiasi cha mkopo, riba halali na gharama za mauzo;
            ziada itarudishwa kwa MKOPAJI ndani ya siku 7.</li>
        </ol>
      </details>
    </div>`;
  }

  function contractEditHtml(loan, agr, c) {
    return `<details class="card p-3 mb-3" ${loan.review_note ? "open" : ""}>
      <summary class="fw-semibold" style="cursor:pointer"><i class="bi bi-pencil-square"></i>
        Rekebisha mkataba</summary>
      <p class="text-muted small mt-2 mb-2">Badilisha sehemu zilizoonyeshwa na ofisi, kisha
        tuma tena. Ombi lako litabaki likisubiri ukaguzi.</p>
      <form id="contractEditForm" class="row g-3">
        ${contractFieldsHtml(c, loan, agr, "edit")}
        <div class="col-12"><button class="btn btn-warning"><i class="bi bi-send"></i>
          Tuma marekebisho</button></div>
      </form>
    </details>`;
  }

  async function printContract(loan, agr, cust) {
    if (!agr) return toast("Mkataba haujajazwa bado.", "warning");
    const set = await fetchAppSettings();
    const approved = loan.decision === "approved";
    const b = buildLoan(loan, [], today());
    const lastDue = approved && b.rows.length ? b.rows[b.rows.length - 1].due : null;
    const gname = agr.guarantor || (cust && cust.guarantor_name) || "";
    const gphone = agr.guarantor_phone || (cust && cust.guarantor_phone) || "";
    const interest = approved ? tzs(b.interest) : "Itawekwa baada ya idhini";
    const total = approved ? tzs(b.total) : "Itawekwa baada ya idhini";
    const monthly = approved ? tzs(b.installment) : "Itawekwa baada ya idhini";
    const repayBy = approved && lastDue ? fmtDate(lastDue) : "Itawekwa baada ya idhini";
    const signedOn = agr.signed_on ? fmtDate(agr.signed_on) : "-";
    const place = agr.borrower_place || "-";
    const borrower = (cust && cust.name) || "";
    const lender = (set && set.lender_name) || agr.lender || "ZABURI YA 23 MICROFINANCE";
    const lenderWitness = (set && set.lender_witness) || agr.lender_witness || CFG.LENDER_WITNESS || "-";
    const lenderSign = (set && set.lender_sign) || agr.lender_sign || "";
    const lenderWitnessSign = displaySign(
      (set && set.lender_witness_sign) || agr.lender_witness_sign, lenderWitness);
    const html = `<!doctype html><html lang="sw"><head><meta charset="utf-8">
      <title>Mkataba #${loan.id} | ZABURI YA 23 MICROFINANCE</title>
      <style>
        body { font-family: Arial, sans-serif; max-width:760px; margin:2rem auto; padding:1.5rem; color:#111; }
        .brand { text-align:center; margin-bottom:.4rem; }
        .brand em { font-size:.85rem; letter-spacing:.06em; color:#444; }
        h1 { text-align:center; font-size:1.25rem; margin:0 0 .2rem; text-transform:uppercase; }
        h2.section { font-size:1rem; text-transform:uppercase; border-bottom:1px solid #999;
                     padding-bottom:.25rem; margin:1.6rem 0 .6rem; }
        .sub { text-align:center; color:#555; font-size:.85rem; margin-bottom:1.4rem; }
        p { line-height:1.75; text-align:justify; font-size:.94rem; margin:.7rem 0; }
        .kv { width:100%; border-collapse:collapse; margin:.6rem 0 1rem; }
        .kv td { padding:.45rem .6rem; border-bottom:1px dotted #bbb; font-size:.94rem; }
        .kv td:last-child { text-align:right; font-weight:bold; white-space:nowrap; }
        ol { font-size:.94rem; line-height:1.75; padding-left:1.4rem; }
        ol li { margin-bottom:.5rem; }
        .sign { width:100%; border-collapse:collapse; margin-top:1.6rem; font-size:.85rem; }
        .sign th { border:1px solid #999; padding:.5rem; background:#f2f2f2; text-transform:uppercase; font-size:.72rem; }
        .sign td { border:1px solid #999; padding:.55rem .5rem; height:74px; vertical-align:top; }
        .sign .sig { font-style:italic; font-size:1.05rem; }
        .note { font-size:.78rem; color:#555; margin-top:1.4rem; border-top:1px solid #ccc; padding-top:.6rem; }
        button { display:block; margin:1.6rem auto 0; padding:.5rem 1.3rem; cursor:pointer; }
        @media print { button { display:none; } body { margin:0; padding:0; } .sign td { height:96px; } }
      </style></head><body>
      <div class="brand"><em>ZABURI YA 23 MICROFINANCE</em></div>
      <h1>Mkataba wa Kukopeshana Fedha kwa Riba</h1>
      <div class="sub">Namba ya mkataba: AGR-${String(loan.id).padStart(5, "0")} &middot; Mkopo #${loan.id}</div>

      <p>Mkataba huu umetiwa saini leo tarehe <b>${esc(signedOn)}</b> mahali <b>${esc(place)}</b>,
        kwa hati ya <b>MKOPESHAJI</b> ambaye ni <b>${esc(lender)}</b>
        (ninajitambulisha kama &ldquo;MKOPESHAJI&rdquo;)</p>

      <p><b>NA</b></p>

      <p>Kwa upande wa pili ndugu atafahamika kuwa <b>MKOPAJI</b> wa ${esc(lender)},
        ambaye amekubaliwa kama ifuatavyo:</p>

      <ol type="a">
        <li>MKOPAJI amekopa fedha kiasi cha <b>${tzs(loan.principal)}</b>, ambapo ameahidi
          kulipa fedha hizo kiasi cha <b>${esc(total)}</b> (riba ya ${esc(interest)}) kwa muda wa
          <b>${loan.months} miezi</b>, ifikapo tarehe <b>${esc(repayBy)}</b>.</li>
        <li>MKOPAJI ana wajibu wa kumtafuta MKOPESHAJI wake mara anapohitaji kurudisha deni lake,
          na si vinginevyo.</li>
        <li>MKOPAJI ana wajibu kuzingatia muda ulioandikwa kwenye makubaliano haya.</li>
        <li>Kwa kuweka saini, MKOPAJI anakiri kukubaliana na utaratibu huu.</li>
        <li>Kwamba MKOPAJI kwa hiari yake yeye mwenyewe ndiye aliyeamua kukopa.</li>
        <li>Kwamba mkataba huu unatafsiriwa na sheria za JAMHURI YA MUUNGANO WA TANZANIA,
          na kwamba upande wowote utakaovunja mkataba huu, hatua kali za kisheria
          zitachukuliwa dhidi yake.</li>
        <li><b>MDHAMINI</b>${gname ? ` <b>${esc(gname)}</b>` : ""} amesaini kama mdhamini
          wa mkopo huu, na anakubali kuwajibika kuhakikisha deni hili linalipwa kwa wakati.</li>
      </ol>

      <table class="kv">
        <tr><td>Kiasi kilichokopeshwa (principal)</td><td>${tzs(loan.principal)}</td></tr>
        <tr><td>Riba</td><td>${esc(interest)}</td></tr>
        <tr><td>Jumla ya kulipa</td><td>${esc(total)}</td></tr>
        <tr><td>Muda wa kulipa</td><td>${loan.months} miezi</td></tr>
        <tr><td>Malipo ya kila mwezi</td><td>${esc(monthly)}</td></tr>
        <tr><td>Tarehe ya mwisho ya kulipa</td><td>${esc(repayBy)}</td></tr>
        ${loan.purpose ? `<tr><td>Matumizi ya mkopo</td><td>${esc(loan.purpose)}</td></tr>` : ""}
      </table>

      <h2 class="section">Dhamana ya Mkataba</h2>
      <p>Wahusika (MKOPESHAJI na MKOPAJI) wamekubaliana kuweka dhamana kama hakikisho la
        marejesho ya mkopo huu kama ifuatavyo. MKOPAJI anakiri kuweka dhamana zifuatazo:</p>
      <table class="kv">
        <tr><td>Dhamana Na. 1</td><td>${esc(agr.collateral_1 || "—")}</td></tr>
        ${agr.collateral_2 ? `<tr><td>Dhamana Na. 2</td><td>${esc(agr.collateral_2)}</td></tr>` : ""}
        ${agr.collateral_3 ? `<tr><td>Dhamana Na. 3</td><td>${esc(agr.collateral_3)}</td></tr>` : ""}
        <tr><td>Thamani ya dhamana</td><td>${tzs(agr.collateral_value || 0)}</td></tr>
      </table>
      <p>Endapo MKOPAJI atashindwa kurejesha mkopo wote pamoja na riba ndani ya miezi 3 kuanzia
        tarehe ya mkataba huu, utaratibu ufuatao utafuatwa na MKOPESHAJI badala ya kuchukua mali
        moja kwa moja:</p>
      <ol type="i">
        <li>MKOPESHAJI atatoa notisi ya maandishi ya siku 14 kwa MKOPAJI kumtaka alipe deni.</li>
        <li>Baada ya notisi kuisha bila malipo, MKOPESHAJI atakuwa na haki ya kuiuza dhamana hiyo
          kwa bei ya soko. Bei ya soko itathibitishwa kwa tathmini au makubaliano ya pande mbili.</li>
        <li>Fedha zitakazopatikana kwa mauzo, MKOPESHAJI atachukua tu kiasi cha mkopo, riba halali
          na gharama za mauzo. Kama kutabaki ziada, MKOPESHAJI atarudisha ziada hiyo kwa MKOPAJI
          ndani ya siku 7.</li>
      </ol>

      <p>Wahusika wamekubaliana kama ilivyo hapo juu na kuweka saini zao kama ifuatavyo hapo chini.</p>

      <table class="sign">
        <thead><tr><th style="width:30%">Naibu</th><th style="width:35%">Jina</th><th>Sahihi</th></tr></thead>
        <tbody>
          <tr><td><b>MKOPESHAJI</b></td><td>${esc(lender)}</td>
            <td class="sig">${esc(lenderSign)}</td></tr>
          <tr><td><b>SHAHIDI WA MKOPESHAJI</b></td><td>${esc(lenderWitness)}</td>
            <td class="sig">${esc(lenderWitnessSign)}</td></tr>
          <tr><td><b>MKOPAJI</b></td><td>${esc(borrower)}</td>
            <td class="sig">${esc(agr.borrower_sign || "")}</td></tr>
          <tr><td><b>SHAHIDI WA MKOPAJI</b></td><td>${esc(agr.borrower_witness || "-")}</td>
            <td class="sig">${esc(displaySign(agr.borrower_witness_sign, agr.borrower_witness))}</td></tr>
          <tr><td><b>MDHAMINI</b></td><td>${esc(gname || "-")}${gphone ? ` (${esc(gphone)})` : ""}</td>
            <td class="sig">${esc(agr.guarantor_sign || "")}</td></tr>
          <tr><td><b>SHAHIDI WA MDHAMINI</b></td><td>${esc(agr.guarantor_witness || "-")}</td>
            <td class="sig">${esc(displaySign(agr.guarantor_witness_sign, agr.guarantor_witness))}</td></tr>
        </tbody>
      </table>

      <div class="note">Mkataba huu umetengenezwa na mfumo wa ZABURI YA 23 MICROFINANCE.
        Wahusika wamekubaliana kama ilivyo hapo juu na kuweka saini zao kama ilivyo hapo chini.
        Majina yameandikwa kwa herufi kubwa za mwanzo; saini zote ziko kwa mtindo wa A.C. mwanjoka.
        ${loan.decision === "pending" ? " Hali: Inasubiri idhini ya ofisi." : ""}${loan.decision === "rejected" ? " Hali: Ombi limekataliwa." : ""}</div>

      <p class="note">Tumia Ctrl+P (au menyu ya kivinjari) kuchapisha au kuhifadhi PDF.</p>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast("Ruhusu pop-up ili kuchapisha mkataba.", "danger");
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (_) {} }, 500);
  }

  async function applyView(v) {
    const c = state.customer;
    if (!c || !c.profile_done) {
      v.innerHTML = `<div class="alert alert-warning">Kamilisha <a href="#/profile">profile</a> kwanza.</div>`;
      return;
    }
    v.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h3 class="mb-0">Omba mkopo</h3>
        <a href="#/" class="btn btn-sm btn-outline-secondary">Rudi</a>
      </div>
      <div class="card p-4">
        <div class="text-center mb-3 pb-2 border-bottom">
          <div class="text-muted small" style="letter-spacing:.05em">ZABURI YA 23 MICROFINANCE</div>
          <h5 class="mb-1">MKATABA WA KUKOPESHANA FEDHA KWA RIBA</h5>
          <div class="text-muted small">Jaza taarifa zote za mkataba kabla ya kutuma ombi.</div>
        </div>
        <form id="applyForm" class="row g-3">
          ${contractFieldsHtml(c, null, null, "app")}
          <div class="col-12"><button class="btn btn-success btn-lg w-100">
            <i class="bi bi-send"></i> Tuma ombi na mkataba</button></div>
        </form>
      </div>`;
    document.getElementById("applyForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const err = validateContract(f, c);
      if (err) return toast(err, "danger");
      const { error } = await contractRpc("apply_loan_contract", f);
      if (error) return toast(error.message, "danger");
      f.reset();
      toast("Ombi na mkataba vimepokelewa. Utajulishwa uamuzi ukitolewa.", "success");
      location.hash = "#/";
    });
  }

  async function profileView(v) {
    const c = state.customer || {};
    const g = (k) => esc(c[k] || "");
    v.innerHTML = `
      <h3 class="mb-3">Profile yako</h3>
      <div class="card p-4">
        <form id="profileForm">
          <div class="form-section">Taarifa zako</div>
          <div class="row g-3">
            <div class="col-md-6"><label class="form-label">Jina kamili (majina matatu)</label>
              <input class="form-control" name="name" value="${g("name")}" maxlength="120" required></div>
            <div class="col-md-6"><label class="form-label">Namba ya simu</label>
              <input class="form-control" name="phone" value="${g("phone")}" maxlength="13" inputmode="tel" required></div>
            <div class="col-md-6"><label class="form-label">Barua pepe (hiari)</label>
              <input class="form-control" type="email" name="email" value="${g("email")}" maxlength="160"></div>
            <div class="col-md-6"><label class="form-label">Anwani</label>
              <input class="form-control" name="address" value="${g("address")}" maxlength="160" required></div>
            <div class="col-md-6"><label class="form-label">Kazi</label>
              <input class="form-control" name="occupation" value="${g("occupation")}" maxlength="120" required></div>
          </div>
          <div class="form-section">Mdhamini</div>
          <div class="row g-3">
            <div class="col-md-6"><label class="form-label">Jina la mdhamini</label>
              <input class="form-control" name="guarantor_name" value="${g("guarantor_name")}" maxlength="120" required></div>
            <div class="col-md-6"><label class="form-label">Simu ya mdhamini</label>
              <input class="form-control" name="guarantor_phone" value="${g("guarantor_phone")}" maxlength="13" inputmode="tel" required></div>
            <div class="col-md-6"><label class="form-label">Anwani ya mdhamini</label>
              <input class="form-control" name="guarantor_address" value="${g("guarantor_address")}" maxlength="160" required></div>
          </div>
          <div class="form-section">Benki (hiari)</div>
          <div class="row g-3">
            <div class="col-md-6"><label class="form-label">Jina la benki</label>
              <input class="form-control" name="bank_name" value="${g("bank_name")}" maxlength="120"></div>
            <div class="col-md-6"><label class="form-label">Namba ya akaunti</label>
              <input class="form-control" name="bank_account" value="${g("bank_account")}" maxlength="40"></div>
          </div>
          <button class="btn btn-primary btn-lg mt-4">Hifadhi</button>
        </form>
      </div>`;
    document.getElementById("profileForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const name = capText(f.name.value, 120);
      if (name.split(/\s+/).length < 3) return toast("Andika majina matatu kamili.", "danger");
      if (!validPhone(f.phone.value)) return toast("Namba yako ya simu si sahihi.", "danger");
      if (!validPhone(f.guarantor_phone.value)) return toast("Simu ya mdhamini si sahihi.", "danger");
      if (normPhone(f.guarantor_phone.value) === normPhone(f.phone.value))
        return toast("Mdhamini asimame na namba yako mwenyewe.", "danger");
      const { error } = await sb.rpc("save_profile", {
        p_name: name, p_phone: normPhone(f.phone.value), p_email: f.email.value.trim(),
        p_address: capText(f.address.value, 160), p_occupation: capText(f.occupation.value, 120),
        p_guarantor_name: capText(f.guarantor_name.value, 120),
        p_guarantor_phone: normPhone(f.guarantor_phone.value),
        p_guarantor_address: capText(f.guarantor_address.value, 160),
        p_bank_name: capText(f.bank_name.value, 120), p_bank_account: f.bank_account.value.trim()
      });
      if (error) return toast(error.message, "danger");
      await loadProfile();
      toast("Taarifa zako zimehifadhiwa.", "success");
      location.hash = "#/";
    });
  }

  function resetPasswordView(v) {
    if (!state.user) {
      v.innerHTML = `<div class="alert alert-warning">
        <i class="bi bi-shield-exclamation"></i> Kiungo cha kubadilisha password hakifai au kimeisha muda.
        <a href="#" id="resetToForgot" class="alert-link">Omba kiungo kipya</a>.</div>`;
      const link = document.getElementById("resetToForgot");
      if (link) link.addEventListener("click", (ev) => { ev.preventDefault(); state.recovery = false; renderAuth(); });
      return;
    }
    v.innerHTML = `
      <h3 class="mb-3">Weka password mpya</h3>
      <div class="card p-4" style="max-width:560px">
        <p class="text-muted small">Uthibitisho wa barua pepe umefanikiwa. Weka password mpya
          (angalau herufi 8, changanya herufi na nambari au alama).</p>
        <form id="resetForm">
          <div class="mb-3"><label class="form-label">Password mpya</label>
            <input class="form-control" type="password" name="new"
              autocomplete="new-password" required></div>
          <div class="mb-3"><label class="form-label">Rudia password mpya</label>
            <input class="form-control" type="password" name="new2"
              autocomplete="new-password" required></div>
          <button class="btn btn-primary"><i class="bi bi-check-lg"></i> Hifadhi password</button>
        </form>
      </div>`;
    document.getElementById("resetForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const nw = f.new.value, nw2 = f.new2.value;
      const prob = passwordProblem(nw, state.profile ? state.profile.username : "");
      if (prob) return toast(prob, "danger");
      if (nw !== nw2) return toast("Password mbili hazifanani.", "danger");
      const { error } = await sb.auth.updateUser({ password: nw });
      if (error) return toast(error.message, "danger");
      state.recovery = false;
      toast("Password imebadilishwa. Karibu!", "success");
      location.hash = "#/";
      render();
    });
  }

  function forcePasswordView(v) {
    const who = state.profile ? (state.profile.username || state.profile.email || "") : "";
    v.innerHTML = `
      <div class="row justify-content-center"><div class="col-lg-6">
        <div class="card p-4">
          <h3 class="mb-2">Weka password mpya</h3>
          <p class="text-muted small">Umeingia kwa password ya muda. Kwa usalama, weka
            password mpya kabla ya kuendelea.</p>
          <form id="forcePasswordForm">
            <div class="mb-3"><label class="form-label">Password mpya</label>
              <input class="form-control" type="password" name="new"
                autocomplete="new-password" required></div>
            <div class="mb-3"><label class="form-label">Rudia password mpya</label>
              <input class="form-control" type="password" name="new2"
                autocomplete="new-password" required></div>
            <button class="btn btn-primary w-100"><i class="bi bi-check-lg"></i>
              Hifadhi na uingie tena</button>
          </form>
        </div>
      </div></div>`;
    document.getElementById("forcePasswordForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const nw = f.new.value, nw2 = f.new2.value;
      const prob = passwordProblem(nw, who);
      if (prob) return toast(prob, "danger");
      if (nw !== nw2) return toast("Password mbili hazifanani.", "danger");
      const btn = f.querySelector("button");
      btn.disabled = true;
      const { data, error } = await sb.functions.invoke("complete-password-change", {
        body: { password: nw }
      });
      if (error || (data && data.error)) {
        btn.disabled = false;
        const msg = (data && data.error) ||
          await fnError(error, "Imeshindikana kubadilisha password. Jaribu tena.");
        return toast(msg, "danger");
      }
      const ident = state.profile ? (state.profile.email || state.profile.username || "") : "";
      pendingLoginIdentifier = ident;
      await sb.auth.signOut();
      state = { user: null, profile: null, customer: null, recovery: false };
      render();
      toast("Password imebadilishwa. Ingia na password yako mpya.", "success");
    });
  }

  function passwordView(v) {
    v.innerHTML = `
      <h3 class="mb-3">Badilisha password</h3>
      <div class="card p-4" style="max-width:560px">
        <p class="text-muted small">Weka password yako ya sasa, kisha password mpya
          (angalau herufi 8, changanya herufi na nambari au alama).</p>
        <form id="passwordForm">
          <div class="mb-3"><label class="form-label">Password ya sasa</label>
            <input class="form-control" type="password" name="current"
              autocomplete="current-password" required></div>
          <div class="mb-3"><label class="form-label">Password mpya</label>
            <input class="form-control" type="password" name="new"
              autocomplete="new-password" required></div>
          <div class="mb-3"><label class="form-label">Rudia password mpya</label>
            <input class="form-control" type="password" name="new2"
              autocomplete="new-password" required></div>
          <div class="d-flex gap-2">
            <button class="btn btn-primary"><i class="bi bi-check-lg"></i> Hifadhi password</button>
            <a class="btn btn-outline-secondary" href="#/">Ghairi</a>
          </div>
        </form>
      </div>`;
    document.getElementById("passwordForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const cur = f.current.value, nw = f.new.value, nw2 = f.new2.value;
      const prob = passwordProblem(nw, state.profile ? state.profile.username : "");
      if (prob) return toast(prob, "danger");
      if (nw !== nw2) return toast("Password mbili hazifanani.", "danger");
      if (nw === cur) return toast("Password mpya isiwe sawa na ya sasa.", "danger");
      const email = state.user && state.user.email;
      if (!email) return toast("Kikao kimeisha. Ingia tena.", "danger");
      const { error: authErr } = await sb.auth.signInWithPassword({ email, password: cur });
      if (authErr) return toast("Password ya sasa si sahihi.", "danger");
      const { error } = await sb.auth.updateUser({ password: nw });
      if (error) return toast(error.message, "danger");
      f.reset();
      toast("Password imebadilishwa. Tumia password mpya wakati ujao.", "success");
      location.hash = "#/";
    });
  }

  // ================= LOAN DETAIL (shared) =================
  async function loanDetailView(v, lid) {
    v.innerHTML = `<div class="spinner-wrap"><div class="spinner-border text-primary"></div></div>`;
    const isAdmin = state.profile.role === "admin";
    const set = isAdmin ? await fetchAppSettings() : null;
    const { data: loan, error: loanErr } = await sb.from("loans")
      .select("*, customers(name, phone, guarantor_name, guarantor_phone)")
      .eq("id", lid).maybeSingle();
    if (loanErr) return errorView(v, loanErr);
    if (!loan) { v.innerHTML = `<div class="alert alert-warning">Mkopo haupatikani.</div>`; return; }
    const pays = await paymentsFor(lid);
    const { data: agr, error: agrErr } = await sb.from("agreements").select("*").eq("loan_id", lid).maybeSingle();
    if (agrErr) return errorView(v, agrErr);
    const b = buildLoan(loan, pays, today());
    const contractDone = !!(agr && agr.accepted && (agr.lender_sign || "").trim());
    const hasContract = !!(agr && agr.accepted && (agr.borrower_sign || "").trim());
    const cust = loan.customers || (isAdmin ? {} : (state.customer || {}));
    const isOwner = !isAdmin && state.customer &&
      Number(loan.customer_id) === Number(state.customer.id);

    let payForm = "";
    if (isAdmin && loan.decision === "approved" && b.balance > 0) {
      payForm = contractDone ? `
        <div class="card p-3 mb-3"><h6>Rekodi malipo</h6>
        <form id="payForm" class="row g-2">
          <div class="col-6"><input class="form-control" type="number" min="1" max="${b.balance}" name="amount" placeholder="Kiasi" required></div>
          <div class="col-6"><input class="form-control" type="date" name="paid_on" value="${localDate()}" required></div>
          <div class="col-6"><select class="form-select" name="method">${METHODS.map((m) => `<option>${esc(m)}</option>`).join("")}</select></div>
          <div class="col-6"><input class="form-control" name="note" placeholder="Maelezo (hiari)" maxlength="200"></div>
          <div class="col-12"><button class="btn btn-success w-100">Hifadhi malipo</button></div>
        </form></div>` : `
        <div class="alert alert-warning mb-3"><i class="bi bi-lock"></i>
          Kurekodi malipo kumezuiwa. Mkataba lazima usainiwe kikamilifu.</div>`;
    }

    const rows = b.rows.map((r) => `<tr>
      <td>${r.no}</td><td>${fmtDate(r.due)}</td><td>${tzs(r.amount)}</td>
      <td>${tzs(r.paid)}</td><td><span class="badge ${badge(r.status)}">${statusTxt(r.status)}</span></td></tr>`).join("");

    const payRows = pays.length ? pays.map((p) => `<tr>
      <td>${fmtDate(p.paid_on)}</td><td>${tzs(p.amount)}</td><td>${esc(p.method)}</td>
      <td>${esc(p.note || "")}</td></tr>`).join("") :
      `<tr><td colspan="4" class="text-muted text-center">Hakuna malipo bado.</td></tr>`;

    // signing blocks
    let signBlock = "";
    if (loan.decision === "approved") {
      if (!agr || !agr.accepted) {
        signBlock += `<div class="card p-3 mb-3"><h6><i class="bi bi-pen"></i> Saini ya mkopaji</h6>
          <form id="signBorrower" class="row g-2">
            <div class="col-md-3"><input class="form-control" name="sign" placeholder="Jina/sahihi yako" maxlength="80" required></div>
            <div class="col-md-3"><input class="form-control" name="witness" placeholder="Shahidi" maxlength="80" required></div>
            <div class="col-md-3"><input class="form-control" name="witness_sign" placeholder="Saini ya shahidi" maxlength="80" required></div>
            <div class="col-md-3"><input class="form-control" name="place" placeholder="Mahali" maxlength="120" required></div>
            <div class="col-12"><button class="btn btn-primary">Hifadhi saini</button></div>
          </form></div>`;
      }
      if (isAdmin && (!agr || !(agr.lender_sign || "").trim())) {
        signBlock += `<div class="card p-3 mb-3"><h6><i class="bi bi-pen"></i> Saini ya mkopeshaji</h6>
          <div class="form-text mb-2">Taarifa hizi zinatumika kwenye mikataba yote.
            <a href="#/settings">Zihariri hapa</a>.</div>
          <form id="signLender" class="row g-2">
            <div class="col-md-4"><input class="form-control" name="witness" value="${esc((set && set.lender_witness) || CFG.LENDER_WITNESS || "")}" placeholder="Shahidi wa mkopeshaji" maxlength="80" required></div>
            <div class="col-md-4"><input class="form-control" name="witness_sign" value="${esc((set && set.lender_witness_sign) || signStyle((set && set.lender_witness) || CFG.LENDER_WITNESS || ""))}" placeholder="Saini ya shahidi" maxlength="80" required></div>
            <div class="col-md-4"><input class="form-control" name="sign" value="${esc((set && set.lender_sign) || "")}" placeholder="Andika jina la mkopeshaji" maxlength="80" required></div>
            <div class="col-12"><button class="btn btn-warning">Hifadhi saini ya mkopeshaji</button></div>
          </form></div>`;
      }
    }

    let reviewCard = "";
    if (isAdmin && loan.decision === "pending") {
      reviewCard = `<div class="card p-3 mb-3">
        <h6><i class="bi bi-clipboard-check"></i> Ukaguzi wa mkataba</h6>
        ${!hasContract ? `<div class="alert alert-warning py-2 small">Mteja hajajaza mkataba bado.
          Tuma ujumbe wa kumtaka ajaze.</div>` : ""}
        <form id="reviewForm">
          <div class="mb-2"><label class="form-label small">Ujumbe kwa mteja (marekebisho)</label>
            <textarea class="form-control" name="note" rows="2" maxlength="300"
              placeholder="Eleza sehemu zinazohitaji kurekebishwa...">${esc(loan.review_note || "")}</textarea></div>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-warning" type="submit"><i class="bi bi-send"></i>
              Tuma ujumbe wa marekebisho</button>
            <button class="btn btn-success" type="button" id="approveLoanBtn">
              <i class="bi bi-check-lg"></i> Idhinisha</button>
            <button class="btn btn-outline-danger" type="button" id="rejectLoanBtn">
              <i class="bi bi-x-lg"></i> Kataa</button>
          </div>
        </form>
      </div>`;
    }

    const statusAlert = loan.decision === "rejected"
      ? `<div class="alert alert-danger">Ombi limekataliwa. ${esc(loan.review_note || "")}</div>`
      : (loan.decision === "pending"
        ? (loan.review_note
          ? `<div class="alert alert-warning"><b>Ujumbe kutoka ofisi:</b> ${esc(loan.review_note)}</div>`
          : `<div class="alert alert-info">Ombi linasubiri ukaguzi wa ofisi.</div>`)
        : "");

    v.innerHTML = `
      <a href="#/" class="text-decoration-none">&larr; Rudi</a>
      <div class="d-flex justify-content-between align-items-center my-3 gap-2 flex-wrap">
        <h3 class="mb-0">Mkopo #${loan.id}
          <span class="badge ${badge(loan.decision === "approved" ? b.status : loan.decision)}">
            ${statusTxt(loan.decision === "approved" ? b.status : loan.decision)}</span></h3>
        ${agr ? `<button class="btn btn-outline-secondary btn-sm" id="printLoanBtn">
          <i class="bi bi-printer"></i> Chapisha mkataba</button>` : ""}
      </div>
      ${statusAlert}
      ${contractSectionHtml(loan, agr, cust, b)}
      ${isOwner && loan.decision === "pending" ? contractEditHtml(loan, agr, cust) : ""}
      ${reviewCard}
      ${loan.decision === "approved" ? `
      <div class="row g-3 mb-3">
        ${stat("Kiasi", tzs(loan.principal))}
        ${stat(`Riba (${loan.rate}%/mwezi x ${loan.months})`, tzs(b.interest))}
        ${stat("Jumla ya kulipa", tzs(b.total))}
        ${stat("Kila mwezi", tzs(b.installment))}
        ${stat("Kimelipwa", tzs(b.paid))}
        ${stat("Lililobaki", tzs(b.balance))}
      </div>
      ${b.overdueAmount ? `<div class="alert alert-danger">Umechelewa kulipa ${tzs(b.overdueAmount)}.</div>` :
        b.nextDue ? `<div class="alert alert-info">Malipo yanayofuata: <b>${fmtDate(b.nextDue.due)}</b> (${tzs(b.nextDue.amount - b.nextDue.paid)})</div>` : ""}
      ` : ""}
      ${signBlock}
      ${loan.decision === "approved" ? `
      <div class="row g-3">
        <div class="col-lg-7"><div class="card p-3"><h6>Ratiba ya malipo</h6>
          <div class="table-responsive"><table class="table table-sm align-middle mb-0">
            <thead><tr><th>#</th><th>Tarehe</th><th>Kiasi</th><th>Kimelipwa</th><th>Hali</th></tr></thead>
            <tbody>${rows}</tbody></table></div></div></div>
        <div class="col-lg-5">${payForm}
          <div class="card p-3"><h6>Historia ya malipo</h6>
            <table class="table table-sm mb-0"><thead><tr><th>Tarehe</th><th>Kiasi</th><th>Njia</th><th>Maelezo</th></tr></thead>
            <tbody>${payRows}</tbody></table></div></div>
      </div>` : ""}`;

    const pb = document.getElementById("printLoanBtn");
    if (pb) pb.addEventListener("click", () => printContract(loan, agr, cust));
    v.querySelectorAll("[data-print-contract]").forEach((btn) =>
      btn.addEventListener("click", () => printContract(loan, agr, cust)));

    const pf = document.getElementById("payForm");
    if (pf) pf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const { error } = await sb.rpc("record_payment", {
        p_loan_id: lid, p_amount: +f.amount.value, p_paid_on: f.paid_on.value,
        p_method: f.method.value, p_note: capText(f.note.value, 200)
      });
      if (error) return toast(error.message, "danger");
      toast("Malipo yamerekodiwa.", "success"); loanDetailView(v, lid);
    });
    const sb1 = document.getElementById("signBorrower");
    if (sb1) sb1.addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target;
      const vals = { p_loan_id: lid, p_sign: signStyle(f.sign.value).slice(0, 80),
        p_witness: capText(f.witness.value, 80),
        p_witness_sign: signStyle(f.witness_sign.value || f.witness.value).slice(0, 80),
        p_place: capText(f.place.value, 120) };
      if (!(await settingsReady())) delete vals.p_witness_sign;
      const { error } = await sb.rpc("sign_borrower", vals);
      if (error) return toast(error.message, "danger");
      toast("Mkataba umesainiwa.", "success"); loanDetailView(v, lid);
    });
    const sl = document.getElementById("signLender");
    if (sl) sl.addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target;
      const witness = capText(f.witness.value, 80);
      const witnessSign = signStyle(f.witness_sign.value || f.witness.value).slice(0, 80);
      const sign = signStyle(f.sign.value).slice(0, 80);
      const vals = { p_loan_id: lid, p_sign: sign, p_witness: witness, p_witness_sign: witnessSign };
      const ready = await settingsReady();
      if (!ready) delete vals.p_witness_sign;
      const { error } = await sb.rpc("sign_lender", vals);
      if (error) return toast(error.message, "danger");
      if (ready) {
        const upd = await sb.rpc("save_app_settings", {
          p_lender_name: capText((set && set.lender_name) || CFG.BRAND || "ZABURI YA 23 MICROFINANCE", 120),
          p_lender_witness: witness, p_lender_witness_sign: witnessSign, p_lender_sign: sign
        });
        if (upd.error) return toast(upd.error.message, "danger");
      }
      toast("Saini ya mkopeshaji imehifadhiwa kwenye mikataba yote.", "success");
      loanDetailView(v, lid);
    });

    const rf = document.getElementById("reviewForm");
    if (rf) rf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const note = capText(rf.note.value, 300);
      if (note.length < 3) return toast("Andika ujumbe wa marekebisho.", "danger");
      const { error } = await sb.rpc("request_loan_changes", { p_loan_id: lid, p_note: note });
      if (error) return toast(error.message, "danger");
      toast("Ujumbe umetumwa kwa mteja.", "success");
      loanDetailView(v, lid);
    });
    const ab = document.getElementById("approveLoanBtn");
    if (ab) ab.addEventListener("click", () => approveDialog(v, lid, () => loanDetailView(v, lid)));
    const rb = document.getElementById("rejectLoanBtn");
    if (rb) rb.addEventListener("click", () => rejectLoan(v, lid, () => loanDetailView(v, lid)));

    const ef = document.getElementById("contractEditForm");
    if (ef) ef.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = validateContract(ef, cust);
      if (err) return toast(err, "danger");
      const { error } = await contractRpc("resubmit_loan_contract", ef, { p_loan_id: lid });
      if (error) return toast(error.message, "danger");
      toast("Marekebisho yametumwa. Ombi linasubiri ukaguzi.", "success");
      loanDetailView(v, lid);
    });
  }

  function stat(label, val) {
    return `<div class="col-6 col-md-4 col-lg-2"><div class="card p-3 h-100">
      <div class="text-muted small">${esc(label)}</div><div class="fw-bold">${val}</div></div></div>`;
  }

  // ================= ADMIN =================
  async function adminSettingsView(v) {
    v.innerHTML = `<div class="spinner-wrap"><div class="spinner-border text-primary"></div></div>`;
    if (!(await settingsReady())) {
      v.innerHTML = `<div class="alert alert-warning">Kipengele hiki kinahitaji
        migration ya mkataba. Endesha
        <b>supabase/migrations/20261123120000_contract_signatures_settings.sql</b>
        kwenye Supabase SQL Editor kwanza.</div>`;
      return;
    }
    const s = (await fetchAppSettings()) || {};
    v.innerHTML = `
      <h3 class="mb-3">Taarifa za Mkopeshaji kwenye Mkataba</h3>
      <div class="alert alert-info py-2 small">
        Majina yote yaliyojazwa kwenye fomu huandikwa kwa herufi kubwa za mwanzo.
        Saini zote husawazishwa kwa mtindo wa <b>A.C. mwanjoka</b>. Unapobadilisha taarifa
        hapa, zinasasishwa <b>kwenye mikataba yote</b> mara moja.
      </div>
      <div class="card p-4" style="max-width:820px">
        <form id="settingsForm" class="row g-3">
          <div class="col-md-6"><label class="form-label">Jina la MKOPESHAJI</label>
            <input class="form-control" name="lender_name" maxlength="120"
              value="${esc(s.lender_name || CFG.BRAND || "")}" required></div>
          <div class="col-md-6"><label class="form-label">Saini ya MKOPESHAJI</label>
            <input class="form-control" name="lender_sign" maxlength="80"
              value="${esc(s.lender_sign || "")}" placeholder="Mfano: A.C. mwanjoka" required></div>
          <div class="col-md-6"><label class="form-label">Jina la SHAHIDI WA MKOPESHAJI</label>
            <input class="form-control" name="lender_witness" maxlength="120"
              value="${esc(s.lender_witness || CFG.LENDER_WITNESS || "")}" required></div>
          <div class="col-md-6"><label class="form-label">Saini ya SHAHIDI WA MKOPESHAJI</label>
            <input class="form-control" name="lender_witness_sign" maxlength="80"
              value="${esc(s.lender_witness_sign || signStyle(s.lender_witness || CFG.LENDER_WITNESS || ""))}" placeholder="Mfano: A.C. mwanjoka" required></div>
          <div class="col-12"><button class="btn btn-primary">
            <i class="bi bi-check-lg"></i> Hifadhi na usasishe mikataba yote</button></div>
        </form>
      </div>`;
    document.getElementById("settingsForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const { error } = await sb.rpc("save_app_settings", {
        p_lender_name: capText(f.lender_name.value, 120),
        p_lender_witness: capText(f.lender_witness.value, 120),
        p_lender_witness_sign: signStyle(f.lender_witness_sign.value || f.lender_witness.value).slice(0, 80),
        p_lender_sign: signStyle(f.lender_sign.value).slice(0, 80)
      });
      if (error) return toast(error.message, "danger");
      toast("Taarifa za mkopeshaji zimesasishwa kwenye mikataba yote.", "success");
      adminSettingsView(v);
    });
  }

  async function adminDashboard(v) {
    v.innerHTML = `<div class="spinner-wrap"><div class="spinner-border text-primary"></div></div>`;
    const [loans, payments, customers, pending] = await Promise.all([
      sb.from("loans").select("*"),
      sb.from("payments").select("*"),
      sb.from("customers").select("id", { count: "exact", head: true }),
      sb.from("loans").select("id", { count: "exact", head: true }).eq("decision", "pending")
    ]);
    const firstErr = [loans, payments, customers, pending].find((r) => r.error);
    if (firstErr) return errorView(v, firstErr.error);
    const allLoans = loans.data || [];
    const allPays = payments.data || [];
    const totalPrincipal = allLoans.filter((l) => l.decision === "approved").reduce((s, l) => s + Number(l.principal), 0);
    const totalPaid = allPays.reduce((s, p) => s + Number(p.amount), 0);
    v.innerHTML = `
      <h3 class="mb-3">Dashboard</h3>
      <div class="row g-3">
        ${dashCard("Maombi yanayosubiri", pending.count || 0, "inbox", "warning", "#/applications")}
        ${dashCard("Wateja", customers.count || 0, "people", "primary", "#/customers")}
        ${dashCard("Mikopo", allLoans.length, "cash-stack", "success", "#/loans")}
        ${dashCard("Malipo", allPays.length, "receipt", "info", "#/payments")}
      </div>
      <div class="row g-3 mt-1">
        <div class="col-md-6"><div class="card p-3"><div class="text-muted small">Jumla ya mikopo iliyoidhinishwa</div>
          <div class="fs-4 fw-bold">${tzs(totalPrincipal)}</div></div></div>
        <div class="col-md-6"><div class="card p-3"><div class="text-muted small">Jumla ya malipo yaliyokusanywa</div>
          <div class="fs-4 fw-bold">${tzs(totalPaid)}</div></div></div>
      </div>`;
  }

  function dashCard(label, val, icon, color, href) {
    return `<div class="col-6 col-lg-3"><a href="${href}" class="text-decoration-none">
      <div class="card p-3 h-100"><div class="d-flex justify-content-between align-items-center">
      <div><div class="text-muted small">${label}</div><div class="fs-3 fw-bold text-dark">${val}</div></div>
      <span class="stat-icon bg-${color} bg-opacity-10 text-${color}"><i class="bi bi-${icon}"></i></span>
      </div></div></a></div>`;
  }

  async function backupsView(v) {
    v.innerHTML = `<div class="spinner-wrap"><div class="spinner-border text-primary"></div></div>`;
    const tables = [
      ["customers", "Wateja"],
      ["profiles", "Profiles"],
      ["loans", "Mikopo"],
      ["payments", "Malipo"],
      ["agreements", "Mikataba"],
      ["audit", "Kumbukumbu"]
    ];
    const results = await Promise.all(tables.map(async ([t, label]) => {
      const { data, error, count } = await sb.from(t).select("*", { count: "exact" });
      return { t, label, rows: data || [], error, count: count == null ? (data || []).length : count };
    }));
    const ok = results.filter((r) => !r.error);
    results.filter((r) => r.error).forEach((r) => console.error(r.t, r.error));
    const day = tzDateKey();

    v.innerHTML = `
      <h3 class="mb-3">Nakala rudufu</h3>
      <div class="alert alert-info small">
        <i class="bi bi-download"></i> Pakua nakala ya data yote kwa JSON au CSV.
        Data yako huhifadhiwa kwa usalama na inaweza kupakuliwa na msimamizi pekee.
      </div>
      ${ok.length < results.length ? `<div class="alert alert-warning small">
        Baadhi ya majedwali hayakupatikana. Jaribu tena baadaye.</div>` : ""}
      <div class="card p-3 mb-3">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div><h6 class="mb-0">Nakala ya data yote (JSON)</h6>
            <div class="text-muted small">Inajumuisha majedwali yote yaliyopatikana.</div></div>
          <button class="btn btn-primary" id="downloadJson" ${ok.length ? "" : "disabled"}>
            <i class="bi bi-download"></i> Pakua JSON</button>
        </div>
      </div>
      <div class="card"><div class="table-responsive"><table class="table align-middle mb-0">
        <thead><tr><th>Jedwali</th><th>Rekodi</th><th>Hali</th><th class="text-end">Pakua</th></tr></thead>
        <tbody>${results.map((r) => `<tr>
          <td>${esc(r.label)} <code class="small">${esc(r.t)}</code></td>
          <td>${r.count}</td>
          <td>${r.error ? '<span class="text-danger small">Imeshindikana</span>' :
            '<span class="badge text-bg-success">Tayari</span>'}</td>
          <td class="text-end"><button class="btn btn-sm btn-outline-primary"
            data-csv="${esc(r.t)}" ${r.error || !r.rows.length ? "disabled" : ""}>CSV</button></td>
        </tr>`).join("")}</tbody>
      </table></div></div>`;

    const jsonBtn = document.getElementById("downloadJson");
    if (jsonBtn) jsonBtn.addEventListener("click", () => {
      const payload = { brand: CFG.BRAND, generated_at: new Date().toISOString(), tables: {} };
      ok.forEach((r) => { payload.tables[r.t] = r.rows; });
      downloadFile(`nakala-${day}.json`,
        JSON.stringify(payload, null, 2), "application/json");
    });
    v.querySelectorAll("[data-csv]").forEach((b) => b.addEventListener("click", () => {
      const r = ok.find((x) => x.t === b.dataset.csv);
      if (r) downloadCSV(`${r.t}-${day}.csv`, r.rows);
    }));
  }

  async function applicationsView(v) {
    v.innerHTML = `<div class="spinner-wrap"><div class="spinner-border text-primary"></div></div>`;
    const [loansRes, agrRes] = await Promise.all([
      sb.from("loans").select("*, customers(name, phone)").order("id", { ascending: false }),
      sb.from("agreements").select("loan_id, accepted, borrower_sign, signed_on")
    ]);
    if (loansRes.error) return errorView(v, loansRes.error);
    if (agrRes.error) return errorView(v, agrRes.error);
    const all = loansRes.data || [];
    const agrByLoan = new Map((agrRes.data || []).map((a) => [a.loan_id, a]));
    const filters = [
      ["all", "Zote", all.length],
      ["pending", "Zinasubiri", all.filter((l) => l.decision === "pending").length],
      ["approved", "Zimeidhinishwa", all.filter((l) => l.decision === "approved").length],
      ["rejected", "Zimekataliwa", all.filter((l) => l.decision === "rejected").length]
    ];
    const rows = all.length ? all.map((l) => {
      const name = l.customers ? l.customers.name : "";
      const phone = l.customers ? l.customers.phone : "";
      const ag = agrByLoan.get(l.id);
      const hasContract = !!(ag && ag.accepted && (ag.borrower_sign || "").trim());
      return `<div class="card p-3 mb-2">
        <div class="d-flex flex-wrap justify-content-between gap-2">
          <div>
            <b>${esc(name || "Mteja")}</b>
            <span class="text-muted">(${esc(phone || "-")})</span>
            <span class="badge ${badge(l.decision)}">${statusTxt(l.decision)}</span>
            <div class="small">Mkopo #${l.id} &middot; ${tzs(l.principal)} / miezi ${l.months}
              ${l.created_at ? " &middot; " + fmtDate(l.created_at) : ""}</div>
            <div class="small text-muted">${esc(l.purpose || "")}</div>
            <div class="small ${hasContract ? "text-success" : "text-warning"}">
              <i class="bi bi-file-earmark-text"></i>
              ${hasContract ? "Mkataba umejazwa" : "Mkataba haujajazwa"}
              ${ag && ag.signed_on ? ` &middot; ${fmtDate(ag.signed_on)}` : ""}</div>
            ${l.review_note ? `<div class="small text-danger">${l.decision === "pending" ? "Ujumbe" : "Sababu"}:
              ${esc(l.review_note)}</div>` : ""}
          </div>
          <div class="d-flex gap-2 align-items-center flex-wrap">
            ${l.decision === "pending" ? `
              <button class="btn btn-sm btn-success" data-approve="${l.id}">Idhinisha</button>
              <button class="btn btn-sm btn-outline-danger" data-reject="${l.id}">Kataa</button>
              <button class="btn btn-sm btn-outline-warning" data-revise="${l.id}">Rekebisha</button>` : ""}
            <a class="btn btn-sm btn-outline-primary" href="#/loan/${l.id}">Fungua</a>
          </div>
        </div></div>`;
    }).join("") :
      `<div class="card p-4 text-center text-muted">Hakuna maombi bado.</div>`;

    v.innerHTML = `<h3 class="mb-3">Maombi ya mikopo</h3>
      <div class="btn-group btn-group-sm mb-3 flex-wrap" role="group" id="applicationFilters">
        ${filters.map(([f, label, n]) => `<button class="btn btn-outline-primary"
          data-filter="${f}">${label} <span class="badge text-bg-light">${n}</span></button>`).join("")}
      </div>
      <div id="applicationList">${rows}</div>`;

    const setFilter = (f) => {
      v.querySelectorAll("#applicationFilters [data-filter]").forEach((b) =>
        b.classList.toggle("active", b.dataset.filter === f));
      v.querySelectorAll("#applicationList > .card").forEach((card, i) => {
        card.style.display = (f === "all" || all[i].decision === f) ? "" : "none";
      });
    };
    v.querySelectorAll("#applicationFilters [data-filter]").forEach((b) =>
      b.addEventListener("click", () => setFilter(b.dataset.filter)));
    setFilter("all");

    v.querySelectorAll("[data-approve]").forEach((b) =>
      b.addEventListener("click", () => approveDialog(v, +b.dataset.approve)));
    v.querySelectorAll("[data-reject]").forEach((b) =>
      b.addEventListener("click", () => rejectLoan(v, +b.dataset.reject, () => applicationsView(v))));
    v.querySelectorAll("[data-revise]").forEach((b) => b.addEventListener("click", async () => {
      const note = (prompt("Ujumbe kwa mteja: eleza sehemu zinazohitaji kurekebishwa:") || "").trim();
      if (!note) return;
      const { error } = await sb.rpc("request_loan_changes", {
        p_loan_id: +b.dataset.revise, p_note: note
      });
      if (error) return toast(error.message, "danger");
      toast("Ujumbe umetumwa kwa mteja.", "success");
      applicationsView(v);
    }));
  }

  async function approveDialog(v, lid, onDone) {
    const { data: loan } = await sb.from("loans").select("*").eq("id", lid).maybeSingle();
    if (!loan) return toast("Mkopo haupatikani.", "danger");
    const { data: agr } = await sb.from("agreements")
      .select("accepted, borrower_sign").eq("loan_id", lid).maybeSingle();
    const hasContract = !!(agr && agr.accepted && (agr.borrower_sign || "").trim());
    if (!hasContract && !confirm("Mkataba haujajazwa. Unaidhinisha ombi bila mkataba?")) return;
    const rate = prompt(`Riba (%/mwezi) kwa mkopo #${lid}:`, "12");
    if (rate === null) return;
    const rateNum = Number(String(rate).trim());
    if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 100)
      return toast("Riba iwe kati ya 0 na 100.", "danger");
    const startRaw = prompt("Tarehe ya kuanza (YYYY-MM-DD):", localDate());
    if (startRaw === null) return;
    const start = startRaw.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start))
      return toast("Tarehe si sahihi. Tumia mfano 2026-11-08.", "danger");
    const { error } = await sb.rpc("decide_loan", {
      p_loan_id: lid, p_action: "approve", p_rate: rateNum, p_months: loan.months, p_start: start, p_note: ""
    });
    if (error) return toast(error.message, "danger");
    toast("Ombi limeidhinishwa.", "success");
    if (onDone) onDone(); else applicationsView(v);
  }

  async function rejectLoan(v, lid, onDone) {
    const note = (prompt("Sababu ya kukataa (hiari):") || "").slice(0, 300);
    const { error } = await sb.rpc("decide_loan", {
      p_loan_id: lid, p_action: "reject",
      p_rate: null, p_months: null, p_start: null, p_note: note
    });
    if (error) return toast(error.message, "danger");
    toast("Ombi limekataliwa.", "warning");
    if (onDone) onDone(); else applicationsView(v);
  }

  async function customersView(v) {
    v.innerHTML = `<div class="spinner-wrap"><div class="spinner-border text-primary"></div></div>`;
    const { data, error } = await sb.from("customers").select("*").order("id", { ascending: false });
    if (error) return errorView(v, error);
    v.innerHTML = `<h3 class="mb-3">Wateja</h3>
      <div class="card"><div class="table-responsive"><table class="table align-middle mb-0">
        <thead><tr><th>#</th><th>Jina</th><th>Simu</th><th>Hali</th><th></th></tr></thead>
        <tbody>${(data || []).map((c) => `<tr>
          <td>${c.id}</td><td>${esc(c.name || "-")}</td><td>${esc(c.phone || "-")}</td>
          <td>${c.profile_done ? '<span class="badge text-bg-success">Kamili</span>' : '<span class="badge text-bg-secondary">Hajakamilisha</span>'}</td>
          <td><a class="btn btn-sm btn-outline-primary" href="#/customer/${c.id}">Fungua</a></td></tr>`).join("") ||
          `<tr><td colspan="5" class="text-center text-muted">Hakuna wateja.</td></tr>`}</tbody>
      </table></div></div>`;
  }

  async function customerDetailView(v, cid) {
    v.innerHTML = `<div class="spinner-wrap"><div class="spinner-border text-primary"></div></div>`;
    const { data: c, error: cErr } = await sb.from("customers").select("*").eq("id", cid).maybeSingle();
    if (cErr) return errorView(v, cErr);
    if (!c) { v.innerHTML = `<div class="alert alert-warning">Mteja hapatikani.</div>`; return; }
    const { data: loans, error: lErr } = await sb.from("loans").select("*").eq("customer_id", cid).order("id", { ascending: false });
    if (lErr) return errorView(v, lErr);
    v.innerHTML = `<a href="#/customers" class="text-decoration-none">&larr; Wateja</a>
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3 mb-3">
        <h3 class="mb-0">${esc(c.name || c.phone)}</h3>
        ${c.user_id ? `<button class="btn btn-outline-warning btn-sm" id="resetCustomerPassword">
          <i class="bi bi-key"></i> Weka upya password</button>` : ""}
      </div>
      <div class="card p-3 mb-3"><div class="row g-3 small">
        ${kv("Simu", c.phone)}${kv("Barua pepe", c.email)}${kv("Anwani", c.address)}${kv("Kazi", c.occupation)}
        ${kv("Mdhamini", c.guarantor_name)}${kv("Simu mdhamini", c.guarantor_phone)}
        ${kv("Benki", c.bank_name)}${kv("Akaunti", c.bank_account)}</div></div>
      <h6>Mikopo</h6>
      <div class="card"><div class="table-responsive"><table class="table mb-0">
        <thead><tr><th>#</th><th>Kiasi</th><th>Miezi</th><th>Hali</th><th></th></tr></thead>
        <tbody>${(loans || []).map((l) => `<tr><td>${l.id}</td><td>${tzs(l.principal)}</td><td>${l.months}</td>
          <td><span class="badge ${badge(l.decision)}">${statusTxt(l.decision)}</span></td>
          <td><a class="btn btn-sm btn-outline-primary" href="#/loan/${l.id}">Fungua</a></td></tr>`).join("") ||
          `<tr><td colspan="5" class="text-center text-muted">Hakuna mikopo.</td></tr>`}</tbody>
      </table></div></div>`;

    const resetBtn = document.getElementById("resetCustomerPassword");
    if (resetBtn) resetBtn.addEventListener("click", async () => {
      if (!confirm(`Weka upya password ya ${c.name || c.phone}?`)) return;
      resetBtn.disabled = true;
      const { data, error } = await sb.functions.invoke("admin-reset-password", {
        body: { customer_id: c.id }
      });
      resetBtn.disabled = false;
      if (error) return toast(await fnError(error, "Imeshindikana."), "danger");
      if (data && data.error) return toast(data.error, "danger");
      if (!data || !data.password) return toast("Password ya muda haikupatikana. Jaribu tena.", "danger");
      showTempPasswordModal({
        name: data.name || c.name,
        phone: c.phone,
        password: data.password,
        email: data.email || "",
        emailSent: !!data.email_sent,
        emailMessage: data.email_message || ""
      });
    });
  }

  function kv(k, val) {
    return `<div class="col-md-3"><div class="text-muted">${esc(k)}</div><div class="fw-semibold">${esc(val || "-")}</div></div>`;
  }

  async function loansView(v) {
    v.innerHTML = `<div class="spinner-wrap"><div class="spinner-border text-primary"></div></div>`;
    const { data, error } = await sb.from("loans").select("*, customers(name)").eq("decision", "approved").order("id", { ascending: false });
    if (error) return errorView(v, error);
    const rows = [];
    for (const l of data || []) {
      const b = buildLoan(l, await paymentsFor(l.id), today());
      rows.push(`<tr><td>${l.id}</td><td>${esc(l.customers ? l.customers.name : "")}</td>
        <td>${tzs(l.principal)}</td><td>${tzs(b.total)}</td><td>${tzs(b.balance)}</td>
        <td><span class="badge ${badge(b.status)}">${statusTxt(b.status)}</span></td>
        <td><a class="btn btn-sm btn-outline-primary" href="#/loan/${l.id}">Fungua</a></td></tr>`);
    }
    v.innerHTML = `<h3 class="mb-3">Mikopo iliyoidhinishwa</h3><div class="card"><div class="table-responsive">
      <table class="table align-middle mb-0"><thead><tr><th>#</th><th>Mteja</th><th>Kiasi</th>
      <th>Jumla</th><th>Lililobaki</th><th>Hali</th><th></th></tr></thead>
      <tbody>${rows.join("") || `<tr><td colspan="7" class="text-center text-muted">Hakuna mikopo.</td></tr>`}</tbody>
      </table></div></div>`;
  }

  async function paymentsView(v) {
    v.innerHTML = `<div class="spinner-wrap"><div class="spinner-border text-primary"></div></div>`;
    const { data, error } = await sb.from("payments").select("*, loans(customers(name))").order("id", { ascending: false }).limit(200);
    if (error) return errorView(v, error);
    v.innerHTML = `<h3 class="mb-3">Malipo</h3><div class="card"><div class="table-responsive">
      <table class="table align-middle mb-0"><thead><tr><th>#</th><th>Tarehe</th><th>Mteja</th>
      <th>Mkopo</th><th>Kiasi</th><th>Njia</th></tr></thead>
      <tbody>${(data || []).map((p) => `<tr><td>${p.id}</td><td>${fmtDate(p.paid_on)}</td>
        <td>${esc(p.loans && p.loans.customers ? p.loans.customers.name : "")}</td>
        <td>#${p.loan_id}</td><td>${tzs(p.amount)}</td><td>${esc(p.method)}</td></tr>`).join("") ||
        `<tr><td colspan="6" class="text-center text-muted">Hakuna malipo.</td></tr>`}</tbody>
      </table></div></div>`;
  }

  async function auditView(v) {
    v.innerHTML = `<div class="spinner-wrap"><div class="spinner-border text-primary"></div></div>`;
    const { data, error } = await sb.from("audit").select("*").order("id", { ascending: false }).limit(300);
    if (error) return errorView(v, error);
    v.innerHTML = `<h3 class="mb-3">Kumbukumbu</h3><div class="card"><div class="table-responsive">
      <table class="table table-sm align-middle mb-0"><thead><tr><th>#</th><th>Muda (EAT)</th><th>Mtumiaji</th>
      <th>Kitendo</th><th>Lengo</th><th>Maelezo</th></tr></thead>
      <tbody>${(data || []).map((a) => `<tr><td>${a.id}</td><td class="text-nowrap">${esc(fmtDateTime(a.created_at))}</td>
        <td>${esc(a.actor || "-")}</td><td><code>${esc(a.action)}</code></td>
        <td>${esc(a.target || "-")}</td><td>${esc(a.details || "-")}</td></tr>`).join("") ||
        `<tr><td colspan="6" class="text-center text-muted">Hakuna kumbukumbu.</td></tr>`}</tbody>
      </table></div></div>`;
  }

  boot();
})();

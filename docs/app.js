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
    $app.innerHTML = `<div class="container py-5"><div class="alert alert-danger">
      <h5>Config haijakamilika</h5>
      Weka <code>SUPABASE_URL</code> na <code>SUPABASE_ANON_KEY</code> kwenye
      <code>config.js</code>. Angalia README.</div></div>`;
    return;
  }

  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  const METHODS = CFG.METHODS || ["Cash"];
  const APP_VERSION = "2026.11.14";
  const PROJECT_REF = String(CFG.SUPABASE_URL || "").replace(/^https?:\/\//, "").split(".")[0];
  const LIVE_URL = "https://richardisaya522-arch.github.io/Loan-Management-System/";
  const RESET_REDIRECT = location.hostname.endsWith("github.io")
    ? LIVE_URL : location.origin + location.pathname;
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
  const fmtDate = (d) => {
    if (!d) return "-";
    const dt = (typeof d === "string") ? new Date(d.length <= 10 ? d + "T00:00:00" : d) : d;
    return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };
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

  let state = { user: null, profile: null, customer: null, route: "", recovery: RECOVERY_LINK };
  const today = () => new Date(new Date().toDateString());

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
    v.innerHTML = `<div class="alert alert-danger"><i class="bi bi-exclamation-triangle"></i>
      <b>Hitilafu:</b> ${esc(error && error.message ? error.message : error)}</div>`;
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
          loadProfile().then(() => {
            if (location.hash !== "#/reset-password") location.hash = "#/reset-password";
            render();
          });
        }
        return;
      }
      if (!s && !state.recovery) {
        state = { user: null, profile: null, customer: null, route: "", recovery: false };
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
            <div class="alert alert-light text-dark small mt-4 mb-0">
              <i class="bi bi-hdd-network"></i> Hii ndiyo <b>mfumo mmoja wa kati</b>.
              Taarifa zote zinahifadhiwa Supabase, hivyo unaona data ile ile kwenye simu,
              kompyuta au kifaa chochote.
            </div>
          </div>
          <p class="auth-sub small mb-0">&copy; ${new Date().getFullYear()} ${esc(CFG.BRAND)}</p>
        </div>
        <div class="col-lg-7 auth-form">
          <ul class="nav nav-pills mb-4" id="authTabs">
            <li class="nav-item"><button class="nav-link active" data-tab="login">Ingia</button></li>
            <li class="nav-item"><button class="nav-link" data-tab="register">Jisajili</button></li>
          </ul>
          <div id="authPane"></div>
          <div class="border-top mt-4 pt-3 d-flex flex-wrap gap-2 justify-content-between text-muted small">
            <span><i class="bi bi-database-check"></i> Data: Supabase · <code>${esc(PROJECT_REF)}</code></span>
            <span>Toleo ${esc(APP_VERSION)}</span>
          </div>
          <p class="text-muted small mb-0 mt-2">
            Tumia anwani hii pekee: <a href="${LIVE_URL}">${esc(LIVE_URL)}</a>.
            Toleo la Flask ni la ndani (localhost) tu na halishiriki data hii.
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
    $app.querySelector("#authPane").innerHTML = `
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
      const name = f.name.value.trim();
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
    <footer class="container pb-4 pt-2 d-flex flex-wrap gap-2 justify-content-between text-muted small border-top">
      <span><i class="bi bi-database-check"></i> Data moja: Supabase · <code>${esc(PROJECT_REF)}</code></span>
      <span>Toleo ${esc(APP_VERSION)} · <a href="${LIVE_URL}">Mfumo rasmi</a></span>
    </footer>`;
    document.getElementById("logoutBtn").addEventListener("click", async () => {
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
      cards += `<div class="col-md-6 col-xl-4"><div class="card h-100"><div class="card-body">
        <div class="d-flex justify-content-between"><span class="text-muted small">Mkopo #${l.id}</span>
        <span class="badge ${badge(b.status)}">${statusTxt(b.status)}</span></div>
        <div class="fs-4 fw-bold my-2">${tzs(l.principal)}</div>
        ${l.decision === "approved" ? `
          <div class="small text-muted">Deni lililobaki: <b>${tzs(b.balance)}</b> / ${tzs(b.total)}</div>
          <div class="progress my-2" style="height:6px"><div class="progress-bar" style="width:${Math.min(100, Math.round(b.paid / b.total * 100))}%"></div></div>` :
          `<div class="small text-muted">Hali: ${l.decision === "pending" ? "Inasubiri ukaguzi" : "Imekataliwa"}</div>`}
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

  async function applyView(v) {
    const c = state.customer;
    if (!c || !c.profile_done) {
      v.innerHTML = `<div class="alert alert-warning">Kamilisha <a href="#/profile">profile</a> kwanza.</div>`;
      return;
    }
    v.innerHTML = `
      <h3 class="mb-3">Omba mkopo</h3>
      <div class="card p-4" style="max-width:560px">
        <form id="applyForm">
          <div class="mb-3"><label class="form-label">Kiasi (TZS)</label>
            <input class="form-control form-control-lg" type="number" name="principal"
              min="${CFG.MIN_LOAN}" max="${CFG.MAX_LOAN}" placeholder="${CFG.MIN_LOAN}" required>
            <div class="form-text">Kati ya ${tzs(CFG.MIN_LOAN)} na ${tzs(CFG.MAX_LOAN)}.</div></div>
          <div class="mb-3"><label class="form-label">Muda (miezi)</label>
            <input class="form-control form-control-lg" type="number" name="months" min="1" max="${CFG.MAX_MONTHS}" placeholder="6" required></div>
          <div class="mb-3"><label class="form-label">Mkopo utatumika kwa nini?</label>
            <textarea class="form-control" name="purpose" maxlength="200" required></textarea></div>
          <button class="btn btn-success btn-lg w-100">Tuma ombi</button>
        </form>
      </div>`;
    document.getElementById("applyForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const { error } = await sb.rpc("apply_loan", {
        p_principal: +f.principal.value, p_months: +f.months.value, p_purpose: f.purpose.value.trim()
      });
      if (error) return toast(error.message, "danger");
      toast("Ombi lako limepokelewa. Utajulishwa uamuzi ukitolewa.", "success");
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
      const name = f.name.value.trim();
      if (name.split(/\s+/).length < 3) return toast("Andika majina matatu kamili.", "danger");
      if (!validPhone(f.phone.value)) return toast("Namba yako ya simu si sahihi.", "danger");
      if (!validPhone(f.guarantor_phone.value)) return toast("Simu ya mdhamini si sahihi.", "danger");
      if (normPhone(f.guarantor_phone.value) === normPhone(f.phone.value))
        return toast("Mdhamini asimame na namba yako mwenyewe.", "danger");
      const { error } = await sb.rpc("save_profile", {
        p_name: name, p_phone: normPhone(f.phone.value), p_email: f.email.value.trim(),
        p_address: f.address.value.trim(), p_occupation: f.occupation.value.trim(),
        p_guarantor_name: f.guarantor_name.value.trim(),
        p_guarantor_phone: normPhone(f.guarantor_phone.value),
        p_guarantor_address: f.guarantor_address.value.trim(),
        p_bank_name: f.bank_name.value.trim(), p_bank_account: f.bank_account.value.trim()
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
    const { data: loan, error: loanErr } = await sb.from("loans").select("*").eq("id", lid).maybeSingle();
    if (loanErr) return errorView(v, loanErr);
    if (!loan) { v.innerHTML = `<div class="alert alert-warning">Mkopo haupatikani.</div>`; return; }
    const pays = await paymentsFor(lid);
    const { data: agr, error: agrErr } = await sb.from("agreements").select("*").eq("loan_id", lid).maybeSingle();
    if (agrErr) return errorView(v, agrErr);
    const b = buildLoan(loan, pays, today());
    const contractDone = !!(agr && agr.accepted && (agr.lender_sign || "").trim());

    let payForm = "";
    if (isAdmin && loan.decision === "approved" && b.balance > 0) {
      payForm = contractDone ? `
        <div class="card p-3 mb-3"><h6>Rekodi malipo</h6>
        <form id="payForm" class="row g-2">
          <div class="col-6"><input class="form-control" type="number" min="1" max="${b.balance}" name="amount" placeholder="Kiasi" required></div>
          <div class="col-6"><input class="form-control" type="date" name="paid_on" value="${new Date().toISOString().slice(0, 10)}" required></div>
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
            <div class="col-md-4"><input class="form-control" name="sign" placeholder="Jina/sahihi yako" maxlength="80" required></div>
            <div class="col-md-4"><input class="form-control" name="witness" placeholder="Shahidi" maxlength="80" required></div>
            <div class="col-md-4"><input class="form-control" name="place" placeholder="Mahali" maxlength="120" required></div>
            <div class="col-12"><button class="btn btn-primary">Hifadhi saini</button></div>
          </form></div>`;
      }
      if (isAdmin && (!agr || !(agr.lender_sign || "").trim())) {
        signBlock += `<div class="card p-3 mb-3"><h6><i class="bi bi-pen"></i> Saini ya mkopeshaji</h6>
          <form id="signLender" class="row g-2">
            <div class="col-md-6"><input class="form-control" name="witness" placeholder="Shahidi wa mkopeshaji" maxlength="80" required></div>
            <div class="col-md-6"><input class="form-control" name="sign" placeholder="Andika jina la mkopeshaji" maxlength="80" required></div>
            <div class="col-12"><button class="btn btn-warning">Hifadhi saini ya mkopeshaji</button></div>
          </form></div>`;
      }
    }

    v.innerHTML = `
      <a href="#/" class="text-decoration-none">&larr; Rudi</a>
      <div class="d-flex justify-content-between align-items-center my-3">
        <h3 class="mb-0">Mkopo #${loan.id}
          <span class="badge ${badge(loan.decision === "approved" ? b.status : loan.decision)}">
            ${statusTxt(loan.decision === "approved" ? b.status : loan.decision)}</span></h3>
        ${loan.decision === "approved" && contractDone ? `<button class="btn btn-outline-secondary btn-sm" id="printLoanBtn"><i class="bi bi-printer"></i> Chapisha</button>` : ""}
      </div>
      ${loan.decision === "rejected" ? `<div class="alert alert-danger">Ombi limekataliwa. ${esc(loan.review_note || "")}</div>` : ""}
      ${loan.decision === "pending" ? `<div class="alert alert-info">Ombi linasubiri ukaguzi wa ofisi.</div>` : ""}
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
      <div class="row g-3">
        <div class="col-lg-7"><div class="card p-3"><h6>Ratiba ya malipo</h6>
          <div class="table-responsive"><table class="table table-sm align-middle mb-0">
            <thead><tr><th>#</th><th>Tarehe</th><th>Kiasi</th><th>Kimelipwa</th><th>Hali</th></tr></thead>
            <tbody>${rows}</tbody></table></div></div></div>
        <div class="col-lg-5">${payForm}
          <div class="card p-3"><h6>Historia ya malipo</h6>
            <table class="table table-sm mb-0"><thead><tr><th>Tarehe</th><th>Kiasi</th><th>Njia</th><th>Maelezo</th></tr></thead>
            <tbody>${payRows}</tbody></table></div></div>
      </div>`;

    const pb = document.getElementById("printLoanBtn");
    if (pb) pb.addEventListener("click", () => window.print());

    const pf = document.getElementById("payForm");
    if (pf) pf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const { error } = await sb.rpc("record_payment", {
        p_loan_id: lid, p_amount: +f.amount.value, p_paid_on: f.paid_on.value,
        p_method: f.method.value, p_note: f.note.value.trim()
      });
      if (error) return toast(error.message, "danger");
      toast("Malipo yamerekodiwa.", "success"); loanDetailView(v, lid);
    });
    const sb1 = document.getElementById("signBorrower");
    if (sb1) sb1.addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target;
      const { error } = await sb.rpc("sign_borrower", { p_loan_id: lid, p_sign: f.sign.value.trim(),
        p_witness: f.witness.value.trim(), p_place: f.place.value.trim() });
      if (error) return toast(error.message, "danger");
      toast("Mkataba umesainiwa.", "success"); loanDetailView(v, lid);
    });
    const sl = document.getElementById("signLender");
    if (sl) sl.addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target;
      const { error } = await sb.rpc("sign_lender", { p_loan_id: lid, p_sign: f.sign.value.trim(),
        p_witness: f.witness.value.trim() });
      if (error) return toast(error.message, "danger");
      toast("Saini ya mkopeshaji imehifadhiwa.", "success"); loanDetailView(v, lid);
    });
  }

  function stat(label, val) {
    return `<div class="col-6 col-md-4 col-lg-2"><div class="card p-3 h-100">
      <div class="text-muted small">${esc(label)}</div><div class="fw-bold">${val}</div></div></div>`;
  }

  // ================= ADMIN =================
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
    const ref = String(CFG.SUPABASE_URL || "").replace(/^https?:\/\//, "").split(".")[0];
    const day = new Date().toISOString().slice(0, 10);

    v.innerHTML = `
      <h3 class="mb-3">Nakala rudufu</h3>
      <div class="alert alert-info small">
        <i class="bi bi-cloud-check"></i> Supabase hifadhi nakala za database kila siku.
        <a href="https://supabase.com/dashboard/project/${esc(ref)}/database/backups"
          target="_blank" rel="noopener">Fungua nakala za Supabase</a>.
        Hapa unaweza pia kupakua nakala ya data yote kwa JSON au CSV.
      </div>
      ${ok.length < results.length ? `<div class="alert alert-warning small">
        Baadhi ya majedwali hayakupatikana. Angalia hitilafu kwenye orodha hapa chini.</div>` : ""}
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
          <td>${r.error ? `<span class="text-danger small">${esc(r.error.message)}</span>` :
            '<span class="badge text-bg-success">Tayari</span>'}</td>
          <td class="text-end"><button class="btn btn-sm btn-outline-primary"
            data-csv="${esc(r.t)}" ${r.error || !r.rows.length ? "disabled" : ""}>CSV</button></td>
        </tr>`).join("")}</tbody>
      </table></div></div>`;

    const jsonBtn = document.getElementById("downloadJson");
    if (jsonBtn) jsonBtn.addEventListener("click", () => {
      const payload = { brand: CFG.BRAND, project: ref,
        generated_at: new Date().toISOString(), tables: {} };
      ok.forEach((r) => { payload.tables[r.t] = r.rows; });
      downloadFile(`nakala-${ref}-${day}.json`,
        JSON.stringify(payload, null, 2), "application/json");
    });
    v.querySelectorAll("[data-csv]").forEach((b) => b.addEventListener("click", () => {
      const r = ok.find((x) => x.t === b.dataset.csv);
      if (r) downloadCSV(`${r.t}-${day}.csv`, r.rows);
    }));
  }

  async function applicationsView(v) {
    v.innerHTML = `<div class="spinner-wrap"><div class="spinner-border text-primary"></div></div>`;
    const { data, error } = await sb.from("loans")
      .select("*, customers(name, phone)")
      .order("id", { ascending: false });
    if (error) return errorView(v, error);
    const all = data || [];
    const filters = [
      ["all", "Zote", all.length],
      ["pending", "Zinasubiri", all.filter((l) => l.decision === "pending").length],
      ["approved", "Zimeidhinishwa", all.filter((l) => l.decision === "approved").length],
      ["rejected", "Zimekataliwa", all.filter((l) => l.decision === "rejected").length]
    ];
    const rows = all.length ? all.map((l) => {
      const name = l.customers ? l.customers.name : "";
      const phone = l.customers ? l.customers.phone : "";
      return `<div class="card p-3 mb-2">
        <div class="d-flex flex-wrap justify-content-between gap-2">
          <div>
            <b>${esc(name || "Mteja")}</b>
            <span class="text-muted">(${esc(phone || "-")})</span>
            <span class="badge ${badge(l.decision)}">${statusTxt(l.decision)}</span>
            <div class="small">Mkopo #${l.id} &middot; ${tzs(l.principal)} / miezi ${l.months}
              ${l.created_at ? " &middot; " + fmtDate(l.created_at) : ""}</div>
            <div class="small text-muted">${esc(l.purpose || "")}</div>
            ${l.review_note ? `<div class="small text-danger">Sababu: ${esc(l.review_note)}</div>` : ""}
          </div>
          <div class="d-flex gap-2 align-items-center flex-wrap">
            ${l.decision === "pending" ? `
              <button class="btn btn-sm btn-success" data-approve="${l.id}">Idhinisha</button>
              <button class="btn btn-sm btn-outline-danger" data-reject="${l.id}">Kataa</button>` : ""}
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
    v.querySelectorAll("[data-reject]").forEach((b) => b.addEventListener("click", async () => {
      const note = (prompt("Sababu ya kukataa (hiari):") || "").slice(0, 300);
      const { error } = await sb.rpc("decide_loan", {
        p_loan_id: +b.dataset.reject, p_action: "reject",
        p_rate: null, p_months: null, p_start: null, p_note: note
      });
      if (error) return toast(error.message, "danger");
      toast("Ombi limekataliwa.", "warning");
      applicationsView(v);
    }));
  }

  async function approveDialog(v, lid) {
    const { data: loan } = await sb.from("loans").select("*").eq("id", lid).maybeSingle();
    if (!loan) return toast("Mkopo haupatikani.", "danger");
    const rate = prompt(`Riba (%/mwezi) kwa mkopo #${lid}:`, "12");
    if (rate === null) return;
    const rateNum = Number(String(rate).trim());
    if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 100)
      return toast("Riba iwe kati ya 0 na 100.", "danger");
    const startRaw = prompt("Tarehe ya kuanza (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
    if (startRaw === null) return;
    const start = startRaw.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start))
      return toast("Tarehe si sahihi. Tumia mfano 2026-11-08.", "danger");
    const { error } = await sb.rpc("decide_loan", {
      p_loan_id: lid, p_action: "approve", p_rate: rateNum, p_months: loan.months, p_start: start, p_note: ""
    });
    if (error) return toast(error.message, "danger");
    toast("Ombi limeidhinishwa.", "success"); applicationsView(v);
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
      if (error) {
        const msg = error.context?.error || error.message || "Imeshindikana.";
        return toast(msg, "danger");
      }
      if (data && data.error) return toast(data.error, "danger");
      alert(`Password ya muda kwa ${data.name || c.phone}: ${data.password}\n\nMteja abadilishe mara ya kwanza.`);
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
      <table class="table table-sm align-middle mb-0"><thead><tr><th>#</th><th>Muda</th><th>Mtumiaji</th>
      <th>Kitendo</th><th>Lengo</th><th>Maelezo</th></tr></thead>
      <tbody>${(data || []).map((a) => `<tr><td>${a.id}</td><td class="text-nowrap">${esc(a.created_at)}</td>
        <td>${esc(a.actor || "-")}</td><td><code>${esc(a.action)}</code></td>
        <td>${esc(a.target || "-")}</td><td>${esc(a.details || "-")}</td></tr>`).join("") ||
        `<tr><td colspan="6" class="text-center text-muted">Hakuna kumbukumbu.</td></tr>`}</tbody>
      </table></div></div>`;
  }

  boot();
})();

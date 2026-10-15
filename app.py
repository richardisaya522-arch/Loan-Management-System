"""ANTHONY MICROFINANCE - LOAN MANAGEMENT SYSTEM (Flask + SQLite).

Mfumo wa kukopesha wenye usajili wa waombaji."""
import calendar
import os
import re
import secrets
import sqlite3
import time
from collections import Counter, defaultdict
from datetime import date
from functools import wraps

from flask import (Flask, abort, flash, g, redirect, render_template,
                   request, session, url_for)
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)


def _secret_key():
    # Key ya kudumu ili session/CSRF zisiharibike kila server inapowashwa upya.
    # Kwenye production weka SECRET_KEY kama environment variable.
    env = os.environ.get("SECRET_KEY")
    if env:
        return env
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".secret_key")
    if os.path.exists(path):
        with open(path) as fh:
            saved = fh.read().strip()
        if saved:
            return saved
    new = secrets.token_hex(32)
    with open(path, "w") as fh:
        fh.write(new)
    return new


app.secret_key = _secret_key()
app.config.update(SESSION_COOKIE_SAMESITE="Lax", SESSION_COOKIE_HTTPONLY=True)
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "loans.db")
BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backups")
BACKUP_KEEP = 14   # idadi ya nakala za hivi karibuni za kubakiza
METHODS = ["Cash", "M-Pesa", "Tigo Pesa", "Airtel Money", "Benki"]
MIN_LOAN, MAX_LOAN, MAX_MONTHS = 50_000, 2_000_000, 24   # mipaka ya maombi ya wateja
MAX_ACTIVE_LOANS = 2   # idadi ya juu ya mikopo inayoendelea (haijalipwa) kwa mteja
LENDER = "ANTHONY MICROFINANCE"   # ndiye MKOPESHAJI kwenye mkataba

# Pesa = namba kamili (TZS), si desimali.
SCHEMA = """
CREATE TABLE IF NOT EXISTS customers(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL,
  email TEXT, id_number TEXT, address TEXT, occupation TEXT,
  guarantor_name TEXT, guarantor_phone TEXT,
  guarantor_id_number TEXT, guarantor_address TEXT,
  bank_name TEXT, bank_account TEXT,
  profile_done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','customer')),
  customer_id INTEGER REFERENCES customers(id));
CREATE TABLE IF NOT EXISTS loans(
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  principal INTEGER NOT NULL CHECK(principal > 0),
  rate REAL NOT NULL CHECK(rate >= 0),
  months INTEGER NOT NULL CHECK(months BETWEEN 1 AND 60),
  start_date TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'approved' CHECK(decision IN ('pending','approved','rejected')),
  purpose TEXT, review_note TEXT,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY,
  loan_id INTEGER NOT NULL REFERENCES loans(id),
  amount INTEGER NOT NULL CHECK(amount > 0),
  paid_on TEXT NOT NULL, method TEXT NOT NULL, note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS agreements(
  id INTEGER PRIMARY KEY,
  loan_id INTEGER NOT NULL UNIQUE REFERENCES loans(id),
  place TEXT, signed_on TEXT, purpose TEXT,
  principal INTEGER, interest INTEGER, total INTEGER, period_months INTEGER, repay_by TEXT,
  borrower TEXT, borrower_witness TEXT, borrower_sign TEXT,
  lender TEXT, lender_witness TEXT, lender_sign TEXT,
  guarantor TEXT, guarantor_phone TEXT, guarantor_sign TEXT, guarantor_witness TEXT,
  accepted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit(
  id INTEGER PRIMARY KEY, actor TEXT, action TEXT NOT NULL,
  target TEXT, details TEXT, ip TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')));
"""
MIGRATIONS = {  # kwa database ya zamani isiyo na safu hizi
    "customers": [("email", "TEXT"), ("profile_done", "INTEGER NOT NULL DEFAULT 0"),
                  ("occupation", "TEXT"), ("guarantor_name", "TEXT"),
                  ("guarantor_phone", "TEXT"), ("guarantor_id_number", "TEXT"),
                  ("guarantor_address", "TEXT"),
                  ("bank_name", "TEXT"), ("bank_account", "TEXT")],
    "users": [("role", "TEXT NOT NULL DEFAULT 'admin'"), ("customer_id", "INTEGER")],
    "loans": [("decision", "TEXT NOT NULL DEFAULT 'approved'"), ("purpose", "TEXT"),
              ("review_note", "TEXT"), ("applied_at", "TEXT")],
    "agreements": [("guarantor", "TEXT"), ("guarantor_phone", "TEXT"),
                   ("guarantor_sign", "TEXT"), ("guarantor_witness", "TEXT")],
}
LOAN_SQL = """
SELECT l.*, c.name AS customer, c.phone,
  c.guarantor_name AS guarantor_name, c.guarantor_phone AS guarantor_phone,
  COALESCE((SELECT SUM(amount) FROM payments p WHERE p.loan_id = l.id), 0) AS paid
FROM loans l JOIN customers c ON c.id = l.customer_id"""
APPROVED = " WHERE l.decision = 'approved'"


# ---------- Database ----------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH, timeout=10)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
        g.db.execute("PRAGMA journal_mode = WAL")     # wasomaji/wandishi sambamba
        g.db.execute("PRAGMA busy_timeout = 5000")    # subiri badala ya 'database is locked'
        g.db.execute("PRAGMA synchronous = NORMAL")
    return g.db


@app.teardown_appcontext
def close_db(_):
    db = g.pop("db", None)
    if db:
        db.close()


def backup_db(force=False):
    """Tengeneza nakala ya loans.db. Rudi jina la faili, au None kama imerukwa.

    Hufanya backup moja kwa siku; tumia force=True kwa backup ya mkono.
    """
    if not os.path.exists(DB_PATH):
        return None
    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = time.strftime("%Y-%m-%d_%H%M%S")
    today = time.strftime("%Y-%m-%d")
    if not force and any(f.startswith(f"loans_{today}") for f in os.listdir(BACKUP_DIR)):
        return None
    dest = os.path.join(BACKUP_DIR, f"loans_{stamp}.db")
    src, dst = sqlite3.connect(DB_PATH), sqlite3.connect(dest)
    with dst:
        src.backup(dst)          # backup salama hata database inatumika
    src.close()
    dst.close()
    backups = sorted(f for f in os.listdir(BACKUP_DIR) if f.startswith("loans_") and f.endswith(".db"))
    for old in backups[:-BACKUP_KEEP]:   # futa za zamani
        os.remove(os.path.join(BACKUP_DIR, old))
    return dest


def list_backups():
    if not os.path.isdir(BACKUP_DIR):
        return []
    files = [f for f in os.listdir(BACKUP_DIR)
             if f.startswith("loans_") and f.endswith(".db")]
    return sorted(files, key=lambda f: os.path.getmtime(os.path.join(BACKUP_DIR, f)),
                  reverse=True)


def restore_db(name):
    """Rudisha database kutoka nakala. Rudi True kama imefanikiwa."""
    safe = os.path.basename(name)
    path = os.path.join(BACKUP_DIR, safe)
    if safe != name or not safe.startswith("loans_") or not safe.endswith(".db") \
            or not os.path.isfile(path):
        return False
    backup_db(force=True)          # hifadhi hali ya sasa kabla ya kurudisha
    src, dst = sqlite3.connect(path), sqlite3.connect(DB_PATH)
    with dst:
        src.backup(dst)
    src.close()
    dst.close()
    return True


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA journal_mode = WAL")
    db.execute("PRAGMA busy_timeout = 5000")
    db.executescript(SCHEMA)
    for table, cols in MIGRATIONS.items():
        have = {r[1] for r in db.execute(f"PRAGMA table_info({table})")}
        for name, ddl in cols:
            if name not in have:
                db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
    db.executescript("""CREATE INDEX IF NOT EXISTS idx_loans_customer ON loans(customer_id);
        CREATE INDEX IF NOT EXISTS idx_loans_decision ON loans(decision);
        CREATE INDEX IF NOT EXISTS idx_pay_loan ON payments(loan_id);
        CREATE INDEX IF NOT EXISTS idx_agr_loan ON agreements(loan_id);""")
    if not db.execute("SELECT 1 FROM users WHERE role='admin'").fetchone():
        pw = os.environ.get("ADMIN_PASSWORD", "admin123")
        db.execute("INSERT INTO users(username, password_hash, role) VALUES('admin',?, 'admin')",
                   (generate_password_hash(pw),))
        print("Akaunti ya kwanza: admin /", pw, "- ibadilishe!")
    db.execute("UPDATE payments SET method='Cash' WHERE method='Taslimu'")   # rudisha hali ya awali
    db.commit()
    db.close()
    backup_db()   # nakala moja kwa siku kila server inapowaka


# ---------- Hesabu za mkopo (flat rate, malipo ya kila mwezi) ----------
def add_months(d, n):
    y, m = divmod(d.month - 1 + n, 12)
    year, month = d.year + y, m + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def calc(principal, rate, months):
    interest = round(principal * rate / 100 * months)
    total = principal + interest
    return interest, total, round(total / months)


def build(loan, today):
    interest, total, inst = calc(loan["principal"], loan["rate"], loan["months"])
    start = date.fromisoformat(loan["start_date"])
    paid, left, rows = loan["paid"], loan["paid"], []
    for n in range(1, loan["months"] + 1):
        amt = inst if n < loan["months"] else total - inst * (loan["months"] - 1)
        due = add_months(start, n)
        got = min(left, amt)
        left -= got
        st = ("paid" if got >= amt else "overdue" if due < today else
              "partial" if got > 0 else "pending")
        rows.append(dict(no=n, due=due, amount=amt, paid=got, status=st))
    balance = total - paid
    status = ("completed" if balance <= 0 else
              "overdue" if any(r["status"] == "overdue" for r in rows) else "active")
    return dict(dict(loan), interest=interest, total=total, installment=inst,
                balance=balance, status=status, rows=rows,
                next_due=next((r for r in rows if r["status"] != "paid"), None),
                overdue_amount=sum(r["amount"] - r["paid"] for r in rows if r["status"] == "overdue"))


# ---------- Usalama ----------
def csrf():
    if "csrf" not in session:
        session["csrf"] = secrets.token_hex(16)
    return session["csrf"]


app.jinja_env.globals["csrf"] = csrf
app.jinja_env.filters["tzs"] = lambda v: "TZS {:,}".format(int(v or 0))


@app.context_processor
def inject():
    n = 0
    if session.get("role") == "admin":
        n = get_db().execute("SELECT COUNT(*) FROM loans WHERE decision='pending'").fetchone()[0]
    return dict(pending_count=n)


@app.before_request
def csrf_protect():
    if request.method == "POST":
        sent, expected = request.form.get("csrf", ""), session.get("csrf", "")
        if not expected or not secrets.compare_digest(sent, expected):
            abort(400)


@app.errorhandler(400)
def bad_request(_):
    flash("Kipindi chako kimeisha au ukurasa umepitwa na wakati. Tafadhali ingia tena.",
          "warning")
    return redirect(url_for("login")), 303


def role_required(role):
    def deco(f):
        @wraps(f)
        def wrapper(*a, **kw):
            if "user" not in session:
                return redirect(url_for("login"))
            if session.get("role") != role:
                flash("Huna ruhusa ya kufungua ukurasa huo.", "warning")
                return redirect(url_for("dashboard"))
            return f(*a, **kw)
        return wrapper
    return deco


admin_required, customer_required = role_required("admin"), role_required("customer")


def login_required(f):
    @wraps(f)
    def wrapper(*a, **kw):
        if "user" not in session:
            return redirect(url_for("login"))
        return f(*a, **kw)
    return wrapper


def norm_phone(p):
    p = re.sub(r"[\s-]", "", p or "")
    return "0" + p[4:] if p.startswith("+255") else p


def valid_phone(p):
    return bool(re.fullmatch(r"0[67]\d{8}", p))


def to_int(value):
    try:
        return int(str(value).replace(",", "").strip())
    except ValueError:
        return None


def to_date(value):
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return None


FAILS = defaultdict(list)   # kuzuia kubashiri password: majaribio 5 kwa dakika 5


def throttled(key):
    now = time.time()
    FAILS[key] = [t for t in FAILS[key] if now - t < 300]
    return len(FAILS[key]) >= 5


def audit(action, target="", details=""):
    """Rekodi kitendo kwenye kumbukumbu (audit trail) kwa ajili ya ufuatiliaji."""
    try:
        db = get_db()
        db.execute("INSERT INTO audit(actor, action, target, details, ip) VALUES(?,?,?,?,?)",
                   (session.get("user", "-"), action, target, details, request.remote_addr))
        db.commit()
    except Exception:
        pass   # kumbukumbu isizuie kitendo kikuu


# ---------- Usajili na login ----------
@app.route("/register", methods=["GET", "POST"])
def register():
    if "user" in session:
        return redirect(url_for("dashboard"))
    e = {}
    if request.method == "POST":
        f = request.form
        name, phone = f.get("name", "").strip(), norm_phone(f.get("phone", ""))
        email = f.get("email", "").strip()
        pw, pw2 = f.get("password", ""), f.get("password2", "")
        if len(name) < 3:
            e["name"] = "Jina kamili liwe angalau herufi 3."
        if not valid_phone(phone):
            e["phone"] = "Namba ya simu si sahihi. Mfano: 0712345678"
        if email and not re.fullmatch(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", email):
            e["email"] = "Barua pepe si sahihi. Mfano: jina@mfano.com"
        if len(pw) < 8:
            e["password"] = "Password iwe angalau herufi 8."
        if pw != pw2:
            e["password2"] = "Password mbili hazifanani."
        if not f.get("consent"):
            e["consent"] = "Thibitisha kuwa taarifa ulizoweka ni sahihi."
        if not e:
            db = get_db()
            if (db.execute("SELECT 1 FROM users WHERE username=?", (phone,)).fetchone() or
                    db.execute("SELECT 1 FROM customers WHERE phone=?", (phone,)).fetchone()):
                e["phone"] = "Namba hii tayari imesajiliwa. Ingia, au wasiliana na ofisi."
            else:
                cur = db.execute("INSERT INTO customers(name, phone, email) VALUES(?,?,?)",
                                 (name, phone, email))
                db.execute("INSERT INTO users(username, password_hash, role, customer_id) VALUES(?,?, 'customer', ?)",
                           (phone, generate_password_hash(pw), cur.lastrowid))
                db.commit()
                audit("customer.register", f"customer#{cur.lastrowid}", name)
                flash("Umejisajili kikamilifu. Sasa ingia kuomba mkopo.", "success")
                return redirect(url_for("login"))
    else:
        f = {"phone": session.pop("signup_phone", "")}
    return render_template("register.html", f=f, e=e)


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        ident = request.form.get("username", "").strip()
        ident = norm_phone(ident) if re.match(r"[+\d]", ident) else ident
        key = f"{request.remote_addr}|{ident.lower()}"
        if throttled(key):
            flash("Majaribio mengi yasiyo sahihi. Subiri dakika 5 ujaribu tena.", "danger")
            return render_template("login.html")
        u = get_db().execute("SELECT * FROM users WHERE username=?", (ident,)).fetchone()
        if u is None and re.match(r"[+\d]", ident):
            session["signup_phone"] = ident      # mteja lazima ajisajili kwanza
            flash("Namba hii haijasajiliwa bado. Jisajili kwanza ili kuweka ombi lako.", "warning")
            return redirect(url_for("register"))
        if u and check_password_hash(u["password_hash"], request.form.get("password", "")):
            session.clear()
            session.update(user=u["username"], role=u["role"], customer_id=u["customer_id"])
            audit("login", f"user:{u['username']}", f"role={u['role']}")
            if u["role"] == "customer":
                c = get_db().execute("SELECT profile_done FROM customers WHERE id=?",
                                     (u["customer_id"],)).fetchone()
                if c is not None and not c["profile_done"]:
                    flash("Hakiki taarifa zako kwanza, kisha uende kuomba mkopo.", "info")
                    return redirect(url_for("profile"))
            return redirect(url_for("dashboard"))
        FAILS[key].append(time.time())
        flash("Jina/simu au password si sahihi.", "danger")
    return render_template("login.html")


@app.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/password", methods=["GET", "POST"])
@login_required
def change_password():
    e = {}
    if request.method == "POST":
        cur = request.form.get("password", "")
        new = request.form.get("password_new", "")
        new2 = request.form.get("password_new2", "")
        db = get_db()
        u = db.execute("SELECT * FROM users WHERE username=?", (session["user"],)).fetchone()
        if u is None or not check_password_hash(u["password_hash"], cur):
            e["password"] = "Password ya sasa si sahihi."
        if len(new) < 8:
            e["password_new"] = "Password mpya iwe angalau herufi 8."
        elif new != new2:
            e["password_new2"] = "Password mbili hazifanani."
        if not e:
            db.execute("UPDATE users SET password_hash=? WHERE id=?",
                       (generate_password_hash(new), u["id"]))
            db.commit()
            flash("Password yako imebadilishwa kwa mafanikio.", "success")
            return redirect(url_for("dashboard" if session["role"] == "admin" else "me"))
        flash("Hakikisha taarifa za password ni sahihi.", "danger")
    return render_template("password.html", e=e)


# ---------- Nimesahau password (mteja anajithibitisha) ----------
@app.route("/forgot", methods=["GET", "POST"])
def forgot():
    if "user" in session:
        return redirect(url_for("dashboard"))
    e, f = {}, {"phone": "", "name": ""}
    key = f"forgot|{request.remote_addr}"
    if request.method == "POST":
        if throttled(key):
            flash("Majaribio mengi. Subiri dakika 5 ujaribu tena.", "danger")
            return render_template("forgot.html", e=e, f=request.form)
        f = {"phone": norm_phone(request.form.get("phone", "")),
             "name": request.form.get("name", "").strip()}
        new, new2 = request.form.get("password", ""), request.form.get("password2", "")
        if not valid_phone(f["phone"]):
            e["phone"] = "Namba ya simu si sahihi. Mfano: 0712345678"
        if len(f["name"].split()) < 3:
            e["name"] = "Andika majina matatu kamili kama yalivyo kwenye profile yako."
        if len(new) < 8:
            e["password"] = "Password mpya iwe angalau herufi 8."
        elif new != new2:
            e["password2"] = "Password mbili hazifanani."
        if not e:
            db = get_db()
            u = db.execute("SELECT * FROM users WHERE username=? AND role='customer'",
                           (f["phone"],)).fetchone()
            c = db.execute("SELECT * FROM customers WHERE id=?",
                           (u["customer_id"],)).fetchone() if u else None
            ok = (c is not None
                  and (c["name"] or "").strip().lower() == f["name"].lower())
            if ok:
                db.execute("UPDATE users SET password_hash=? WHERE id=?",
                           (generate_password_hash(new), u["id"]))
                db.commit()
                FAILS.pop(key, None)
                flash("Password yako imebadilishwa. Sasa ingia kwa password mpya.", "success")
                return redirect(url_for("login"))
            FAILS[key].append(time.time())
            flash("Taarifa ulizoweka hazilingani na kumbukumbu zetu. Hakikisha jina lako "
                  "ni kama kwenye profile yako, au wasiliana na ofisi.", "danger")
        return render_template("forgot.html", e=e, f=f)
    return render_template("forgot.html", e=e, f=f)


# ---------- Dashboard (admin) / Akaunti yangu (mteja) ----------
@app.route("/")
@login_required
def dashboard():
    if session["role"] == "customer":
        return redirect(url_for("me"))
    db, today = get_db(), date.today()
    loans = [build(dict(r), today) for r in db.execute(LOAN_SQL + APPROVED)]
    counts = Counter(l["status"] for l in loans)
    stats = dict(
        customers=db.execute("SELECT COUNT(*) FROM customers").fetchone()[0],
        loans=len(loans), active=counts["active"], overdue=counts["overdue"],
        completed=counts["completed"],
        pending=db.execute("SELECT COUNT(*) FROM loans WHERE decision='pending'").fetchone()[0],
        disbursed=sum(l["principal"] for l in loans), collected=sum(l["paid"] for l in loans),
        outstanding=sum(l["balance"] for l in loans), interest=sum(l["interest"] for l in loans))
    months = db.execute("""SELECT strftime('%Y-%m', paid_on) m, SUM(amount) s FROM payments
                           GROUP BY m ORDER BY m DESC LIMIT 6""").fetchall()[::-1]
    overdue = sorted((l for l in loans if l["status"] == "overdue"),
                     key=lambda l: -l["overdue_amount"])[:5]
    soon = []
    for l in loans:
        nd = l.get("next_due")
        if nd and l["balance"] > 0 and (nd["due"] - today).days <= 7:
            soon.append(dict(l, due_in=(nd["due"] - today).days,
                             due_date=nd["due"], due_amt=nd["amount"] - nd["paid"]))
    soon.sort(key=lambda r: r["due_date"])
    soon = soon[:8]
    return render_template("dashboard.html", s=stats, overdue=overdue, soon=soon,
                           chart_months=[r["m"] for r in months], chart_pay=[r["s"] for r in months],
                           chart_status=[counts["active"], counts["overdue"], counts["completed"]])


@app.route("/me")
@customer_required
def me():
    db, cid, today = get_db(), session["customer_id"], date.today()
    c = db.execute("SELECT * FROM customers WHERE id=?", (cid,)).fetchone() or abort(404)
    rows = []
    for r in db.execute(LOAN_SQL + " WHERE l.customer_id=? ORDER BY l.id DESC", (cid,)):
        d = build(dict(r), today)
        d["st"] = (d["status"] if d["decision"] == "approved" else
                   "review" if d["decision"] == "pending" else "rejected")
        d["agr"] = db.execute("SELECT * FROM agreements WHERE loan_id=?", (d["id"],)).fetchone() \
            if d["decision"] == "approved" else None
        rows.append(d)
    return render_template("me.html", c=c, rows=rows, today=today.isoformat())


@app.route("/profile", methods=["GET", "POST"])
@customer_required
def profile():
    db, cid = get_db(), session["customer_id"]
    c = db.execute("SELECT * FROM customers WHERE id=?", (cid,)).fetchone() or abort(404)
    e = {}
    if request.method == "POST":
        keys = ("name", "phone", "email", "address", "occupation",
                "guarantor_name", "guarantor_phone", "guarantor_address",
                "bank_name", "bank_account")
        f = {k: request.form.get(k, "").strip() for k in keys}
        f["phone"], f["guarantor_phone"] = norm_phone(f["phone"]), norm_phone(f["guarantor_phone"])
        if len(f["name"].split()) < 3:
            e["name"] = "Andika majina matatu kamili. Mfano: Amina Juma Mohamed."
        if not valid_phone(f["phone"]):
            e["phone"] = "Namba ya simu si sahihi. Mfano: 0712345678"
        if f["email"] and not re.fullmatch(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", f["email"]):
            e["email"] = "Barua pepe si sahihi. Mfano: jina@mfano.com"
        if len(f["address"]) < 3:
            e["address"] = "Weka anwani yako ili tuweze kukuhusisha."
        if len(f["occupation"]) < 2:
            e["occupation"] = "Eleza kazi unayofanya."
        if len(f["guarantor_name"].split()) < 3:
            e["guarantor_name"] = "Andika majina matatu kamili ya mdhamini. Mfano: Juma Hassan Mrisho."
        if not valid_phone(f["guarantor_phone"]):
            e["guarantor_phone"] = "Namba ya simu ya mdhamini si sahihi. Mfano: 0712345678"
        if f["guarantor_phone"] and f["guarantor_phone"] == f["phone"]:
            e["guarantor_phone"] = "Mdhamini asimame na namba yako mwenyewe."
        if len(f["guarantor_address"]) < 3:
            e["guarantor_address"] = "Weka anwani ya mdhamini."
        if f["bank_name"] and not f["bank_account"]:
            e["bank_account"] = "Weka namba ya akaunti yako ya benki."
        elif f["bank_account"] and not f["bank_name"]:
            e["bank_name"] = "Weka jina la benki yenye akaunti yako."
        elif f["bank_account"] and not re.fullmatch(r"[0-9A-Za-z -]{5,30}", f["bank_account"]):
            e["bank_account"] = "Namba ya akaunti si sahihi. Mfano: 015012345678"
        if not e and (db.execute("SELECT 1 FROM customers WHERE phone=? AND id!=?",
                                 (f["phone"], cid)).fetchone() or
                      db.execute("SELECT 1 FROM users WHERE username=? AND customer_id!=?",
                                 (f["phone"], cid)).fetchone()):
            e["phone"] = "Namba hii inatumwa na mtu mwingine."
        if not e:
            db.execute("""UPDATE customers SET name=?, phone=?, email=?, address=?,
                          occupation=?, guarantor_name=?, guarantor_phone=?,
                          guarantor_address=?, bank_name=?, bank_account=?, profile_done=1
                          WHERE id=?""",
                       (f["name"], f["phone"], f["email"], f["address"],
                        f["occupation"], f["guarantor_name"], f["guarantor_phone"],
                        f["guarantor_address"], f["bank_name"], f["bank_account"], cid))
            db.execute("UPDATE users SET username=? WHERE customer_id=?", (f["phone"], cid))
            db.commit()
            audit("customer.profile", f"customer#{cid}", f["name"])
            flash("Taarifa zako zimehifadhiwa. Karibu kuomba mkopo.", "success")
            return redirect(url_for("apply"))
        flash("Hakikisha taarifa zako ni sahihi.", "danger")
    else:
        f = {k: (c[k] or "") for k in ("name", "phone", "email", "address",
                                       "occupation", "guarantor_name", "guarantor_phone",
                                       "guarantor_address", "bank_name", "bank_account")}
        DEMO = {"email": "amina@email.com",
                "address": "Kinondoni, Dar es Salaam", "occupation": "Mkulima / Biashara",
                "guarantor_name": "Juma Hassan Mrisho", "guarantor_phone": "0754123456",
                "guarantor_address": "Mwanza"}
        for k, v in DEMO.items():
            if not f[k]:
                f[k] = v
    return render_template("profile.html", f=f, e=e)


@app.route("/apply", methods=["GET", "POST"])
@customer_required
def apply():
    db, cid, today = get_db(), session["customer_id"], date.today()
    blocked, active = None, 0
    if db.execute("SELECT 1 FROM loans WHERE customer_id=? AND decision='pending'", (cid,)).fetchone():
        blocked = "Una ombi linalosubiri ukaguzi. Subiri uamuzi kabla ya kuomba lingine."
    else:
        for r in db.execute(LOAN_SQL + APPROVED + " AND l.customer_id=?", (cid,)):
            st = build(dict(r), today)["status"]
            if st == "overdue":
                blocked = "Una mkopo uliochelewa. Lipa kwanza kabla ya kuomba mwingine."
                break
            if st == "active":
                active += 1
        if not blocked and active >= MAX_ACTIVE_LOANS:
            blocked = (f"Una mikopo {active} inayoendelea kwa sasa. Lipa mmoja kikamilifu "
                       "kabla ya kuomba mkopo mwingine.")
    if request.method == "POST" and not blocked:
        amount, months = to_int(request.form.get("principal")), to_int(request.form.get("months"))
        purpose = request.form.get("purpose", "").strip()[:200]
        err = (f"Kiasi kiwe kati ya TZS {MIN_LOAN:,} na TZS {MAX_LOAN:,}."
               if not amount or not MIN_LOAN <= amount <= MAX_LOAN else
               f"Muda uwe miezi 1 hadi {MAX_MONTHS}." if not months or not 1 <= months <= MAX_MONTHS else
               "Eleza kwa ufupi mkopo utatumika kwa nini." if len(purpose) < 3 else None)
        if err:
            flash(err, "danger")
        else:
            db.execute("""INSERT INTO loans(customer_id, principal, rate, months, start_date, decision, purpose)
                          VALUES(?,?,0,?,?, 'pending', ?)""", (cid, amount, months, today.isoformat(), purpose))
            db.commit()
            flash("Ombi lako limepokelewa. Utajulishwa uamuzi ukitolewa.", "success")
            return redirect(url_for("me"))
    return render_template("apply.html", blocked=blocked, min_loan=MIN_LOAN, max_loan=MAX_LOAN,
                           max_months=MAX_MONTHS)


# ---------- Maombi (admin) ----------
@app.route("/applications")
@admin_required
def applications():
    db = get_db()
    q = """SELECT l.*, c.name AS customer, c.phone, c.address,
             (SELECT COUNT(*) FROM loans x WHERE x.customer_id=l.customer_id AND x.decision='approved') AS past
           FROM loans l JOIN customers c ON c.id=l.customer_id WHERE l.decision{} ORDER BY l.id DESC"""
    return render_template("applications.html", pending=db.execute(q.format("='pending'")).fetchall(),
                           done=db.execute(q.format("='rejected'") + " LIMIT 20").fetchall(),
                           today=date.today().isoformat())


@app.post("/applications/<int:lid>/decide")
@admin_required
def decide(lid):
    db = get_db()
    db.execute("SELECT 1 FROM loans WHERE id=? AND decision='pending'", (lid,)).fetchone() or abort(404)
    action, note = request.form.get("action"), request.form.get("note", "").strip()[:300]
    if action == "reject":
        db.execute("UPDATE loans SET decision='rejected', review_note=? WHERE id=?", (note, lid))
        flash("Ombi limekataliwa.", "warning")
    elif action == "approve":
        try:
            rate = float(request.form.get("rate", ""))
        except ValueError:
            rate = None
        start = to_date(request.form.get("start_date"))
        if rate is None or not 0 <= rate <= 100 or not start:
            flash("Weka riba (0-100) na tarehe sahihi ya kuanza.", "danger")
            return redirect(url_for("applications"))
        db.execute("""UPDATE loans SET decision='approved', rate=?, start_date=?, review_note=?
                      WHERE id=?""", (rate, start.isoformat(), note, lid))
        flash("Ombi limeidhinishwa. Mkopo umeanza.", "success")
    else:
        abort(400)
    db.commit()
    audit("loan.approve" if action == "approve" else "loan.reject", f"loan#{lid}", note)
    return redirect(url_for("applications"))


@app.post("/loans/<int:lid>/agreement")
@login_required
def sign_agreement(lid):
    db = get_db()
    row = db.execute(LOAN_SQL + " WHERE l.id=?", (lid,)).fetchone() or abort(404)
    own_or_admin(row)
    if row["decision"] != "approved":
        abort(404)
    info = build(dict(row), date.today())
    last = info["rows"][-1]
    f = request.form
    existing = db.execute("SELECT * FROM agreements WHERE loan_id=?", (lid,)).fetchone()

    # MKOPESHAJI (admin) anasaini baada ya mkopaji kusaini.
    if session.get("role") == "admin":
        if not existing or not existing["accepted"]:
            flash("Mteja hajasaini mkataba bado. Subiri asaini kabla ya wewe.", "warning")
            return redirect(url_for("loan", lid=lid))
        lender_sign = f.get("lender_sign", "").strip()[:80]
        lender_witness = f.get("lender_witness", "").strip()[:80]
        err = ("Andika jina la mkopeshaji kama saini." if not lender_sign else
               "Weka jina la shahidi wa mkopeshaji." if len(lender_witness) < 3 else None)
        if err:
            flash(err, "danger")
            return redirect(url_for("loan", lid=lid))
        db.execute("UPDATE agreements SET lender=?, lender_sign=?, lender_witness=? WHERE loan_id=?",
                   (LENDER, lender_sign, lender_witness, lid))
        db.commit()
        audit("agreement.lender_sign", f"loan#{lid}", lender_sign)
        flash("Mkataba umesainiwa upande wa mkopeshaji.", "success")
        return redirect(url_for("loan", lid=lid))

    # MKOPAJI (mteja) anasaini pamoja na MDHAMINI.
    borrower = info["customer"]
    guarantor = (info.get("guarantor_name") or "").strip()
    sign = f.get("borrower_sign", "").strip()[:80]
    gsign = f.get("guarantor_sign", "").strip()[:80]
    err = ("Unaweka saini kwa kukubaliana na masharti ya mkataba." if not f.get("accept") else
           "Weka mahali ulipokazia mkataba huu." if not f.get("place", "").strip() else
           "Weka tarehe sahihi ya kusaini." if not to_date(f.get("signed_on")) else
           "Andika jina lako kama saini." if not sign else
           f"Jina la saini lazima liwe kama jina lako: {borrower}." if sign.lower() != borrower.lower() else
           "Weka jina la shahidi wako (shahidi wa mkopaji)."
           if len(f.get("borrower_witness", "").strip()) < 3 else
           "Weka saini ya mdhamini (andika jina la mdhamini)." if not gsign else
           f"Jina la saini ya mdhamini liwe kama jina la mdhamini: {guarantor}."
           if guarantor and gsign.lower() != guarantor.lower() else
           "Weka jina la shahidi wa mdhamini."
           if len(f.get("guarantor_witness", "").strip()) < 3 else None)
    if err:
        flash(err, "danger")
        return redirect(url_for("loan", lid=lid))
    db.execute("""INSERT INTO agreements
        (loan_id, place, signed_on, purpose, principal, interest, total, period_months, repay_by,
         borrower, borrower_witness, borrower_sign, lender, guarantor, guarantor_phone,
         guarantor_sign, guarantor_witness, accepted)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
        ON CONFLICT(loan_id) DO UPDATE SET
          place=excluded.place, signed_on=excluded.signed_on, purpose=excluded.purpose,
          principal=excluded.principal, interest=excluded.interest, total=excluded.total,
          period_months=excluded.period_months, repay_by=excluded.repay_by,
          borrower=excluded.borrower, borrower_witness=excluded.borrower_witness,
          borrower_sign=excluded.borrower_sign, guarantor=excluded.guarantor,
          guarantor_phone=excluded.guarantor_phone, guarantor_sign=excluded.guarantor_sign,
          guarantor_witness=excluded.guarantor_witness, accepted=1""",
        (lid, f.get("place", "").strip()[:120], to_date(f.get("signed_on")).isoformat(),
         info["purpose"], info["principal"], info["interest"], info["total"], info["months"],
         last["due"].isoformat(), borrower, f.get("borrower_witness", "").strip()[:80], sign,
         LENDER, guarantor or gsign, (info.get("guarantor_phone") or "").strip(), gsign,
         f.get("guarantor_witness", "").strip()[:80]))
    db.commit()
    audit("agreement.borrower_sign", f"loan#{lid}", sign)
    flash("Mkataba umesainiwa kwa mafanikio.", "success")
    return redirect(url_for("loan", lid=lid))


def agreement_row(gid):
    return get_db().execute("""SELECT g.*, l.customer_id, c.phone FROM agreements g
        JOIN loans l ON l.id = g.loan_id JOIN customers c ON c.id = l.customer_id
        WHERE g.id=?""", (gid,)).fetchone() or abort(404)


@app.route("/agreements/<int:gid>/print")
@login_required
def agreement_print(gid):
    g = agreement_row(gid)
    own_or_admin(g)
    return render_template("agreement_print.html", g=g)


# ---------- Wateja (admin) ----------
@app.route("/customers")
@admin_required
def customers():
    q = request.args.get("q", "").strip()
    rows = get_db().execute("""SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ?
                               ORDER BY id DESC""", (f"%{q}%",) * 2).fetchall()
    return render_template("customers.html", rows=rows, q=q)


@app.route("/customers/<int:cid>")
@admin_required
def customer(cid):
    db = get_db()
    c = db.execute("SELECT * FROM customers WHERE id=?", (cid,)).fetchone() or abort(404)
    loans = [build(dict(r), date.today())
             for r in db.execute(LOAN_SQL + APPROVED + " AND l.customer_id=? ORDER BY l.id DESC", (cid,))]
    has_user = db.execute("SELECT 1 FROM users WHERE customer_id=? AND role='customer'",
                          (cid,)).fetchone() is not None
    return render_template("customer.html", c=c, loans=loans, has_user=has_user)


@app.post("/customers/<int:cid>/reset-password")
@admin_required
def reset_customer_password(cid):
    db = get_db()
    u = db.execute("SELECT * FROM users WHERE customer_id=? AND role='customer'",
                   (cid,)).fetchone() or abort(404)
    temp = secrets.token_hex(4)
    db.execute("UPDATE users SET password_hash=? WHERE id=?",
               (generate_password_hash(temp), u["id"]))
    db.commit()
    audit("customer.reset_password", f"customer#{cid}", u["username"])
    flash(f"Password ya mteja imewekwa upya. Password ya muda: {temp} — mpe mteja, "
          f"na amshauri aibadilishe mara moja.", "warning")
    return redirect(url_for("customer", cid=cid))


@app.post("/admin/backup")
@admin_required
def manual_backup():
    dest = backup_db(force=True)
    if dest:
        audit("backup.create", os.path.basename(dest))
        flash(f"Nakala ya database imehifadhiwa: {os.path.basename(dest)}.", "success")
    else:
        flash("Backup imeshindikana: database haipatikani.", "danger")
    return redirect(url_for("backups"))


@app.route("/admin/backups")
@admin_required
def backups():
    rows = []
    for f in list_backups():
        p = os.path.join(BACKUP_DIR, f)
        rows.append(dict(name=f, size=os.path.getsize(p),
                         mtime=time.strftime("%Y-%m-%d %H:%M", time.localtime(os.path.getmtime(p)))))
    return render_template("backups.html", rows=rows)


@app.post("/admin/backups/restore")
@admin_required
def restore_backup():
    name = request.form.get("name", "")
    if restore_db(name):
        init_db()          # hakikisha schema ni ya sasa baada ya kurudisha
        audit("backup.restore", name)
        flash(f"Database imerudishwa kutoka {name}. Data ya sasa ni ya nakala hiyo.", "success")
    else:
        flash("Nakala iliyochaguliwa haipatikani.", "danger")
    return redirect(url_for("backups"))


@app.post("/admin/backups/delete")
@admin_required
def delete_backup():
    name = os.path.basename(request.form.get("name", ""))
    path = os.path.join(BACKUP_DIR, name)
    if name.startswith("loans_") and name.endswith(".db") and os.path.isfile(path):
        os.remove(path)
        audit("backup.delete", name)
        flash(f"Nakala {name} imefutwa.", "warning")
    else:
        flash("Nakala haipatikani.", "danger")
    return redirect(url_for("backups"))


@app.route("/audit")
@admin_required
def audit_log():
    rows = get_db().execute("SELECT * FROM audit ORDER BY id DESC LIMIT 300").fetchall()
    return render_template("audit.html", rows=rows)


# ---------- Mikopo ----------
@app.route("/loans")
@admin_required
def loans():
    status = request.args.get("status", "")
    rows = [build(dict(r), date.today()) for r in get_db().execute(LOAN_SQL + APPROVED + " ORDER BY l.id DESC")]
    if status:
        rows = [r for r in rows if r["status"] == status]
    return render_template("loans.html", rows=rows, status=status)


def own_or_admin(row):
    if session.get("role") != "admin" and row["customer_id"] != session.get("customer_id"):
        abort(404)   # 404 ili kutofichua kuwepo kwa mikopo ya watu wengine


def contract_done(db, lid):
    """Mkataba umesainiwa kikamilifu na mkopaji, mdhamini na mkopeshaji?"""
    a = db.execute("SELECT accepted, lender_sign FROM agreements WHERE loan_id=?", (lid,)).fetchone()
    return bool(a and a["accepted"] and (a["lender_sign"] or "").strip())


@app.route("/loans/<int:lid>")
@login_required
def loan(lid):
    db = get_db()
    row = db.execute(LOAN_SQL + " WHERE l.id=?", (lid,)).fetchone() or abort(404)
    own_or_admin(row)
    if row["decision"] != "approved":
        if session["role"] == "admin":
            return redirect(url_for("applications"))
        return render_template("application.html", l=row)
    pays = db.execute("SELECT * FROM payments WHERE loan_id=? ORDER BY paid_on DESC, id DESC", (lid,)).fetchall()
    agr = db.execute("SELECT * FROM agreements WHERE loan_id=?", (lid,)).fetchone()
    return render_template("loan.html", l=build(dict(row), date.today()), pays=pays,
                           methods=METHODS, today=date.today().isoformat(), agr=agr)


@app.post("/loans/<int:lid>/pay")
@admin_required
def pay(lid):
    db = get_db()
    row = db.execute(LOAN_SQL + APPROVED + " AND l.id=?", (lid,)).fetchone() or abort(404)
    if not contract_done(db, lid):
        flash("Hauwezi kurekodi malipo: mkataba haujasainiwa kikamilifu na mkopaji, "
              "mdhamini na mkopeshaji.", "danger")
        return redirect(url_for("loan", lid=lid))
    info = build(dict(row), date.today())
    amount, paid_on = to_int(request.form.get("amount")), to_date(request.form.get("paid_on"))
    method = request.form.get("method")
    if not amount or amount <= 0:
        flash("Weka kiasi sahihi.", "danger")
    elif amount > info["balance"]:
        flash(f"Kiasi kinazidi deni lililobaki (TZS {info['balance']:,}).", "danger")
    elif not paid_on or method not in METHODS:
        flash("Tarehe au njia ya malipo si sahihi.", "danger")
    else:
        db.execute("INSERT INTO payments(loan_id, amount, paid_on, method, note) VALUES(?,?,?,?,?)",
                   (lid, amount, paid_on.isoformat(), method, request.form.get("note", "").strip()[:200]))
        db.commit()
        audit("payment.create", f"loan#{lid}", f"amount={amount}; method={method}")
        flash("Malipo yamerekodiwa.", "success")
    return redirect(url_for("loan", lid=lid))


# ---------- Kurekebisha / kufuta malipo (admin) ----------
def payment_row(pid):
    return get_db().execute("""SELECT p.*, l.customer_id, c.name, c.phone FROM payments p
        JOIN loans l ON l.id = p.loan_id JOIN customers c ON c.id = l.customer_id
        WHERE p.id=?""", (pid,)).fetchone() or abort(404)


@app.route("/payments/<int:pid>/edit", methods=["GET", "POST"])
@admin_required
def payment_edit(pid):
    db = get_db()
    p = payment_row(pid)
    row = db.execute(LOAN_SQL + APPROVED + " AND l.id=?", (p["loan_id"],)).fetchone() or abort(404)
    info = build(dict(row), date.today())
    e = {}
    if request.method == "POST":
        amount, paid_on = to_int(request.form.get("amount")), to_date(request.form.get("paid_on"))
        most = info["balance"] + p["amount"]   # deni lililobaki + kiasi cha awali (baada ya kukiondoa)
        if not amount or amount <= 0:
            e["amount"] = "Weka kiasi sahihi."
        elif amount > most:
            e["amount"] = f"Kiasi kikubwa kuliko inavyoruhusiwa (TZS {most:,})."
        if not paid_on:
            e["paid_on"] = "Tarehe si sahihi."
        if request.form.get("method") not in METHODS:
            e["method"] = "Chagua njia sahihi ya malipo."
        if not e:
            db.execute("UPDATE payments SET amount=?, paid_on=?, method=?, note=? WHERE id=?",
                       (amount, paid_on.isoformat(), request.form.get("method"),
                        request.form.get("note", "").strip()[:200], pid))
            db.commit()
            audit("payment.edit", f"RCP-{pid:05d}", f"amount={amount}")
            flash("Malipo yamerekebishwa.", "success")
            return redirect(url_for("loan", lid=p["loan_id"]))
        flash("Hakikisha taarifa za malipo ni sahihi.", "danger")
    return render_template("payment_edit.html", p=p, info=info, methods=METHODS, e=e)


@app.post("/payments/<int:pid>/delete")
@admin_required
def payment_delete(pid):
    db = get_db()
    p = payment_row(pid)
    db.execute("DELETE FROM payments WHERE id=?", (pid,))
    db.commit()
    audit("payment.delete", f"RCP-{pid:05d}", f"amount={p['amount']}")
    flash(f"Malipo ya risiti RCP-{pid:05d} yamefutwa.", "warning")
    return redirect(url_for("loan", lid=p["loan_id"]))


# ---------- Malipo ----------
@app.route("/payments")
@admin_required
def payments():
    rows = get_db().execute("""SELECT p.*, c.name FROM payments p
        JOIN loans l ON l.id = p.loan_id JOIN customers c ON c.id = l.customer_id
        ORDER BY p.paid_on DESC, p.id DESC""").fetchall()
    return render_template("payments.html", rows=rows)


@app.route("/payments/<int:pid>/receipt")
@login_required
def receipt(pid):
    p = get_db().execute("""SELECT p.*, c.name, c.phone, l.customer_id FROM payments p
        JOIN loans l ON l.id = p.loan_id JOIN customers c ON c.id = l.customer_id
        WHERE p.id=?""", (pid,)).fetchone() or abort(404)
    own_or_admin(p)
    return render_template("receipt.html", p=p)


init_db()
if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "5000"))
    try:
        from waitress import serve   # server ya production
        print(f"ANTHONY MICROFINANCE inaendesha kwenye http://{host}:{port}")
        serve(app, host=host, port=port, threads=8)
    except ImportError:
        print("waitress haipo — server ya maendeleo pekee. Fanya: pip install waitress")
        app.run(host=host, port=port, debug=False)

# ANTHONY MICROFINANCE - LOAN MANAGEMENT SYSTEM

Mfumo wa kukopesha.

Kuna matoleo mawili:

1. **Flask + SQLite** (`app.py`) — kwa kuendesha kwenye kompyuta yako (`python app.py`).
2. **App tuli + Supabase** (`docs/`) — kwa ku-host kwenye **GitHub Pages** (hauna server; data ipo Supabase).

> **Hali ya sasa (2026-11-01):** schema na migrations zimepandishwa, admin `0700000000`
> ameundwa, na app iko live kwenye
> https://richardisaya522-arch.github.io/Loan-Management-System/

---

## A. Kuendesha kwa Flask (kompyuta yako)
```
pip install -r requirements.txt
python app.py
```
Fungua http://127.0.0.1:5000
- **Ofisi (admin):** `admin` / `admin123` (badilisha kwa `ADMIN_PASSWORD=... python app.py`).

---

## B. App tuli + Supabase (GitHub Pages)

### 1. Unda Supabase project
- Nenda https://supabase.com → **New project** (chagua jina, password ya database, rudi).
- **Muhimu:** Dashboard → *Authentication* → *Providers* → **Email** →
  ZIMA **"Confirm email"** (ili usajili ufanye kazi bila kutuma barua pepe).
- **Muhimu:** Dashboard → *Authentication* → **Attack Protection / Settings** → ZIMA **CAPTCHA**
  (app tuli haitumi captcha token; ikiwa imewashwa, usajili na ingia vitakataliwa).

### 2. Endesha schema
- Dashboard → **SQL Editor** → *New query* → nakili yote ya `docs/schema.sql` → **Run**.
- Kwa project iliyounganishwa na Supabase CLI, tumia `supabase db push` ili migration
  za mwanzo na masasisho ya usalama yapandishwe.

### 3. Weka config
- Dashboard → **Project Settings** → **API**. Nakili **Project URL** na **anon public key**.
- Fungua `docs/config.js`, badilisha:
  ```js
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ...",
  ```
- Tumia publishable/anon key kwenye app ya browser pekee. Usiweke `sb_secret_...`
  au `service_role` key kwenye `docs/config.js`, HTML, au JavaScript; hizo zinahitaji
  backend na si salama kwa GitHub Pages.
- Dashboard → *Authentication* → *URL Configuration*: weka **Site URL** na
  **Redirect URLs** kuwa `https://richardisaya522-arch.github.io/Loan-Management-System/`.

### 4. Unda admin
- Fungua app, **Jisajili** kwa namba utakayotumia kama admin (mfano `0700000000`).
- Kisha kwenye **SQL Editor** endesha:
  ```sql
  update public.profiles set role = 'admin' where username = '0700000000';
  ```
- Ingia tena — utaona menu za ofisi (Maombi, Wateja, Mikopo, Malipo, Kumbukumbu).

### 5. Wezesha GitHub Pages
- GitHub repo → **Settings** → **Pages** → *Source*: **Deploy from a branch** →
  Branch: **main**, Folder: **/docs** → **Save**.
- Baada ya dakika 1–2, fungua: `https://richardisaya522-arch.github.io/Loan-Management-System/`

### Vidokezo
- Wateja wanaingia kwa **namba ya simu + password** (bila SMS; simu hubadilishwa kuwa barua pepe ya ndani).
- Kubadilisha password ya mteja: Supabase Dashboard → *Authentication* → *Users*.
- Nakala/backup: zinatunzwa na Supabase.

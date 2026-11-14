# ZABURI YA 23 MICROFINANCE - LOAN MANAGEMENT SYSTEM

Mfumo wa kukopesha.

Kuna matoleo mawili — **si data moja**:

1. **App tuli + Supabase** (`docs/`) — **mfumo rasmi** unaotumiwa na wateja wote.
   Uko live kwenye **GitHub Pages**; data inahifadhiwa Supabase na ni ile ile kwenye
   kifaa chochote.
2. **Flask + SQLite** (`app.py`) — toleo la ndani (localhost) kwa majaribio pekee.
   Data yake iko kwenye `loans.db` ya kompyuta hiyo; **haishiriki data na mfumo rasmi**.

> **Hali ya sasa (2026-11-14):** migrations zimepandishwa, Edge Functions `login` na
> `admin-reset-password` zime-deploy, na mfumo rasmi uko
> https://richardisaya522-arch.github.io/Loan-Management-System/.
> Admin: `officiallytony520@gmail.com` (namba `0700000000`).

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
- Fungua app, **Jisajili** kwa barua pepe halisi + namba ya simu unayotaka kuwa admin
  (mfano `officiallytony520@gmail.com` / `0700000000`).
- Kisha kwenye **SQL Editor** endesha:
  ```sql
  update public.profiles set role = 'admin' where username = '0700000000';
  ```
- Ingia tena — utaona menu za ofisi (Maombi, Wateja, Mikopo, Malipo, Nakala, Kumbukumbu).

### 5. Deploy Edge Functions
```powershell
npx.cmd --yes supabase@latest functions deploy login --no-verify-jwt --use-api --yes
npx.cmd --yes supabase@latest functions deploy admin-reset-password --use-api --yes
```

### 6. Wezesha GitHub Pages
- GitHub repo → **Settings** → **Pages** → *Source*: **Deploy from a branch** →
  Branch: **main**, Folder: **/docs** → **Save**.
- Baada ya dakika 1–2, fungua: `https://richardisaya522-arch.github.io/Loan-Management-System/`

### Vidokezo
- Watumiaji wanajisajili kwa **jina, barua pepe halisi na namba ya simu**; taarifa
  zinahifadhiwa kwenye `profiles`/`customers`.
- Kuingia: **barua pepe AU namba ya simu + password** (Edge Function `login`).
- Umesahau password: kiungo cha reset kinatumwa kwenye **barua pepe** iliyosajiliwa.
  Kiungo kinarudi kwenye GitHub Pages; mtumiaji anaweka password mpya.
- Barua pepe za Supabase zina kikomo cha kutuma (default ~2 kwa saa). Kwa matumizi
  halisi, weka **custom SMTP** (Resend/Brevo/SendGrid) kwenye
  Dashboard → *Authentication* → *SMTP*.
- Kubadilisha password ya mteja: mteja mwenyewe (`Umesahau password?`), au admin
  kwenye ukurasa wa mteja (**Weka upya password**).
- Nakala/backup: zinatunzwa na Supabase; admin anaweza kupakua JSON/CSV kwenye **Nakala**.

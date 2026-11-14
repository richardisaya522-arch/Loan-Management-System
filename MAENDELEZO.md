# MAENDELEZO — ZABURI YA 23 MICROFINANCE

> Faili la kuendeleza kazi. Sasisha kila kikao.

## Tarehe ya mwisho
2026-11-14

## Lengo
Mfumo wa kukopesha (ZABURI YA 23 MICROFINANCE). Lengo la sasa: **app tuli (HTML/JS) + Supabase**
inayohost kwenye **GitHub Pages**.

## Hali kwa sasa (summary)
- Repo: https://github.com/richardisaya522-arch/Loan-Management-System (branch `main`)
- Kuna matoleo mawili:
  1. **Flask + SQLite** (`app.py`) — kompyuta ya ndani. Data ni safi (admin pekee).
     `test_signup.py` inapita.
  2. **App tuli + Supabase** (`docs/`) — **IKO LIVE** kwenye GitHub Pages.
- **Supabase project:** ref `ghxahscpxobuoorgyedn`
  URL: https://ghxahscpxobuoorgyedn.supabase.co
- **Schema:** migrations zote zimepandishwa (imehakikiwa kwa `supabase migration list`):
  - `20261016203931_init_schema`
  - `20261016220000_reload_schema`
  - `20261101090000_harden_loan_workflows`
- **Auth config (remote):** `mailer_autoconfirm = true` (Confirm email OFF),
  `security_captcha_enabled = false`, `site_url` + `uri_allow_list` = Pages URL.
- **Admin:** `officiallytony520@gmail.com` (`role = admin`, namba `0700000000`).
  Password imebadilishwa na inatumika pia kuingia kwa simu. Usiweke password kwenye repo.
- **GitHub Pages:** https://richardisaya522-arch.github.io/Loan-Management-System/ (HTTP 200).

## Kilichokamilika
### Flask (app.py)
- Audit trail (`/audit`), backup/restore (`/admin/backups`), kizuizi cha mkataba kabla ya malipo,
  WAL + `DB_JOURNAL` env, waitress.
- Data yote ya demo imefutwa; DB ni safi (`admin` pekee).
- CSRF, throttling, `MAX_ACTIVE_LOANS=2`, min/max mkopo, miezi max 24.
- `DB_PATH` / `BACKUP_DIR` zinaweza kubadilishwa kwa env (kwa tests).

### GitHub
- `git init` + commit; imepandishwa `main`.
- `.gitignore` inazuia: `.secret_key`, `loans.db*`, `backups/`, `__pycache__/`, `server.log`, `.venv/`.

### App tuli (docs/)
- `index.html`, `app.js`, `style.css`, `config.js`, `schema.sql`
- Usajili/ingia (simu+password → email ya ndani `NNN@zaburiya23.local`), dashboard ya mteja,
  kuomba mkopo, profile, maelezo ya mkopo + ratiba + saini, admin (dashboard, maombi, wateja,
  mikopo, malipo, kumbukumbu).
- Usalama wote uko Supabase (RLS + functions za `security definer`).
- **Imejaribiwa end-to-end (2026-11-01):** usajili, profile, ombi, idhini, kizuizi cha malipo
  kabla ya mkataba, saini za pande mbili, malipo, risiti, audit, na vipimo vya usalama
  (self-promote, audit insert, anon RPC) — **PASS zote**.
- **Bug iliyorekebishwa:** kitufe cha "Kataa" kilituma hoja 3 tu kwa `decide_loan`; sasa
  kinatuma zote 6 (`p_rate`, `p_months`, `p_start` = `null`).

### 2026-11-14 — Auth ya kweli + data moja
- **Chanzo cha mkanganyiko:** mfumo una matoleo mawili — app tuli (Supabase, data moja)
  na Flask (SQLite ya ndani). Flask sasa ina bango la "Toleo la ndani (localhost)"
  linaloelekeza kwenye mfumo rasmi; app tuli inaonyesha project ref + toleo.
- **Usajili:** jina, barua pepe halisi, simu + password. Trigger `handle_new_user`
  inahifadhi `profiles.email`, `customers.name/phone/email`; `profiles` ina column `email`.
- **Kuingia:** barua pepe **au** simu + password kupitia Edge Function `login`
  (service_role ndani ya function; browser haioni key ya siri).
- **Umesahau password:** `resetPasswordForEmail` → barua pepe halisi → kiungo kinarudi
  Pages (`#/reset-password`) → mtumiaji anaweka + kuthibitisha password mpya.
- **Admin:** auth email imehamishwa hadi `officiallytony520@gmail.com`; password mpya
  imewekwa na kujaribiwa (email + simu). Mteja `0621360599` amehamishwa hadi
  `comradedemafia@gmail.com`.
- **Edge Function `admin-reset-password`:** ime-deploy na kujaribiwa end-to-end
  (temp user → reset → login → delete). Bila JWT inarudisha 401.
- **Cache-busting:** `index.html` inatumia `?v=20261114` kwa `app.js`/`config.js`/`style.css`.
- **Migrations mpya:** `20261114090000_real_email_auth.sql` (imepushwa remote).
- **Vipimo:** login email OK, login simu OK, password mbaya 401, reset request 200,
  `admin-reset-password` 401 bila auth, reset→login OK.

### 2026-11-14 - Usafishaji + usalama
- **UI:** imeondolewa taarifa ya project ref, toleo, anwani ya mfumo rasmi, na maelezo ya
  kiufundi ya Supabase kwenye ukurasa wa kuingia na footer. Footer sasa ina copyright pekee.
- **Nakala:** ukurasa wa nakala hauna kiungo cha Supabase dashboard; unatoa JSON/CSV pekee.
- **Makosa:** `errorView` inaonyesha ujumbe wa jumla; maelezo ya kiufundi yanabaki kwenye
  console pekee. Ukurasa wa nakala hauonyeshi majina ya majedwali yenye hitilafu.
- **Edge Functions:** CORS imezuiliwa kwa Pages + localhost, `Cache-Control: no-store`,
  mipaka ya `content-length`, na ujumbe wa hitilafu wa jumla (hakuna schema ya DB).
- **Dead code:** `APP_VERSION`, `PROJECT_REF`, `LIVE_URL`, na `state.route` zimeondolewa;
  `RESET_REDIRECT` inatokana na `location`.
- **Schema:** `docs/schema.sql` sasa inarudisha grant ya `phone_registered(text)` kwa `anon`
  baada ya `revoke` ya mwisho (ilisahaulika awali).
- **Usafi:** `server.err.log` na `server.out.log` zimeondolewa kwenye Git; `.gitignore`
  ina `*.log` na `supabase/.temp/`. `backups/ADMIN_PASSWORD_SUPABASE.txt`, `.temp` ya
  Supabase, na folda ya zamani ya `supabase/` nje ya repo zimefutwa.
- **Flask:** hakuna password ya default `admin123`; `ADMIN_PASSWORD` ikikosekana, mfumo
  hutengeneza password ya muda yenye nguvu na kulazimisha kubadilisha. Migration
  `must_change_password` imeongezwa; `check_password_hash(..., "admin123")` imeondolewa.
- **Reset ya mteja:** admin anaona password ya muda kwenye modal yenye kitufe cha **Copy**
  (clipboard + fallback ya `execCommand`), badala ya `alert()` inayotoweka.
- **Cache-busting:** `?v=20261115b` kwa `app.js`/`config.js`/`style.css`.

### 2026-11-14 - Email ya password ya muda + kulazimisha kubadilisha
- **Migration** `20261114120000_force_password_change.sql` (imepushwa remote):
  `profiles.must_change_password` + `profiles.temp_password_hash`; `profiles_update`
  policy imeondolewa na update grant imevutwa (client hawezi kujiondoa kwenye flag).
- **`admin-reset-password`:** inachagua email ya mteja (fallback `auth.users`), inaweka
  flag + SHA-256 hash, inatuma email kwa Resend (`RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`),
  na inarudisha `email_sent`/`email_message`. Ime-deploy.
- **`complete-password-change`:** function mpya (JWT, password policy, hash check,
  update ya password, clear flag). Ime-deploy.
- **App:** mteja aliye na flag anaona screen ya password mpya + confirm pekee (shell
  ndogo); akimaliza, ameingizwa tena kwenye login na email/username yake imejazwa.
  Password zote zina kitufe cha **jicho** (onyesha/ficha). Modal ya admin inaonyesha
  kama email imetumwa au la. Cache-bust: `?v=20261115c`.
- **Admin:** password imewekwa upya kwa GoTrue Admin API na login imethibitishwa.
- **Vipimo end-to-end (temp user):** reset -> flag -> temp login -> direct update
  imezuiwa (403) -> password ya muda imekataliwa -> password rahisi imekataliwa ->
  complete -> flag imeondolewa -> login mpya OK -> password ya zamani imekataliwa ->
  cleanup OK. `EMAIL_SENT=false` kwa sababu `RESEND_API_KEY` haipo bado.

## Inayofuata
1. **Muhimu:** weka `RESEND_API_KEY` + `EMAIL_FROM` (Resend) kwenye Supabase secrets
   ili email ya password ya muda itumike; bila hiyo admin anatumia **Copy**.
2. Weka custom SMTP (Resend/Brevo/SendGrid) kwenye Supabase Auth kwa reset emails za
   kawaida; default ina kikomo cha ~2 kwa saa.
3. (Hiari) Kizuizi cha mkopo uliochelewa (overdue) kwenye `apply_loan`.
4. (Hiari) Vipimo zaidi vya RLS / CI.

## CLI ya Supabase — hali
- `supabase init` + `link` zimefanyika; `supabase/` ina `config.toml` na migrations.
- `supabase migration list`, `supabase db query --linked "..."`, `supabase config push` zinafanya kazi.
- Config ya auth ilisasishwa kupitia Management API (captcha off, site_url/allow-list).
- **2026-11-12:** migration `20261108120000_security_hardening.sql` imepushwa remote
  (`db push --remote`), na akaunti ya admin `0700000000` imehamishiwa
  `0700000000@zaburiya23.local` (auth.users + auth.identities).
- **2026-11-12:** captcha ilikuwa imewashwa remote (`hcaptcha`) na ilizuia usajili/ingia wa app
  tuli; imezimwa tena kwa `config push` ya minimal (`auth.captcha.enabled=false`). Mipangilio
  mingine ya remote (site_url, password requirements, MFA, n.k.) haikuguswa.
- **2026-11-12:** jaribio la live (signup → `save_profile` → `apply_loan`) limepita; `anon`
  `apply_loan` imekataliwa; data ya jaribio imefutwa.
- **2026-11-12:** password za admin zimebadilishwa na kuthibitishwa: Supabase `0700000000`
  (login halisi, `role=admin`) na Flask `admin` (login ya test client). Hifadhi kwenye password
  manager; usiweke kwenye repo.
- **2026-11-14:** `db push --linked --yes` imeandikisha `20261114090000_real_email_auth.sql`.
  `functions deploy login --no-verify-jwt` na `functions deploy admin-reset-password`
  zimefanyika kwa `--use-api`. Admin email/password na customer email zimebadilishwa kupitia
  GoTrue Admin API; `profiles.email` imesawazishwa na trigger.
- **Kumbuka:** `supabase config push` haihitajiki sasa — remote ina `site_url` na
  `additional_redirect_urls` sahihi (Pages). `config.toml` ya local imesawazishwa ili
  push ya baadaye isivunje.

## Vidokezo / maamuzi
- **Mfumo rasmi ni mmoja:** app tuli (`docs/`) + Supabase. Flask ni la ndani tu; bango
  linaelekeza kwenye Pages.
- Auth: **barua pepe au namba ya simu + password**. Simu huhifadhiwa kwenye `profiles.username`
  na `customers.phone`; hakuna SMS/OTP.
- Reset ya password: Supabase email → Pages (`#/reset-password`). Ongeza custom SMTP kwa
  uhakika wa kutuma.
- Kubadilisha password ya mteja: mteja mwenyewe, au admin → mteja → "Weka upya password".
  Admin anaweza ku-copy password ya muda; ikiwa `RESEND_API_KEY` imewekwa, mteja
  hupokea email na password hiyo na analazimishwa kuibadilisha akiingia.
- Key ya umma ni `sb_publishable_...`; usalama ni RLS. Usiweke `sb_secret_...` kwenye `docs/`.
- Backup: Supabase inatunza; admin anaweza kupakua JSON/CSV.
- Flask (`app.py`) inaachwa kama akiba; haifutwi.

## Amri muhimu
```powershell
# Flask (ndani ya kompyuta)
& "..\.venv\Scripts\python.exe" app.py

# Git
git add -A ; git commit -m "..." ; git push

# Supabase (ndani ya repo; tumia npx.cmd kama `supabase` haipo kwenye PATH)
npx.cmd --yes supabase@latest migration list --remote
npx.cmd --yes supabase@latest db query --remote --read-only "select username, role, email from public.profiles;"
npx.cmd --yes supabase@latest db push --linked --yes

# Edge Functions
npx.cmd --yes supabase@latest functions deploy login --no-verify-jwt --use-api --yes
npx.cmd --yes supabase@latest functions deploy admin-reset-password --use-api --yes
npx.cmd --yes supabase@latest functions deploy complete-password-change --use-api --yes

# Email ya password ya muda (Resend)
npx.cmd --yes supabase@latest secrets set RESEND_API_KEY=re_xxxxxxxx EMAIL_FROM="ZABURI YA 23 <no-reply@domain-yako>" APP_URL="https://richardisaya522-arch.github.io/Loan-Management-System/" --project-ref ghxahscpxobuoorgyedn
```

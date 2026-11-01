# MAENDELEZO — ANTHONY MICROFINANCE

> Faili la kuendeleza kazi. Sasisha kila kikao.

## Tarehe ya mwisho
2026-11-01

## Lengo
Mfumo wa kukopesha (ANTHONY MICROFINANCE). Lengo la sasa: **app tuli (HTML/JS) + Supabase**
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
- **Admin:** `0700000000` (`role = admin`). Password ni ya muda — **ibadilishe**
  (Dashboard → Authentication → Users).
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
- Usajili/ingia (simu+password → email ya ndani `NNN@anthony.local`), dashboard ya mteja,
  kuomba mkopo, profile, maelezo ya mkopo + ratiba + saini, admin (dashboard, maombi, wateja,
  mikopo, malipo, kumbukumbu).
- Usalama wote uko Supabase (RLS + functions za `security definer`).
- **Imejaribiwa end-to-end (2026-11-01):** usajili, profile, ombi, idhini, kizuizi cha malipo
  kabla ya mkataba, saini za pande mbili, malipo, risiti, audit, na vipimo vya usalama
  (self-promote, audit insert, anon RPC) — **PASS zote**.
- **Bug iliyorekebishwa:** kitufe cha "Kataa" kilituma hoja 3 tu kwa `decide_loan`; sasa
  kinatuma zote 6 (`p_rate`, `p_months`, `p_start` = `null`).

## Inayofuata
1. **Badilisha password ya admin** (`0700000000`) kwenye Dashboard → Authentication → Users.
2. (Hiari) Ongeza UI ya kubadilisha password ndani ya app (inahitaji Edge Function).
3. (Hiari) Kizuizi cha mkopo uliochelewa (overdue) kwenye `apply_loan`.
4. (Hiari) Vipimo zaidi vya RLS / CI.

## CLI ya Supabase — hali
- `supabase init` + `link` zimefanyika; `supabase/` ina `config.toml` na migrations.
- `supabase migration list`, `supabase db query --linked "..."`, `supabase config push` zinafanya kazi.
- Config ya auth ilisasishwa kupitia Management API (captcha off, site_url/allow-list).

## Vidokezo / maamuzi
- Auth: **namba ya simu + password** (bila SMS). Simu hubadilishwa kuwa barua pepe ya ndani.
- Kubadilisha password ya mteja: Supabase Dashboard → Authentication → Users.
- Key ya umma ni `sb_publishable_...`; usalama ni RLS. Usiweke `sb_secret_...` kwenye `docs/`.
- Backup: Supabase inatunza.
- Flask (`app.py`) inaachwa kama akiba; haifutwi.

## Amri muhimu
```powershell
# Flask (ndani ya kompyuta)
& "..\.venv\Scripts\python.exe" app.py

# Git
git add -A ; git commit -m "..." ; git push

# Supabase (ndani ya repo)
supabase migration list
supabase db query --linked "select username, role from public.profiles;"
```

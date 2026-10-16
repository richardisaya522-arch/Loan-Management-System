# MAENDELEZO — ANTHONY MICROFINANCE

> Faili la kuendeleza kazi. Sasisha kila kikao.

## Tarehe ya mwisho
2026-10-16

## Lengo
Mfumo wa kukopesha (ANTHONY MICROFINANCE). Lengo la sasa: **app tuli (HTML/JS) + Supabase**
inayohost kwenye **GitHub Pages**.

## Hali kwa sasa (summary)
- Repo: https://github.com/richardisaya522-arch/Loan-Management-System (branch `main`)
- Kuna matoleo mawili:
  1. **Flask + SQLite** (`app.py`) — inaendeshwa kompyuta ya ndani. Data ni **safi** (admin pekee).
  2. **App tuli + Supabase** (`docs/`) — IMEANDIKWA; Supabase project imeundwa, config imewekwa.
- **Supabase project:** ref `ghxahscpxobuoorgyedn` (Org: richardisaya522@gmail.com's Org).
  URL: https://ghxahscpxobuoorgyedn.supabase.co
- `docs/config.js` imewekwa URL + key ya umma (`sb_publishable_...`). Key inafanya kazi.
- **Schema HAijapandishwa bado** (`/rest/v1/profiles` -> 404).

## Kilichokamilika
### Flask (app.py)
- Audit trail (`/audit`), backup/restore (`/admin/backups`), kizuizi cha mkataba kabla ya malipo,
  WAL + `DB_JOURNAL` env (kwa network FS), waitress.
- Data yote ya demo imefutwa; DB ni safi (`admin` pekee).
- CSRF, throttling, `MAX_ACTIVE_LOANS=2`, min/max mkopo, miezi max 24.

### GitHub
- `git init` + commit; imepandishwa `main`.
- `.gitignore` inazuia: `.secret_key`, `loans.db*`, `backups/`, `__pycache__/`, `server.log`, `.venv/`.

### App tuli (docs/) — IMekamilika kuandikwa
- `docs/index.html`, `docs/app.js`, `docs/style.css`, `docs/config.js`, `docs/schema.sql`
- Ina: usajili/ingia (simu+password → email ya ndani `NNN@anthony.local`), dashboard ya mteja,
  kuomba mkopo, profile, maelezo ya mkopo + ratiba + saini, admin (dashboard, maombi, wateja,
  mikopo, malipo, kumbukumbu).
- Usalama wote uko Supabase (RLS + functions za `security definer`).

## Inayofuata (hatua za kesho)
1. ✅ **Supabase project** — imeundwa (ref `ghxahscpxobuoorgyedn`).
2. ⬜ **Authentication → Providers → Email → ZIMA "Confirm email"** (lazima).
3. ⬜ **Pandisha schema** — chagua moja:
   - **A) CLI:** `supabase login` (kwa richardisaya522@gmail.com) →
     `supabase link --project-ref ghxahscpxobuoorgyedn` → `supabase db push`.
   - **B) Dashboard:** SQL Editor → endesha yote ya `supabase/migrations/*_init_schema.sql`
     (au `docs/schema.sql`).
4. ✅ **URL + key** — zimewekwa kwenye `docs/config.js`.
5. **Unda admin:** jisajili kwa namba (mf. `0700000000`), kisha SQL:
   `update public.profiles set role='admin' where username='0700000000';`
6. **GitHub Pages:** Settings → Pages → Deploy from a branch → `main` / `/docs`.
   URL: https://richardisaya522-arch.github.io/Loan-Management-System/
7. **Jaribio:** usajili, kuomba, idhini (admin), rekodi malipo, saini mkataba, angalia audit.

## CLI ya Supabase — hali
- `supabase init` imefanyika; ipo `supabase/` (`config.toml`) + migration:
  `supabase/migrations/20261016202650_init_schema.sql`.
- **Tatizo:** CLI imeingia kama `mkenyamkenyatech.tz@gmail.com`, ambaye **haina ruhusa**
  kufikia project ya `richardisaya522@gmail.com`. Hivyo `link`/`db push` zinakataa.
- **Suluhisho:** `supabase logout` kisha `supabase login` (tumia richardisaya522@gmail.com),
  au tumia njia B (SQL Editor) hapo juu.

## Vidokezo / maamuzi
- Auth: **namba ya simu + password** (bila SMS). Simu hubadilishwa kuwa barua pepe ya ndani.
- Kubadilisha password ya mteja: Supabase Dashboard → Authentication → Users.
- Key ya umma ni ya muundo mpya: `sb_publishable_...` (badala ya `anon key` ya JWT).
  Ni ya umma — usalama ni RLS. Sawa kuipandisha GitHub.
- Backup: Supabase inatunza.
- Flask (`app.py`) inaachwa kama akiba; haifutwi.

## Amri muhimu
```powershell
# Flask (ndani ya kompyuta)
& "..\.venv\Scripts\python.exe" app.py

# Git
git add -A ; git commit -m "..." ; git push
```

## Vitu vya kuzingatia baadaye
- Kizuizi cha mkopo uliochelewa (overdue) kwenye `apply_loan` — kwa sasa kimeachwa.
- Risiti/mkataba wa kuchapisha (print) — `window.print()` imo kwa maelezo ya mkopo.
- Kubadilisha password ya mteja ndani ya app (inahitaji Supabase Edge Function).
- Kuongeza vipimo/RLS tests.

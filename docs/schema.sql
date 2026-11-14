-- =====================================================================
--  ZABURI YA 23 MICROFINANCE - Supabase schema (Postgres)
--  Endesha SQL hii yote kwenye: Supabase Dashboard -> SQL Editor -> New query
-- =====================================================================

-- ---------- JEDWALI ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  email text not null default '',
  role text not null default 'customer' check (role in ('admin','customer')),
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  phone text not null default '',
  email text default '',
  address text default '',
  occupation text default '',
  guarantor_name text default '',
  guarantor_phone text default '',
  guarantor_address text default '',
  bank_name text default '',
  bank_account text default '',
  profile_done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.loans (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  principal bigint not null check (principal > 0),
  rate numeric not null default 0,
  months int not null check (months between 1 and 24),
  start_date date not null default current_date,
  decision text not null default 'pending' check (decision in ('pending','approved','rejected')),
  purpose text default '',
  review_note text default '',
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id bigint generated always as identity primary key,
  loan_id bigint not null references public.loans(id) on delete cascade,
  amount bigint not null check (amount > 0),
  paid_on date not null default current_date,
  method text not null default 'Cash',
  note text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.agreements (
  loan_id bigint primary key references public.loans(id) on delete cascade,
  borrower_sign text default '',
  borrower_witness text default '',
  borrower_place text default '',
  accepted boolean not null default false,
  lender text default '',
  lender_witness text default '',
  lender_sign text default '',
  guarantor text default '',
  guarantor_phone text default '',
  guarantor_sign text default '',
  guarantor_witness text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.audit (
  id bigint generated always as identity primary key,
  actor text,
  action text not null,
  target text,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists idx_loans_customer on public.loans(customer_id);
create index if not exists idx_loans_decision on public.loans(decision);
create index if not exists idx_pay_loan on public.payments(loan_id);
create index if not exists idx_customers_phone on public.customers(phone);
create unique index if not exists customers_user_id_key on public.customers(user_id);

-- ---------- KAZI ZA MSAIDIZI ----------
-- Je, mtumiaji wa sasa ni admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- customer_id ya mtumiaji wa sasa
create or replace function public.my_customer_id()
returns bigint language sql stable security definer set search_path = public as $$
  select id from public.customers where user_id = auth.uid() limit 1;
$$;

-- ---------- RLS ----------
alter table public.profiles   enable row level security;
alter table public.customers  enable row level security;
alter table public.loans      enable row level security;
alter table public.payments   enable row level security;
alter table public.agreements enable row level security;
alter table public.audit      enable row level security;

-- profiles: kila mtu aone yake; admin aone zote
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid() and role = 'customer');   -- HAKUNA kujipa admin
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check ((id = auth.uid() and role = 'customer') or public.is_admin());

-- customers
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers for delete to authenticated
  using (public.is_admin());

-- loans
drop policy if exists loans_select on public.loans;
create policy loans_select on public.loans for select to authenticated
  using (public.is_admin() or customer_id = public.my_customer_id());
drop policy if exists loans_delete on public.loans;
create policy loans_delete on public.loans for delete to authenticated
  using (public.is_admin());
-- (insert/update za loans hufanywa kupitia functions zenye usalama)

-- payments
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (public.is_admin() or loan_id in
    (select l.id from public.loans l where l.customer_id = public.my_customer_id()));

-- agreements
drop policy if exists agreements_select on public.agreements;
create policy agreements_select on public.agreements for select to authenticated
  using (public.is_admin() or loan_id in
    (select l.id from public.loans l where l.customer_id = public.my_customer_id()));

-- audit: admin pekee
drop policy if exists audit_select on public.audit;
create policy audit_select on public.audit for select to authenticated
  using (public.is_admin());
drop policy if exists audit_insert on public.audit;
create policy audit_insert on public.audit for insert to authenticated
  with check (public.is_admin());

-- ---------- AUXILIARY: audit kwa kila kitendo ----------
create or replace function public.audit_write(p_action text, p_target text, p_details text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor text;
begin
  select coalesce((select username from public.profiles where id = auth.uid()), 'system') into v_actor;
  insert into public.audit(actor, action, target, details) values (v_actor, p_action, p_target, p_details);
end; $$;

-- ---------- PROFILES/CUSTOMERS: unda kiotomatiki mtumiaji akipoenda ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_phone text;
  v_name  text;
begin
  v_phone := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'phone'), ''),
    nullif(btrim(new.raw_user_meta_data->>'username'), ''),
    ''
  );
  v_name := coalesce(nullif(btrim(new.raw_user_meta_data->>'name'), ''), '');

  insert into public.profiles(id, username, role, email)
    values (new.id, coalesce(nullif(v_phone, ''), new.email), 'customer', coalesce(new.email, ''))
    on conflict (id) do update set email = excluded.email;

  insert into public.customers(user_id, name, phone, email)
    values (new.id, v_name, v_phone, coalesce(new.email, ''));

  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sawazisha email ya profile/kustomer kila auth.users inabadilika
create or replace function public.sync_user_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  update public.customers
     set email = coalesce(nullif(btrim(email), ''), new.email, '')
   where user_id = new.id;
  return new;
end; $$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.sync_user_email();

-- Je, namba hii ya simu imesajiliwa? (kwa usajili wa app tuli)
create or replace function public.phone_registered(p_phone text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where username = btrim(coalesce(p_phone, ''))
  );
$$;
revoke all on function public.phone_registered(text) from public;
grant execute on function public.phone_registered(text) to anon, authenticated;

-- ---------- FUNCTIONS ZA BIASHARA ----------
-- Hifadhi profile ya mteja
create or replace function public.save_profile(
  p_name text, p_phone text, p_email text, p_address text, p_occupation text,
  p_guarantor_name text, p_guarantor_phone text, p_guarantor_address text,
  p_bank_name text, p_bank_account text
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.customers set
    name = p_name, phone = p_phone, email = p_email, address = p_address,
    occupation = p_occupation, guarantor_name = p_guarantor_name,
    guarantor_phone = p_guarantor_phone, guarantor_address = p_guarantor_address,
    bank_name = p_bank_name, bank_account = p_bank_account, profile_done = true
  where user_id = auth.uid();
  perform public.audit_write('customer.profile', 'customer', p_name);
end; $$;

-- Mteja anawasilisha ombi la mkopo
create or replace function public.apply_loan(p_principal bigint, p_months int, p_purpose text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_cid bigint; v_active int; v_has_pending boolean; v_id bigint;
begin
  select id into v_cid from public.customers
    where user_id = auth.uid() for update;
  if v_cid is null then raise exception 'Haujatambuliwa kama mteja.'; end if;

  if p_principal < 50000 or p_principal > 2000000 then
    raise exception 'Kiasi kiwe kati ya TZS 50,000 na TZS 2,000,000.';
  end if;
  if p_months < 1 or p_months > 24 then
    raise exception 'Muda uwe miezi 1 hadi 24.';
  end if;
  if length(coalesce(p_purpose,'')) < 3 then
    raise exception 'Eleza kwa ufupi mkopo utatumika kwa nini.';
  end if;

  select exists(select 1 from public.loans where customer_id = v_cid and decision = 'pending')
    into v_has_pending;
  if v_has_pending then raise exception 'Una ombi linalosubiri ukaguzi.'; end if;

  select count(*) into v_active from public.loans
    where customer_id = v_cid and decision = 'approved'
      and coalesce((select sum(amount) from public.payments where loan_id = loans.id),0)
          < (loans.principal + round(loans.principal * loans.rate / 100 * loans.months));
  if v_active >= 2 then
    raise exception 'Una mikopo % inayoendelea. Lipa mmoja kikamilifu kwanza.', v_active;
  end if;
  -- kizuizi cha marejeleo (overdue) kinaachwa kwa sasa

  insert into public.loans(customer_id, principal, rate, months, start_date, decision, purpose)
    values (v_cid, p_principal, 0, p_months, current_date, 'pending', p_purpose)
    returning id into v_id;
  perform public.audit_write('loan.apply', 'loan#' || v_id, 'amount=' || p_principal);
  return v_id;
end; $$;

-- Admin: idhini/kataa ombi
create or replace function public.decide_loan(
  p_loan_id bigint, p_action text, p_rate numeric, p_months int, p_start date, p_note text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Ruhusa imekataliwa.'; end if;
  if not exists(select 1 from public.loans where id = p_loan_id and decision = 'pending') then
    raise exception 'Ombi halipo au limeshughulikiwa.';
  end if;
  if p_action = 'approve' then
    update public.loans set decision='approved', rate=coalesce(p_rate,0),
      months=coalesce(p_months, months), start_date=coalesce(p_start, current_date),
      review_note=coalesce(p_note,'')
    where id = p_loan_id;
    perform public.audit_write('loan.approve', 'loan#' || p_loan_id, coalesce(p_note,''));
  elsif p_action = 'reject' then
    update public.loans set decision='rejected', review_note=coalesce(p_note,'')
    where id = p_loan_id;
    perform public.audit_write('loan.reject', 'loan#' || p_loan_id, coalesce(p_note,''));
  else
    raise exception 'Kitendo si sahihi.';
  end if;
end; $$;

-- Admin: rekodi malipo
create or replace function public.record_payment(
  p_loan_id bigint, p_amount bigint, p_paid_on date, p_method text, p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare v_total bigint; v_paid bigint;
begin
  if not public.is_admin() then raise exception 'Ruhusa imekataliwa.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Kiasi si sahihi.'; end if;
  if not exists (
    select 1 from public.agreements
    where loan_id = p_loan_id and accepted
      and nullif(btrim(lender_sign), '') is not null
  ) then
    raise exception 'Mkataba lazima usainiwe kabla ya kurekodi malipo.';
  end if;

  select principal + round(principal * rate / 100 * months) into v_total
    from public.loans where id = p_loan_id and decision='approved'
    for update;
  if v_total is null then raise exception 'Mkopo haupo au haujaidiwa.'; end if;
  select coalesce(sum(amount),0) into v_paid from public.payments where loan_id = p_loan_id;
  if p_amount > (v_total - v_paid) then
    raise exception 'Kiasi kinazidi deni lililobaki (TZS %).', (v_total - v_paid);
  end if;

  insert into public.payments(loan_id, amount, paid_on, method, note)
    values (p_loan_id, p_amount, coalesce(p_paid_on, current_date),
            coalesce(nullif(p_method,''),'Cash'), coalesce(p_note,''));
  perform public.audit_write('payment.create', 'loan#' || p_loan_id, 'amount=' || p_amount);
end; $$;

-- Saini mkataba
create or replace function public.sign_borrower(
  p_loan_id bigint, p_sign text, p_witness text, p_place text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.loans where id = p_loan_id and decision = 'approved') then
    raise exception 'Mkopo haupo au haujaidhinishwa.';
  end if;
  if not (public.is_admin() or exists(
      select 1 from public.loans l where l.id = p_loan_id
        and l.customer_id = public.my_customer_id())) then
    raise exception 'Ruhusa imekataliwa.';
  end if;
  if nullif(btrim(p_sign), '') is null or nullif(btrim(p_witness), '') is null
     or nullif(btrim(p_place), '') is null then
    raise exception 'Jaza saini, shahidi na mahali.';
  end if;
  insert into public.agreements(loan_id, borrower_sign, borrower_witness, borrower_place, accepted)
    values (p_loan_id, p_sign, p_witness, p_place, true)
    on conflict (loan_id) do update set
      borrower_sign = excluded.borrower_sign,
      borrower_witness = excluded.borrower_witness,
      borrower_place = excluded.borrower_place,
      accepted = true;
  perform public.audit_write('agreement.borrower_sign', 'loan#' || p_loan_id, p_sign);
end; $$;

create or replace function public.sign_lender(p_loan_id bigint, p_sign text, p_witness text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Ruhusa imekataliwa.'; end if;
  if not exists(select 1 from public.loans where id = p_loan_id and decision = 'approved') then
    raise exception 'Mkopo haupo au haujaidhinishwa.';
  end if;
  if nullif(btrim(p_sign), '') is null or nullif(btrim(p_witness), '') is null then
    raise exception 'Jaza saini na shahidi wa mkopeshaji.';
  end if;
  insert into public.agreements(loan_id, lender, lender_witness, lender_sign)
    values (p_loan_id, 'ZABURI YA 23 MICROFINANCE', p_witness, p_sign)
    on conflict (loan_id) do update set
      lender='ZABURI YA 23 MICROFINANCE',
      lender_witness = excluded.lender_witness,
      lender_sign = excluded.lender_sign;
  perform public.audit_write('agreement.lender_sign', 'loan#' || p_loan_id, p_sign);
end; $$;

-- Kumbuka: kubadilisha password ya mtumiaji mwingine hufanywa kwa Supabase Dashboard
-- (Authentication -> Users), kwani API ya admin inahitaji service_role key.

-- ---------- GRANTS (SECURITY HARDENING) ----------
-- Sehemu hii inabadilisha kazi zilizo juu kwa matoleo yenye uthibitisho mkali,
-- na inafunga anon + kuondoa maandishi ya moja kwa moja (DML) kwa authenticated.
-- Ni sawa na supabase/migrations/20261108120000_security_hardening.sql.

revoke all on schema public from anon;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles, public.customers, public.loans,
  public.payments, public.agreements, public.audit to authenticated;

create or replace function public.save_profile(
  p_name text, p_phone text, p_email text, p_address text, p_occupation text,
  p_guarantor_name text, p_guarantor_phone text, p_guarantor_address text,
  p_bank_name text, p_bank_account text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Haujatambuliwa.'; end if;
  if length(btrim(coalesce(p_name,''))) < 3 or length(coalesce(p_name,'')) > 120 then
    raise exception 'Jina liwe herufi 3 hadi 120.';
  end if;
  if coalesce(p_phone,'') !~ '^0[67][0-9]{8}$' then
    raise exception 'Namba ya simu si sahihi.';
  end if;
  if length(coalesce(p_email,'')) > 160 then raise exception 'Barua pepe ni ndefu mno.'; end if;
  if length(coalesce(p_address,'')) > 160 then raise exception 'Anwani ni ndefu mno.'; end if;
  if length(coalesce(p_occupation,'')) > 120 then raise exception 'Kazi ni ndefu mno.'; end if;
  if length(btrim(coalesce(p_guarantor_name,''))) < 3 or length(coalesce(p_guarantor_name,'')) > 120 then
    raise exception 'Jina la mdhamini liwe herufi 3 hadi 120.';
  end if;
  if coalesce(p_guarantor_phone,'') !~ '^0[67][0-9]{8}$' then
    raise exception 'Namba ya simu ya mdhamini si sahihi.';
  end if;
  if p_guarantor_phone = p_phone then
    raise exception 'Mdhamini asimame na namba yako mwenyewe.';
  end if;
  if length(coalesce(p_guarantor_address,'')) > 160 then raise exception 'Anwani ya mdhamini ni ndefu mno.'; end if;
  if length(coalesce(p_bank_name,'')) > 120 then raise exception 'Jina la benki ni ndefu mno.'; end if;
  if length(coalesce(p_bank_account,'')) > 40 then raise exception 'Namba ya akaunti ni ndefu mno.'; end if;

  update public.customers set
    name = btrim(p_name), phone = p_phone, email = coalesce(p_email,''),
    address = coalesce(p_address,''), occupation = coalesce(p_occupation,''),
    guarantor_name = btrim(p_guarantor_name),
    guarantor_phone = p_guarantor_phone,
    guarantor_address = coalesce(p_guarantor_address,''),
    bank_name = coalesce(p_bank_name,''), bank_account = coalesce(p_bank_account,''),
    profile_done = true
  where user_id = auth.uid();
  if not found then raise exception 'Rekodi ya mteja haipo.'; end if;
  perform public.audit_write('customer.profile', 'customer', btrim(p_name));
end; $$;

create or replace function public.apply_loan(p_principal bigint, p_months int, p_purpose text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_cid bigint; v_active int; v_has_pending boolean; v_id bigint; v_done boolean;
begin
  select id, profile_done into v_cid, v_done from public.customers
    where user_id = auth.uid() limit 1 for update;
  if v_cid is null then raise exception 'Haujatambuliwa kama mteja.'; end if;
  if not coalesce(v_done, false) then raise exception 'Kamilisha profile yako kwanza.'; end if;

  if p_principal is null or p_principal < 50000 or p_principal > 2000000 then
    raise exception 'Kiasi kiwe kati ya TZS 50,000 na TZS 2,000,000.';
  end if;
  if p_months is null or p_months < 1 or p_months > 24 then
    raise exception 'Muda uwe miezi 1 hadi 24.';
  end if;
  if length(btrim(coalesce(p_purpose,''))) < 3 or length(coalesce(p_purpose,'')) > 200 then
    raise exception 'Eleza kwa ufupi mkopo utatumika kwa nini (hadi herufi 200).';
  end if;

  select exists(select 1 from public.loans where customer_id = v_cid and decision = 'pending')
    into v_has_pending;
  if v_has_pending then raise exception 'Una ombi linalosubiri ukaguzi.'; end if;

  select count(*) into v_active from public.loans
    where customer_id = v_cid and decision = 'approved'
      and coalesce((select sum(amount) from public.payments where loan_id = loans.id),0)
          < (loans.principal + round(loans.principal * loans.rate / 100 * loans.months));
  if v_active >= 2 then
    raise exception 'Una mikopo % inayoendelea. Lipa mmoja kikamilifu kwanza.', v_active;
  end if;

  insert into public.loans(customer_id, principal, rate, months, start_date, decision, purpose)
    values (v_cid, p_principal, 0, p_months, current_date, 'pending', btrim(p_purpose))
    returning id into v_id;
  perform public.audit_write('loan.apply', 'loan#' || v_id, 'amount=' || p_principal);
  return v_id;
end; $$;

create or replace function public.decide_loan(
  p_loan_id bigint, p_action text, p_rate numeric, p_months int, p_start date, p_note text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Ruhusa imekataliwa.'; end if;
  if p_action not in ('approve','reject') then raise exception 'Kitendo si sahihi.'; end if;
  if length(coalesce(p_note,'')) > 300 then raise exception 'Maelezo ni marefu mno (hadi herufi 300).'; end if;
  if not exists(select 1 from public.loans where id = p_loan_id and decision = 'pending') then
    raise exception 'Ombi halipo au limeshughulikiwa.';
  end if;
  if p_action = 'approve' then
    if p_rate is null or p_rate < 0 or p_rate > 100 then
      raise exception 'Riba iwe kati ya 0 na 100.';
    end if;
    if p_months is not null and (p_months < 1 or p_months > 24) then
      raise exception 'Muda uwe miezi 1 hadi 24.';
    end if;
    update public.loans set decision='approved', rate=p_rate,
      months=coalesce(p_months, months), start_date=coalesce(p_start, current_date),
      review_note=coalesce(p_note,'')
    where id = p_loan_id;
    perform public.audit_write('loan.approve', 'loan#' || p_loan_id, coalesce(p_note,''));
  else
    update public.loans set decision='rejected', review_note=coalesce(p_note,'')
    where id = p_loan_id;
    perform public.audit_write('loan.reject', 'loan#' || p_loan_id, coalesce(p_note,''));
  end if;
end; $$;

create or replace function public.record_payment(
  p_loan_id bigint, p_amount bigint, p_paid_on date, p_method text, p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare v_total bigint; v_paid bigint;
begin
  if not public.is_admin() then raise exception 'Ruhusa imekataliwa.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Kiasi si sahihi.'; end if;
  if coalesce(p_method,'') not in ('Cash','M-Pesa','Tigo Pesa','Airtel Money','Benki') then
    raise exception 'Njia ya malipo si sahihi.';
  end if;
  if length(coalesce(p_note,'')) > 200 then raise exception 'Maelezo ni marefu mno (hadi herufi 200).'; end if;
  if not exists (
    select 1 from public.agreements
    where loan_id = p_loan_id and accepted
      and nullif(btrim(lender_sign), '') is not null
  ) then
    raise exception 'Mkataba lazima usainiwe kabla ya kurekodi malipo.';
  end if;

  select principal + round(principal * rate / 100 * months) into v_total
    from public.loans where id = p_loan_id and decision='approved'
    for update;
  if v_total is null then raise exception 'Mkopo haupo au haujaidiwa.'; end if;
  select coalesce(sum(amount),0) into v_paid from public.payments where loan_id = p_loan_id;
  if p_amount > (v_total - v_paid) then
    raise exception 'Kiasi kinazidi deni lililobaki (TZS %).', (v_total - v_paid);
  end if;

  insert into public.payments(loan_id, amount, paid_on, method, note)
    values (p_loan_id, p_amount, coalesce(p_paid_on, current_date),
            p_method, coalesce(p_note,''));
  perform public.audit_write('payment.create', 'loan#' || p_loan_id, 'amount=' || p_amount);
end; $$;

create or replace function public.sign_borrower(
  p_loan_id bigint, p_sign text, p_witness text, p_place text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.loans where id = p_loan_id and decision = 'approved') then
    raise exception 'Mkopo haupo au haujaidhinishwa.';
  end if;
  if not (public.is_admin() or exists(
      select 1 from public.loans l where l.id = p_loan_id
        and l.customer_id = public.my_customer_id())) then
    raise exception 'Ruhusa imekataliwa.';
  end if;
  if length(btrim(coalesce(p_sign,''))) < 2 or length(coalesce(p_sign,'')) > 80 then
    raise exception 'Saini iwe herufi 2 hadi 80.';
  end if;
  if length(btrim(coalesce(p_witness,''))) < 3 or length(coalesce(p_witness,'')) > 80 then
    raise exception 'Jina la shahidi liwe herufi 3 hadi 80.';
  end if;
  if length(btrim(coalesce(p_place,''))) < 2 or length(coalesce(p_place,'')) > 120 then
    raise exception 'Mahali pawe herufi 2 hadi 120.';
  end if;
  insert into public.agreements(loan_id, borrower_sign, borrower_witness, borrower_place, accepted)
    values (p_loan_id, btrim(p_sign), btrim(p_witness), btrim(p_place), true)
    on conflict (loan_id) do update set
      borrower_sign = excluded.borrower_sign,
      borrower_witness = excluded.borrower_witness,
      borrower_place = excluded.borrower_place,
      accepted = true;
  perform public.audit_write('agreement.borrower_sign', 'loan#' || p_loan_id, btrim(p_sign));
end; $$;

create or replace function public.sign_lender(p_loan_id bigint, p_sign text, p_witness text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Ruhusa imekataliwa.'; end if;
  if not exists(select 1 from public.loans where id = p_loan_id and decision = 'approved') then
    raise exception 'Mkopo haupo au haujaidhinishwa.';
  end if;
  if length(btrim(coalesce(p_sign,''))) < 2 or length(coalesce(p_sign,'')) > 80 then
    raise exception 'Saini iwe herufi 2 hadi 80.';
  end if;
  if length(btrim(coalesce(p_witness,''))) < 3 or length(coalesce(p_witness,'')) > 80 then
    raise exception 'Jina la shahidi liwe herufi 3 hadi 80.';
  end if;
  insert into public.agreements(loan_id, lender, lender_witness, lender_sign)
    values (p_loan_id, 'ZABURI YA 23 MICROFINANCE', btrim(p_witness), btrim(p_sign))
    on conflict (loan_id) do update set
      lender = 'ZABURI YA 23 MICROFINANCE',
      lender_witness = excluded.lender_witness,
      lender_sign = excluded.lender_sign;
  perform public.audit_write('agreement.lender_sign', 'loan#' || p_loan_id, btrim(p_sign));
end; $$;

create or replace function public.audit_write(p_action text, p_target text, p_details text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor text;
begin
  select coalesce((select username from public.profiles where id = auth.uid()), 'system') into v_actor;
  insert into public.audit(actor, action, target, details)
    values (left(v_actor, 80), left(coalesce(p_action,''), 80),
            left(coalesce(p_target,''), 120), left(coalesce(p_details,''), 300));
end; $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.phone_registered(text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_customer_id() to authenticated;
grant execute on function public.save_profile(text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.apply_loan(bigint, int, text) to authenticated;
grant execute on function public.decide_loan(bigint, text, numeric, int, date, text) to authenticated;
grant execute on function public.record_payment(bigint, bigint, date, text, text) to authenticated;
grant execute on function public.sign_borrower(bigint, text, text, text) to authenticated;
grant execute on function public.sign_lender(bigint, text, text) to authenticated;

select pg_notify('pgrst', 'reload schema');

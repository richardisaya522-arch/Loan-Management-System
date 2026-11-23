-- =====================================================================
--  Saini za wahusika wote kwenye mkataba + taarifa za mkopeshaji za kati
--  Endesha kwenye Supabase Dashboard -> SQL Editor -> New query.
--  (Sawa na docs/schema.sql; salama kurudia mara nyingi.)
-- =====================================================================

alter table public.agreements add column if not exists borrower_witness_sign text default '';
alter table public.agreements add column if not exists lender_witness_sign text default '';
alter table public.agreements add column if not exists guarantor_witness_sign text default '';

create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  lender_name text not null default 'ZABURI YA 23 MICROFINANCE',
  lender_witness text not null default '',
  lender_witness_sign text not null default '',
  lender_sign text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.app_settings(id) values (true) on conflict (id) do nothing;

revoke insert, update, delete, truncate, references, trigger
  on public.app_settings from authenticated;
grant select on public.app_settings to authenticated;

-- Saini inakubalika ikiwa ni jina kamili au mtindo wa A.C. mwanjoka.
create or replace function public.signature_matches(p_sign text, p_name text)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  v_name text := lower(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')));
  v_sign text := lower(btrim(regexp_replace(coalesce(p_sign, ''), '\s+', ' ', 'g')));
  v_words text[] := string_to_array(v_name, ' ');
  v_initials text := '';
  v_i int;
begin
  if coalesce(v_name, '') = '' then return false; end if;
  if v_sign = v_name then return true; end if;
  if coalesce(array_length(v_words, 1), 0) < 2 then return false; end if;
  for v_i in 1..array_length(v_words, 1) - 1 loop
    v_initials := v_initials || left(v_words[v_i], 1) || '.';
  end loop;
  return v_sign = v_initials || ' ' || v_words[array_length(v_words, 1)];
end; $$;

-- Taarifa za mkopeshaji zinazotumika kwenye mikataba yote.
create or replace function public.get_app_settings()
returns table (lender_name text, lender_witness text,
               lender_witness_sign text, lender_sign text)
language sql stable set search_path = public as $$
  select s.lender_name, s.lender_witness, s.lender_witness_sign, s.lender_sign
  from public.app_settings s where s.id;
$$;

-- Admin anapobadilisha taarifa, mikataba yote iliyopo inasasishwa mara moja.
create or replace function public.save_app_settings(
  p_lender_name text, p_lender_witness text,
  p_lender_witness_sign text, p_lender_sign text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_lender_name, ''));
  v_witness text := btrim(coalesce(p_lender_witness, ''));
  v_wsign text := btrim(coalesce(p_lender_witness_sign, ''));
  v_sign text := btrim(coalesce(p_lender_sign, ''));
begin
  if not public.is_admin() then raise exception 'Ruhusa imekataliwa.'; end if;
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'Jina la mkopeshaji liwe herufi 3 hadi 120.';
  end if;
  if length(v_witness) < 3 or length(v_witness) > 120 then
    raise exception 'Jina la shahidi liwe herufi 3 hadi 120.';
  end if;
  if length(v_wsign) < 2 or length(v_wsign) > 80 then
    raise exception 'Saini ya shahidi iwe herufi 2 hadi 80.';
  end if;
  if length(v_sign) < 2 or length(v_sign) > 80 then
    raise exception 'Saini ya mkopeshaji iwe herufi 2 hadi 80.';
  end if;

  update public.app_settings set
    lender_name = v_name, lender_witness = v_witness,
    lender_witness_sign = v_wsign, lender_sign = v_sign, updated_at = now()
  where id;
  update public.agreements set
    lender = v_name, lender_witness = v_witness,
    lender_witness_sign = v_wsign, lender_sign = v_sign;
  perform public.audit_write('settings.lender_update', 'settings', v_name);
end; $$;

-- Saini ya mkopaji: sasa kuna pia saini ya shahidi wake.
create or replace function public.sign_borrower(
  p_loan_id bigint, p_sign text, p_witness text, p_witness_sign text, p_place text
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
  if length(btrim(coalesce(p_witness_sign,''))) < 2 or length(coalesce(p_witness_sign,'')) > 80 then
    raise exception 'Saini ya shahidi iwe herufi 2 hadi 80.';
  end if;
  if length(btrim(coalesce(p_place,''))) < 2 or length(coalesce(p_place,'')) > 120 then
    raise exception 'Mahali pawe herufi 2 hadi 120.';
  end if;
  insert into public.agreements(loan_id, borrower_sign, borrower_witness,
    borrower_witness_sign, borrower_place, accepted)
    values (p_loan_id, btrim(p_sign), btrim(p_witness),
            btrim(p_witness_sign), btrim(p_place), true)
    on conflict (loan_id) do update set
      borrower_sign = excluded.borrower_sign,
      borrower_witness = excluded.borrower_witness,
      borrower_witness_sign = excluded.borrower_witness_sign,
      borrower_place = excluded.borrower_place,
      accepted = true;
  perform public.audit_write('agreement.borrower_sign', 'loan#' || p_loan_id, btrim(p_sign));
end; $$;

-- Saini ya mkopeshaji na ya shahidi wake; jina la mkopeshaji linatoka kwenye settings.
create or replace function public.sign_lender(
  p_loan_id bigint, p_sign text, p_witness text, p_witness_sign text
) returns void language plpgsql security definer set search_path = public as $$
declare v_lender text;
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
  if length(btrim(coalesce(p_witness_sign,''))) < 2 or length(coalesce(p_witness_sign,'')) > 80 then
    raise exception 'Saini ya shahidi iwe herufi 2 hadi 80.';
  end if;
  select lender_name into v_lender from public.app_settings where id;
  insert into public.agreements(loan_id, lender, lender_witness, lender_witness_sign, lender_sign)
    values (p_loan_id, coalesce(v_lender, 'ZABURI YA 23 MICROFINANCE'),
            btrim(p_witness), btrim(p_witness_sign), btrim(p_sign))
    on conflict (loan_id) do update set
      lender = excluded.lender, lender_witness = excluded.lender_witness,
      lender_witness_sign = excluded.lender_witness_sign,
      lender_sign = excluded.lender_sign;
  perform public.audit_write('agreement.lender_sign', 'loan#' || p_loan_id, btrim(p_sign));
end; $$;

-- Ombi pamoja na mkataba kamili (saini za mashahidi zimeongezwa).
create or replace function public.apply_loan_contract(
  p_principal bigint, p_months int, p_purpose text, p_place text, p_signed_on date,
  p_borrower_witness text, p_borrower_witness_sign text, p_borrower_sign text,
  p_guarantor_sign text, p_guarantor_witness text, p_guarantor_witness_sign text,
  p_collateral_1 text, p_collateral_2 text, p_collateral_3 text, p_collateral_value bigint
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_cid bigint; v_done boolean; v_name text; v_gname text; v_gphone text;
  v_active int; v_has_pending boolean; v_id bigint;
  v_lender text;
  v_place text := btrim(coalesce(p_place, ''));
  v_purpose text := btrim(coalesce(p_purpose, ''));
  v_bw text := btrim(coalesce(p_borrower_witness, ''));
  v_bws text := btrim(coalesce(p_borrower_witness_sign, ''));
  v_bs text := btrim(coalesce(p_borrower_sign, ''));
  v_gs text := btrim(coalesce(p_guarantor_sign, ''));
  v_gw text := btrim(coalesce(p_guarantor_witness, ''));
  v_gws text := btrim(coalesce(p_guarantor_witness_sign, ''));
  v_c1 text := btrim(coalesce(p_collateral_1, ''));
  v_c2 text := btrim(coalesce(p_collateral_2, ''));
  v_c3 text := btrim(coalesce(p_collateral_3, ''));
begin
  select id, profile_done, name, guarantor_name, guarantor_phone
    into v_cid, v_done, v_name, v_gname, v_gphone from public.customers
    where user_id = auth.uid() limit 1 for update;
  if v_cid is null then raise exception 'Haujatambuliwa kama mteja.'; end if;
  if not coalesce(v_done, false) then raise exception 'Kamilisha profile yako kwanza.'; end if;
  if p_principal is null or p_principal < 50000 or p_principal > 2000000 then
    raise exception 'Kiasi kiwe kati ya TZS 50,000 na TZS 2,000,000.';
  end if;
  if p_months is null or p_months < 1 or p_months > 24 then
    raise exception 'Muda uwe miezi 1 hadi 24.';
  end if;
  if length(v_purpose) < 3 or length(v_purpose) > 200 then
    raise exception 'Eleza kwa ufupi mkopo utatumika kwa nini (hadi herufi 200).';
  end if;
  if length(v_place) < 3 or length(v_place) > 120 then
    raise exception 'Mahali pawe herufi 3 hadi 120.';
  end if;
  if p_signed_on is null or p_signed_on > current_date then
    raise exception 'Weka tarehe sahihi ya kusaini.';
  end if;
  if length(v_bw) < 3 or length(v_bw) > 80 then
    raise exception 'Jina la shahidi wa mkopaji liwe herufi 3 hadi 80.';
  end if;
  if length(v_bws) < 2 or length(v_bws) > 80 then
    raise exception 'Saini ya shahidi wa mkopaji iwe herufi 2 hadi 80.';
  end if;
  if length(v_bs) < 2 or length(v_bs) > 80 or not public.signature_matches(v_bs, v_name) then
    raise exception 'Saini ya mkopaji iwe kama jina lako au mtindo wa A.C. mwanjoka: %.', v_name;
  end if;
  if length(v_gs) < 2 or length(v_gs) > 80 then
    raise exception 'Saini ya mdhamini iwe herufi 2 hadi 80.';
  end if;
  if nullif(btrim(coalesce(v_gname, '')), '') is not null
     and not public.signature_matches(v_gs, v_gname) then
    raise exception 'Saini ya mdhamini iwe kama jina la mdhamini: %.', v_gname;
  end if;
  if length(v_gw) < 3 or length(v_gw) > 80 then
    raise exception 'Jina la shahidi wa mdhamini liwe herufi 3 hadi 80.';
  end if;
  if length(v_gws) < 2 or length(v_gws) > 80 then
    raise exception 'Saini ya shahidi wa mdhamini iwe herufi 2 hadi 80.';
  end if;
  if length(v_c1) < 3 or length(v_c1) > 160 or length(v_c2) > 160 or length(v_c3) > 160 then
    raise exception 'Weka dhamana sahihi (hadi herufi 160).';
  end if;
  if p_collateral_value is null or p_collateral_value <= 0 then
    raise exception 'Weka thamani sahihi ya dhamana.';
  end if;
  select exists(select 1 from public.loans where customer_id = v_cid and decision = 'pending')
    into v_has_pending;
  if v_has_pending then raise exception 'Una ombi linalosubiri ukaguzi.'; end if;
  select count(*) into v_active from public.loans
    where customer_id = v_cid and decision = 'approved'
      and coalesce((select sum(amount) from public.payments where loan_id = loans.id), 0)
          < (loans.principal + round(loans.principal * loans.rate / 100 * loans.months));
  if v_active >= 2 then
    raise exception 'Una mikopo % inayoendelea. Lipa mmoja kikamilifu kwanza.', v_active;
  end if;
  select lender_name into v_lender from public.app_settings where id;
  insert into public.loans(customer_id, principal, rate, months, start_date, decision, purpose)
    values (v_cid, p_principal, 0, p_months, current_date, 'pending', v_purpose)
    returning id into v_id;
  insert into public.agreements(
    loan_id, borrower_sign, borrower_witness, borrower_witness_sign, borrower_place, signed_on,
    accepted, lender, guarantor, guarantor_phone, guarantor_sign, guarantor_witness,
    guarantor_witness_sign, collateral_1, collateral_2, collateral_3, collateral_value
  ) values (
    v_id, v_bs, v_bw, v_bws, v_place, p_signed_on,
    true, coalesce(v_lender, 'ZABURI YA 23 MICROFINANCE'), coalesce(v_gname, ''),
    coalesce(v_gphone, ''), v_gs, v_gw, v_gws, v_c1, v_c2, v_c3, p_collateral_value
  );
  perform public.audit_write('loan.apply_contract', 'loan#' || v_id, 'amount=' || p_principal);
  return v_id;
end; $$;

-- Marekebisho ya mkataba uliosubiri (saini za mashahidi zimeongezwa).
create or replace function public.resubmit_loan_contract(
  p_loan_id bigint, p_principal bigint, p_months int, p_purpose text, p_place text,
  p_signed_on date, p_borrower_witness text, p_borrower_witness_sign text,
  p_borrower_sign text, p_guarantor_sign text, p_guarantor_witness text,
  p_guarantor_witness_sign text, p_collateral_1 text, p_collateral_2 text,
  p_collateral_3 text, p_collateral_value bigint
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_cid bigint; v_decision text; v_name text; v_gname text; v_gphone text;
  v_place text := btrim(coalesce(p_place, ''));
  v_purpose text := btrim(coalesce(p_purpose, ''));
  v_bw text := btrim(coalesce(p_borrower_witness, ''));
  v_bws text := btrim(coalesce(p_borrower_witness_sign, ''));
  v_bs text := btrim(coalesce(p_borrower_sign, ''));
  v_gs text := btrim(coalesce(p_guarantor_sign, ''));
  v_gw text := btrim(coalesce(p_guarantor_witness, ''));
  v_gws text := btrim(coalesce(p_guarantor_witness_sign, ''));
  v_c1 text := btrim(coalesce(p_collateral_1, ''));
  v_c2 text := btrim(coalesce(p_collateral_2, ''));
  v_c3 text := btrim(coalesce(p_collateral_3, ''));
begin
  select l.customer_id, l.decision, c.name, c.guarantor_name, c.guarantor_phone
    into v_cid, v_decision, v_name, v_gname, v_gphone
    from public.loans l join public.customers c on c.id = l.customer_id
    where l.id = p_loan_id and l.customer_id = public.my_customer_id() for update of l;
  if v_cid is null then raise exception 'Ombi halipo au si lako.'; end if;
  if v_decision <> 'pending' then
    raise exception 'Ombi limeshughulikiwa; haliwezi kubadilishwa.';
  end if;
  if p_principal is null or p_principal < 50000 or p_principal > 2000000 then
    raise exception 'Kiasi kiwe kati ya TZS 50,000 na TZS 2,000,000.';
  end if;
  if p_months is null or p_months < 1 or p_months > 24 then
    raise exception 'Muda uwe miezi 1 hadi 24.';
  end if;
  if length(v_purpose) < 3 or length(v_purpose) > 200 then
    raise exception 'Eleza kwa ufupi mkopo utatumika kwa nini (hadi herufi 200).';
  end if;
  if length(v_place) < 3 or length(v_place) > 120 then
    raise exception 'Mahali pawe herufi 3 hadi 120.';
  end if;
  if p_signed_on is null or p_signed_on > current_date then
    raise exception 'Weka tarehe sahihi ya kusaini.';
  end if;
  if length(v_bw) < 3 or length(v_bw) > 80 then
    raise exception 'Jina la shahidi wa mkopaji liwe herufi 3 hadi 80.';
  end if;
  if length(v_bws) < 2 or length(v_bws) > 80 then
    raise exception 'Saini ya shahidi wa mkopaji iwe herufi 2 hadi 80.';
  end if;
  if length(v_bs) < 2 or length(v_bs) > 80 or not public.signature_matches(v_bs, v_name) then
    raise exception 'Saini ya mkopaji iwe kama jina lako au mtindo wa A.C. mwanjoka: %.', v_name;
  end if;
  if length(v_gs) < 2 or length(v_gs) > 80 then
    raise exception 'Saini ya mdhamini iwe herufi 2 hadi 80.';
  end if;
  if nullif(btrim(coalesce(v_gname, '')), '') is not null
     and not public.signature_matches(v_gs, v_gname) then
    raise exception 'Saini ya mdhamini iwe kama jina la mdhamini: %.', v_gname;
  end if;
  if length(v_gw) < 3 or length(v_gw) > 80 then
    raise exception 'Jina la shahidi wa mdhamini liwe herufi 3 hadi 80.';
  end if;
  if length(v_gws) < 2 or length(v_gws) > 80 then
    raise exception 'Saini ya shahidi wa mdhamini iwe herufi 2 hadi 80.';
  end if;
  if length(v_c1) < 3 or length(v_c1) > 160 or length(v_c2) > 160 or length(v_c3) > 160 then
    raise exception 'Weka dhamana sahihi (hadi herufi 160).';
  end if;
  if p_collateral_value is null or p_collateral_value <= 0 then
    raise exception 'Weka thamani sahihi ya dhamana.';
  end if;
  update public.loans set principal = p_principal, months = p_months,
    purpose = v_purpose, review_note = '' where id = p_loan_id;
  insert into public.agreements(
    loan_id, borrower_sign, borrower_witness, borrower_witness_sign, borrower_place, signed_on,
    accepted, lender, guarantor, guarantor_phone, guarantor_sign, guarantor_witness,
    guarantor_witness_sign, collateral_1, collateral_2, collateral_3, collateral_value
  ) values (
    p_loan_id, v_bs, v_bw, v_bws, v_place, p_signed_on,
    true, coalesce((select lender_name from public.app_settings where id),
                   'ZABURI YA 23 MICROFINANCE'),
    coalesce(v_gname, ''), coalesce(v_gphone, ''), v_gs, v_gw, v_gws,
    v_c1, v_c2, v_c3, p_collateral_value
  )
  on conflict (loan_id) do update set
    borrower_sign = excluded.borrower_sign, borrower_witness = excluded.borrower_witness,
    borrower_witness_sign = excluded.borrower_witness_sign,
    borrower_place = excluded.borrower_place, signed_on = excluded.signed_on,
    accepted = true, lender = excluded.lender, guarantor = excluded.guarantor,
    guarantor_phone = excluded.guarantor_phone, guarantor_sign = excluded.guarantor_sign,
    guarantor_witness = excluded.guarantor_witness,
    guarantor_witness_sign = excluded.guarantor_witness_sign,
    collateral_1 = excluded.collateral_1, collateral_2 = excluded.collateral_2,
    collateral_3 = excluded.collateral_3, collateral_value = excluded.collateral_value;
  perform public.audit_write('loan.resubmit_contract', 'loan#' || p_loan_id, 'amount=' || p_principal);
end; $$;

revoke execute on function public.signature_matches(text, text) from public, anon;
revoke execute on function public.get_app_settings() from public, anon;
revoke execute on function public.save_app_settings(text, text, text, text) from public, anon;
grant execute on function public.signature_matches(text, text) to authenticated;
grant execute on function public.get_app_settings() to authenticated;
grant execute on function public.save_app_settings(text, text, text, text) to authenticated;
grant execute on function public.sign_borrower(bigint, text, text, text, text) to authenticated;
grant execute on function public.sign_lender(bigint, text, text, text) to authenticated;
grant execute on function public.apply_loan_contract(
  bigint, int, text, text, date, text, text, text, text, text, text, text, text, text, bigint
) to authenticated;
grant execute on function public.resubmit_loan_contract(
  bigint, bigint, int, text, text, date, text, text, text, text, text, text, text, text, text, bigint
) to authenticated;

select pg_notify('pgrst', 'reload schema');

-- =====================================================================
--  SECURITY HARDENING (2026-11-08)
--  Kwa ajili ya toleo la GitHub Pages + Supabase.
--  Ni idempotent: unaweza kuendesha mara nyingi.
-- =====================================================================

-- 1) ANON: hakuna ruhusa yoyote kwenye schema ya public.
revoke all on schema public from anon;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- 2) AUTHENTICATED: SELECT pekee moja kwa moja. Maandishi yote kupitia functions.
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles, public.customers, public.loans,
  public.payments, public.agreements, public.audit to authenticated;

-- 3) save_profile: uthibitisho wa data upande wa database.
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

-- 4) apply_loan: hakikisha profile imekamilika na maandishi hayazidi kikomo.
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

-- 5) decide_loan: thibitisha riba, miezi na maelezo.
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

-- 6) record_payment: njia halali na maelezo yenye kikomo.
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

-- 7) sign_borrower: urefu wa saini/shahidi/mahali.
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

-- 8) sign_lender: urefu wa saini/shahidi.
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

-- 9) audit_write: kikomo cha urefu (kinga ya data nyingi mno).
create or replace function public.audit_write(p_action text, p_target text, p_details text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor text;
begin
  select coalesce((select username from public.profiles where id = auth.uid()), 'system') into v_actor;
  insert into public.audit(actor, action, target, details)
    values (left(v_actor, 80), left(coalesce(p_action,''), 80),
            left(coalesce(p_target,''), 120), left(coalesce(p_details,''), 300));
end; $$;

-- 10) Functions: zisitekelezwe na public/anon; authenticated apewe zile za app.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_customer_id() to authenticated;
grant execute on function public.save_profile(text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.apply_loan(bigint, int, text) to authenticated;
grant execute on function public.decide_loan(bigint, text, numeric, int, date, text) to authenticated;
grant execute on function public.record_payment(bigint, bigint, date, text, text) to authenticated;
grant execute on function public.sign_borrower(bigint, text, text, text) to authenticated;
grant execute on function public.sign_lender(bigint, text, text) to authenticated;

select pg_notify('pgrst', 'reload schema');

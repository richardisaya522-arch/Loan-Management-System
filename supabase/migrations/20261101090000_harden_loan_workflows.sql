-- Prevent self-promotion to admin and apply workflow checks on the database.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check ((id = auth.uid() and role = 'customer') or public.is_admin());

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

  insert into public.loans(customer_id, principal, rate, months, start_date, decision, purpose)
    values (v_cid, p_principal, 0, p_months, current_date, 'pending', p_purpose)
    returning id into v_id;
  perform public.audit_write('loan.apply', 'loan#' || v_id, 'amount=' || p_principal);
  return v_id;
end; $$;

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
    from public.loans where id = p_loan_id and decision = 'approved'
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
    values (p_loan_id, 'ANTHONY MICROFINANCE', p_witness, p_sign)
    on conflict (loan_id) do update set
      lender = 'ANTHONY MICROFINANCE',
      lender_witness = excluded.lender_witness,
      lender_sign = excluded.lender_sign;
  perform public.audit_write('agreement.lender_sign', 'loan#' || p_loan_id, p_sign);
end; $$;

revoke insert, update, delete on public.audit from authenticated;
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

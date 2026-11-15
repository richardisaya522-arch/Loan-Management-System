-- =====================================================================
--  MKATABA KAMILI WAKATI WA OMBI (2026-11-15)
--  - Mteja anajaza mkataba (mahali, tarehe, shahidi, mdhamini, dhamana)
--  - Admin anaona mkataba na anaweza kutuma ujumbe wa marekebisho
--  - Mteja anaweza kurekebisha na kutuma tena akiwa pending
-- =====================================================================

alter table public.agreements add column if not exists signed_on date;
alter table public.agreements add column if not exists collateral_1 text default '';
alter table public.agreements add column if not exists collateral_2 text default '';
alter table public.agreements add column if not exists collateral_3 text default '';
alter table public.agreements add column if not exists collateral_value bigint;

create or replace function public.apply_loan_contract(
  p_principal bigint,
  p_months int,
  p_purpose text,
  p_place text,
  p_signed_on date,
  p_borrower_witness text,
  p_borrower_sign text,
  p_guarantor_sign text,
  p_guarantor_witness text,
  p_collateral_1 text,
  p_collateral_2 text,
  p_collateral_3 text,
  p_collateral_value bigint
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_cid bigint;
  v_done boolean;
  v_name text;
  v_gname text;
  v_gphone text;
  v_active int;
  v_has_pending boolean;
  v_id bigint;
  v_place text := btrim(coalesce(p_place, ''));
  v_purpose text := btrim(coalesce(p_purpose, ''));
  v_bw text := btrim(coalesce(p_borrower_witness, ''));
  v_bs text := btrim(coalesce(p_borrower_sign, ''));
  v_gs text := btrim(coalesce(p_guarantor_sign, ''));
  v_gw text := btrim(coalesce(p_guarantor_witness, ''));
  v_c1 text := btrim(coalesce(p_collateral_1, ''));
  v_c2 text := btrim(coalesce(p_collateral_2, ''));
  v_c3 text := btrim(coalesce(p_collateral_3, ''));
begin
  select id, profile_done, name, guarantor_name, guarantor_phone
    into v_cid, v_done, v_name, v_gname, v_gphone
    from public.customers
    where user_id = auth.uid()
    limit 1
    for update;
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
  if p_signed_on is null then raise exception 'Weka tarehe ya kusaini.'; end if;
  if p_signed_on > current_date then raise exception 'Tarehe ya kusaini isizidi leo.'; end if;
  if length(v_bw) < 3 or length(v_bw) > 80 then
    raise exception 'Jina la shahidi wa mkopaji liwe herufi 3 hadi 80.';
  end if;
  if length(v_bs) < 2 or length(v_bs) > 80 then
    raise exception 'Saini ya mkopaji iwe herufi 2 hadi 80.';
  end if;
  if lower(btrim(regexp_replace(v_bs, '\s+', ' ', 'g'))) <>
     lower(btrim(regexp_replace(coalesce(v_name, ''), '\s+', ' ', 'g'))) then
    raise exception 'Saini ya mkopaji iwe kama jina lako: %.', v_name;
  end if;
  if length(v_gs) < 2 or length(v_gs) > 80 then
    raise exception 'Saini ya mdhamini iwe herufi 2 hadi 80.';
  end if;
  if nullif(btrim(coalesce(v_gname, '')), '') is not null and
     lower(btrim(regexp_replace(v_gs, '\s+', ' ', 'g'))) <>
     lower(btrim(regexp_replace(v_gname, '\s+', ' ', 'g'))) then
    raise exception 'Saini ya mdhamini iwe kama jina la mdhamini: %.', v_gname;
  end if;
  if length(v_gw) < 3 or length(v_gw) > 80 then
    raise exception 'Jina la shahidi wa mdhamini liwe herufi 3 hadi 80.';
  end if;
  if length(v_c1) < 3 or length(v_c1) > 160 then
    raise exception 'Dhamana ya kwanza iwe herufi 3 hadi 160.';
  end if;
  if length(v_c2) > 160 or length(v_c3) > 160 then
    raise exception 'Dhamana ya pili au tatu ni ndefu mno (hadi herufi 160).';
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

  insert into public.loans(customer_id, principal, rate, months, start_date, decision, purpose)
    values (v_cid, p_principal, 0, p_months, current_date, 'pending', v_purpose)
    returning id into v_id;

  insert into public.agreements(
    loan_id, borrower_sign, borrower_witness, borrower_place, signed_on,
    accepted, lender, guarantor, guarantor_phone, guarantor_sign, guarantor_witness,
    collateral_1, collateral_2, collateral_3, collateral_value
  ) values (
    v_id, v_bs, v_bw, v_place, p_signed_on,
    true, 'ZABURI YA 23 MICROFINANCE', coalesce(v_gname, ''), coalesce(v_gphone, ''), v_gs, v_gw,
    v_c1, v_c2, v_c3, p_collateral_value
  );

  perform public.audit_write('loan.apply_contract', 'loan#' || v_id, 'amount=' || p_principal);
  return v_id;
end; $$;

create or replace function public.resubmit_loan_contract(
  p_loan_id bigint,
  p_principal bigint,
  p_months int,
  p_purpose text,
  p_place text,
  p_signed_on date,
  p_borrower_witness text,
  p_borrower_sign text,
  p_guarantor_sign text,
  p_guarantor_witness text,
  p_collateral_1 text,
  p_collateral_2 text,
  p_collateral_3 text,
  p_collateral_value bigint
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_cid bigint;
  v_decision text;
  v_name text;
  v_gname text;
  v_gphone text;
  v_place text := btrim(coalesce(p_place, ''));
  v_purpose text := btrim(coalesce(p_purpose, ''));
  v_bw text := btrim(coalesce(p_borrower_witness, ''));
  v_bs text := btrim(coalesce(p_borrower_sign, ''));
  v_gs text := btrim(coalesce(p_guarantor_sign, ''));
  v_gw text := btrim(coalesce(p_guarantor_witness, ''));
  v_c1 text := btrim(coalesce(p_collateral_1, ''));
  v_c2 text := btrim(coalesce(p_collateral_2, ''));
  v_c3 text := btrim(coalesce(p_collateral_3, ''));
begin
  select l.customer_id, l.decision, c.name, c.guarantor_name, c.guarantor_phone
    into v_cid, v_decision, v_name, v_gname, v_gphone
    from public.loans l
    join public.customers c on c.id = l.customer_id
    where l.id = p_loan_id and l.customer_id = public.my_customer_id()
    for update of l;
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
  if p_signed_on is null then raise exception 'Weka tarehe ya kusaini.'; end if;
  if p_signed_on > current_date then raise exception 'Tarehe ya kusaini isizidi leo.'; end if;
  if length(v_bw) < 3 or length(v_bw) > 80 then
    raise exception 'Jina la shahidi wa mkopaji liwe herufi 3 hadi 80.';
  end if;
  if length(v_bs) < 2 or length(v_bs) > 80 then
    raise exception 'Saini ya mkopaji iwe herufi 2 hadi 80.';
  end if;
  if lower(btrim(regexp_replace(v_bs, '\s+', ' ', 'g'))) <>
     lower(btrim(regexp_replace(coalesce(v_name, ''), '\s+', ' ', 'g'))) then
    raise exception 'Saini ya mkopaji iwe kama jina lako: %.', v_name;
  end if;
  if length(v_gs) < 2 or length(v_gs) > 80 then
    raise exception 'Saini ya mdhamini iwe herufi 2 hadi 80.';
  end if;
  if nullif(btrim(coalesce(v_gname, '')), '') is not null and
     lower(btrim(regexp_replace(v_gs, '\s+', ' ', 'g'))) <>
     lower(btrim(regexp_replace(v_gname, '\s+', ' ', 'g'))) then
    raise exception 'Saini ya mdhamini iwe kama jina la mdhamini: %.', v_gname;
  end if;
  if length(v_gw) < 3 or length(v_gw) > 80 then
    raise exception 'Jina la shahidi wa mdhamini liwe herufi 3 hadi 80.';
  end if;
  if length(v_c1) < 3 or length(v_c1) > 160 then
    raise exception 'Dhamana ya kwanza iwe herufi 3 hadi 160.';
  end if;
  if length(v_c2) > 160 or length(v_c3) > 160 then
    raise exception 'Dhamana ya pili au tatu ni ndefu mno (hadi herufi 160).';
  end if;
  if p_collateral_value is null or p_collateral_value <= 0 then
    raise exception 'Weka thamani sahihi ya dhamana.';
  end if;

  update public.loans
    set principal = p_principal, months = p_months, purpose = v_purpose, review_note = ''
    where id = p_loan_id;

  insert into public.agreements(
    loan_id, borrower_sign, borrower_witness, borrower_place, signed_on,
    accepted, lender, guarantor, guarantor_phone, guarantor_sign, guarantor_witness,
    collateral_1, collateral_2, collateral_3, collateral_value
  ) values (
    p_loan_id, v_bs, v_bw, v_place, p_signed_on,
    true, 'ZABURI YA 23 MICROFINANCE', coalesce(v_gname, ''), coalesce(v_gphone, ''), v_gs, v_gw,
    v_c1, v_c2, v_c3, p_collateral_value
  )
  on conflict (loan_id) do update set
    borrower_sign = excluded.borrower_sign,
    borrower_witness = excluded.borrower_witness,
    borrower_place = excluded.borrower_place,
    signed_on = excluded.signed_on,
    accepted = true,
    lender = excluded.lender,
    guarantor = excluded.guarantor,
    guarantor_phone = excluded.guarantor_phone,
    guarantor_sign = excluded.guarantor_sign,
    guarantor_witness = excluded.guarantor_witness,
    collateral_1 = excluded.collateral_1,
    collateral_2 = excluded.collateral_2,
    collateral_3 = excluded.collateral_3,
    collateral_value = excluded.collateral_value;

  perform public.audit_write('loan.resubmit_contract', 'loan#' || p_loan_id, 'amount=' || p_principal);
end; $$;

create or replace function public.request_loan_changes(p_loan_id bigint, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_note text := btrim(coalesce(p_note, ''));
begin
  if not public.is_admin() then raise exception 'Ruhusa imekataliwa.'; end if;
  if length(v_note) < 3 or length(v_note) > 300 then
    raise exception 'Ujumbe uwe herufi 3 hadi 300.';
  end if;
  if not exists(select 1 from public.loans where id = p_loan_id and decision = 'pending') then
    raise exception 'Ombi halipo au limeshughulikiwa.';
  end if;
  update public.loans set review_note = v_note where id = p_loan_id;
  perform public.audit_write('loan.request_changes', 'loan#' || p_loan_id, v_note);
end; $$;

revoke execute on function public.apply_loan_contract(
  bigint, int, text, text, date, text, text, text, text, text, text, text, bigint
) from public, anon, authenticated;
revoke execute on function public.resubmit_loan_contract(
  bigint, bigint, int, text, text, date, text, text, text, text, text, text, text, bigint
) from public, anon, authenticated;
revoke execute on function public.request_loan_changes(bigint, text)
  from public, anon, authenticated;

grant execute on function public.apply_loan_contract(
  bigint, int, text, text, date, text, text, text, text, text, text, text, bigint
) to authenticated;
grant execute on function public.resubmit_loan_contract(
  bigint, bigint, int, text, text, date, text, text, text, text, text, text, text, bigint
) to authenticated;
grant execute on function public.request_loan_changes(bigint, text) to authenticated;

select pg_notify('pgrst', 'reload schema');

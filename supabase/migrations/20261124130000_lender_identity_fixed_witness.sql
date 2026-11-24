-- Utambulisho wa MKOPESHAJI kwa kila mkopo + shahidi wa kudumu na salama.
-- Jina la chapa (ZABURI YA 23 MICROFINANCE) hubaki kwenye UI/kichwa cha mkataba pekee.

alter table public.agreements
  alter column lender set default 'Anthony Charles Mwanjoka',
  alter column lender_witness set default 'Baraka Charles Mlayakado',
  alter column lender_witness_sign set default 'B.C. mlyakado';

update public.app_settings set
  lender_name = 'Anthony Charles Mwanjoka',
  lender_witness = 'Baraka Charles Mlayakado',
  lender_witness_sign = 'B.C. mlyakado',
  lender_sign = '',
  updated_at = now()
where id;

update public.agreements set
  lender = 'Anthony Charles Mwanjoka',
  lender_sign = case when coalesce(lender_sign, '') <> '' then 'A.C. mwanjoka' else lender_sign end,
  lender_witness = 'Baraka Charles Mlayakado',
  lender_witness_sign = 'B.C. mlyakado'
where coalesce(lender, '') <> 'Anthony Charles Mwanjoka'
   or coalesce(lender_sign, '') <> ''
   or coalesce(lender_witness, '') <> 'Baraka Charles Mlayakado'
   or coalesce(lender_witness_sign, '') <> 'B.C. mlyakado';

-- Taarifa zinazosomwa na mfumo: shahidi ni wa kudumu, jina la mkopeshaji ni la chaguo-msingi.
create or replace function public.get_app_settings()
returns table (lender_name text, lender_witness text,
               lender_witness_sign text, lender_sign text)
language sql stable set search_path = public as $$
  select 'Anthony Charles Mwanjoka'::text,
         'Baraka Charles Mlayakado'::text,
         'B.C. mlyakado'::text,
         ''::text
  from public.app_settings where id;
$$;

-- Ondoa njia za zamani zilizoruhusu kuhariri shahidi na kusasisha mikataba yote.
drop function if exists public.sign_lender(bigint, text, text, text);
drop function if exists public.sign_lender(bigint, text, text);
drop function if exists public.save_app_settings(text, text, text, text);

-- Saini ya mkopeshaji: jina matatu hasa, saini kifupi cha majina hayo tu,
-- shahidi wake avijazwa na mfumo, na vyote vihifadhiwe kwa mkopo husika pekee.
create or replace function public.sign_lender(
  p_loan_id bigint, p_lender_name text, p_sign text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_words text[];
  v_name text;
  v_sign text := btrim(coalesce(p_sign, ''));
  v_short text;
begin
  if not public.is_admin() then
    raise exception 'Ruhusa imekataliwa.';
  end if;
  if not exists(select 1 from public.loans where id = p_loan_id and decision = 'approved') then
    raise exception 'Mkopo haupo au haujaidhinishwa.';
  end if;
  if not exists(select 1 from public.agreements where loan_id = p_loan_id and accepted) then
    raise exception 'Mteja hajasaini mkataba bado.';
  end if;

  v_words := string_to_array(
    lower(btrim(regexp_replace(coalesce(p_lender_name, ''), '\s+', ' ', 'g'))), ' ');
  if coalesce(array_length(v_words, 1), 0) <> 3 then
    raise exception 'Jina la MKOPESHAJI liwe majina matatu hasa, mfano Anthony Charles Mwanjoka.';
  end if;
  v_name := initcap(v_words[1]) || ' ' || initcap(v_words[2]) || ' ' || initcap(v_words[3]);

  v_short := upper(left(v_words[1], 1)) || '.' || upper(left(v_words[2], 1)) || '. ' || v_words[3];
  if length(v_sign) < 2 or length(v_sign) > 80 or lower(v_sign) <> lower(v_short) then
    raise exception 'Saini ya MKOPESHAJI iwe kifupi cha majina yake tu: %.', v_short;
  end if;

  update public.agreements set
    lender = v_name,
    lender_sign = v_short,
    lender_witness = 'Baraka Charles Mlayakado',
    lender_witness_sign = 'B.C. mlyakado'
  where loan_id = p_loan_id;

  perform public.audit_write('agreement.lender_sign', 'loan#' || p_loan_id, v_sign);
end; $$;

revoke all on function public.get_app_settings() from public, anon, authenticated;
grant execute on function public.get_app_settings() to authenticated;

revoke all on function public.sign_lender(bigint, text, text) from public, anon, authenticated;
grant execute on function public.sign_lender(bigint, text, text) to authenticated;

select pg_notify('pgrst', 'reload schema');

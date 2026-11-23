-- Shahidi wa mkopeshaji: Baraka Charles Mlayakado / B.C. mlyakado
-- Endesha baada ya 20261123120000_contract_signatures_settings.sql.

alter table public.agreements alter column lender_witness set default 'Baraka Charles Mlayakado';
alter table public.agreements alter column lender_witness_sign set default 'B.C. mlyakado';
alter table public.app_settings alter column lender_witness set default 'Baraka Charles Mlayakado';
alter table public.app_settings alter column lender_witness_sign set default 'B.C. mlyakado';

create or replace function public.signature_from_name(p_name text)
returns text language plpgsql immutable set search_path = public as $$
declare
  v_words text[] := string_to_array(lower(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'))), ' ');
  v_i int;
  v_initials text := '';
begin
  if coalesce(array_length(v_words, 1), 0) < 2 then return ''; end if;
  for v_i in 1..array_length(v_words, 1) - 1 loop
    v_initials := v_initials || upper(left(v_words[v_i], 1)) || '.';
  end loop;
  return v_initials || ' ' || v_words[array_length(v_words, 1)];
end; $$;

update public.app_settings set
  lender_witness = 'Baraka Charles Mlayakado',
  lender_witness_sign = 'B.C. mlyakado',
  updated_at = now()
where id;

update public.agreements set
  lender_witness = 'Baraka Charles Mlayakado',
  lender_witness_sign = 'B.C. mlyakado',
  borrower_witness_sign = case
    when coalesce(borrower_witness_sign, '') = '' then public.signature_from_name(borrower_witness)
    else borrower_witness_sign end,
  guarantor_witness_sign = case
    when coalesce(guarantor_witness_sign, '') = '' then public.signature_from_name(guarantor_witness)
    else guarantor_witness_sign end;

revoke execute on function public.signature_from_name(text) from public, anon;
grant execute on function public.signature_from_name(text) to authenticated;

select pg_notify('pgrst', 'reload schema');

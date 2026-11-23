-- Sahihisha herufi kubwa kwenye saini zinazotokana na majina ya mashahidi.

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

update public.agreements set
  borrower_witness_sign = public.signature_from_name(borrower_witness)
where coalesce(borrower_witness, '') <> ''
  and lower(borrower_witness_sign) = lower(public.signature_from_name(borrower_witness));

update public.agreements set
  guarantor_witness_sign = public.signature_from_name(guarantor_witness)
where coalesce(guarantor_witness, '') <> ''
  and lower(guarantor_witness_sign) = lower(public.signature_from_name(guarantor_witness));

select pg_notify('pgrst', 'reload schema');

-- Zuia kufuta mteja aliye na rekodi za fedha, hata kama akaunti ya auth inafutwa.
create or replace function public.prevent_customer_delete_with_records()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.loans where customer_id = old.id;
  if v_count > 0 then
    raise exception 'Mteja ana mikopo, malipo au mkataba; haiwezi kufutwa kabla ya rekodi hizo kuondolewa.';
  end if;

  select count(*) into v_count
    from public.payments p join public.loans l on l.id = p.loan_id
   where l.customer_id = old.id;
  if v_count > 0 then
    raise exception 'Mteja ana malipo; haiwezi kufutwa kabla ya rekodi hizo kuondolewa.';
  end if;

  select count(*) into v_count
    from public.agreements a join public.loans l on l.id = a.loan_id
   where l.customer_id = old.id;
  if v_count > 0 then
    raise exception 'Mteja ana mkataba; haiwezi kufutwa kabla ya rekodi hizo kuondolewa.';
  end if;

  return old;
end; $$;

drop trigger if exists prevent_customer_delete_with_records on public.customers;
create trigger prevent_customer_delete_with_records
  before delete on public.customers
  for each row execute function public.prevent_customer_delete_with_records();

revoke all on function public.prevent_customer_delete_with_records() from public, anon, authenticated;

select pg_notify('pgrst', 'reload schema');

-- =====================================================================
--  ZABURI YA 23 MICROFINANCE
--  Auth ya kweli: barua pepe halisi + namba ya simu kwenye database.
--  - profiles.email ina barua pepe ya akaunti (ili admin aione)
--  - handle_new_user inahifadhi jina, simu na email wakati wa usajili
--  - phone_registered() inasaidia usajili kuzuia simu iliyotumika
--  - trigger inasawazisha profiles.email/customers.email na auth.users
-- =====================================================================

alter table public.profiles add column if not exists email text not null default '';

create index if not exists idx_customers_phone on public.customers(phone);
create unique index if not exists customers_user_id_key on public.customers(user_id);

-- ----- Usajili: hifadhi taarifa halisi kwenye profiles + customers -----
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

-- ----- Sawazisha email ya profile/kustomer kila auth.users inabadilika -----
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

-- ----- Je, namba hii ya simu imesajiliwa? (kwa usajili wa app tuli) -----
create or replace function public.phone_registered(p_phone text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where username = btrim(coalesce(p_phone, ''))
  );
$$;
revoke all on function public.phone_registered(text) from public;
grant execute on function public.phone_registered(text) to anon, authenticated;

-- ----- Backfill: nakili barua pepe zilizopo kwenye auth.users -----
update public.profiles p
   set email = coalesce(u.email, '')
  from auth.users u
 where u.id = p.id
   and coalesce(p.email, '') = '';

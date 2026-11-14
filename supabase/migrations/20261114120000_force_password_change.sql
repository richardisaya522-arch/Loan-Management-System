-- Kulazimisha mteja kubadilisha password ya muda aliyopewa na admin.

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;
alter table public.profiles
  add column if not exists temp_password_hash text;

-- profiles inasomwa tu na client. Uandishi unafanywa na Edge Functions (service_role).
drop policy if exists profiles_update on public.profiles;
revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;

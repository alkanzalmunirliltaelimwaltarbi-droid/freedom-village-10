-- إصلاح دخول منصة خدمات قرية الحرية
-- نفّذ هذا الملف مرة واحدة في Supabase > SQL Editor على المشروع:
-- https://novkheywufddqqoigxqe.supabase.co
--
-- هذا الإصلاح يعالج الخطأ:
-- Could not find the function public.login_by_code(p_code) in the schema cache

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.access_codes(
  id uuid primary key default extensions.gen_random_uuid(),
  code_hash text unique not null,
  role text not null check(role in ('user','admin')),
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_sessions(
  id uuid primary key default extensions.gen_random_uuid(),
  token_hash text unique not null,
  access_code_id uuid not null references public.access_codes(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.access_codes enable row level security;
alter table public.app_sessions enable row level security;

drop policy if exists deny_access_codes on public.access_codes;
create policy deny_access_codes on public.access_codes
for all using (false) with check(false);

drop policy if exists deny_sessions on public.app_sessions;
create policy deny_sessions on public.app_sessions
for all using (false) with check(false);

create or replace function public.login_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  a public.access_codes;
  tok text;
begin
  select * into a
  from public.access_codes
  where active
    and code_hash = encode(
      extensions.digest(trim(coalesce(p_code,'')),'sha256'),
      'hex'
    )
  limit 1;

  if not found then
    raise exception 'رمز الدخول غير صحيح';
  end if;

  tok = encode(extensions.gen_random_bytes(32),'hex');

  insert into public.app_sessions(token_hash,access_code_id,expires_at)
  values(
    encode(extensions.digest(tok,'sha256'),'hex'),
    a.id,
    now() + interval '30 days'
  );

  return jsonb_build_object(
    'token',tok,
    'role',a.role,
    'display_name',a.display_name
  );
end
$$;

revoke all on function public.login_by_code(text) from public;
grant execute on function public.login_by_code(text) to anon, authenticated;

-- تأكد من وجود رمز المستخدم الحالي.
insert into public.access_codes(code_hash,role,display_name)
values
  ('b15a1c5bd6486aacb54a90903ef4dae5493a2fcdff61e72ec83b9eb604800eb1','user','مستخدم القرية')
on conflict(code_hash) do update
set active=true, role='user', display_name='مستخدم القرية';

-- تحديث Schema Cache الخاص بـ PostgREST فوراً.
notify pgrst, 'reload schema';

select
  'تم إنشاء/تحديث login_by_code وإعادة تحميل Schema Cache.' as result,
  exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='login_by_code'
  ) as function_exists;

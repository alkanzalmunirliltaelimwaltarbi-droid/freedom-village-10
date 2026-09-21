
-- برنامج خدمات قرية الحرية — الإصدار النهائي
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

create table if not exists public.news(
  id uuid primary key default extensions.gen_random_uuid(), title text not null, body text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.services(
  id uuid primary key default extensions.gen_random_uuid(), title text not null, body text not null,
  icon text, created_at timestamptz not null default now()
);
create table if not exists public.emergency(
  id uuid primary key default extensions.gen_random_uuid(), title text not null, body text, phone text,
  created_at timestamptz not null default now()
);
create table if not exists public.events(
  id uuid primary key default extensions.gen_random_uuid(), title text not null, body text,
  event_date date, event_time time, created_at timestamptz not null default now()
);
create table if not exists public.directory(
  id uuid primary key default extensions.gen_random_uuid(), title text not null, body text, phone text,
  created_at timestamptz not null default now()
);
create table if not exists public.prayer_times(
  id boolean primary key default true, fajr time, sunrise time, dhuhr time, asr time,
  maghrib time, isha time, note text, updated_at timestamptz not null default now()
);
create table if not exists public.complaints(
  id uuid primary key default extensions.gen_random_uuid(), ref_no text unique not null,
  access_code_id uuid references public.access_codes(id) on delete set null,
  title text not null, body text not null,
  status text not null default 'new' check(status in ('new','under_review','processing','resolved','closed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.suggestions(
  id uuid primary key default extensions.gen_random_uuid(),
  access_code_id uuid references public.access_codes(id) on delete set null,
  title text not null, body text not null,
  status text not null default 'new' check(status in ('new','reviewed','accepted','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table public.access_codes enable row level security;
alter table public.app_sessions enable row level security;
alter table public.news enable row level security;
alter table public.services enable row level security;
alter table public.emergency enable row level security;
alter table public.events enable row level security;
alter table public.directory enable row level security;
alter table public.prayer_times enable row level security;
alter table public.complaints enable row level security;
alter table public.suggestions enable row level security;

-- Direct table access is intentionally blocked. The application uses controlled RPCs.
drop policy if exists deny_access_codes on public.access_codes;
create policy deny_access_codes on public.access_codes for all using (false) with check(false);
drop policy if exists deny_sessions on public.app_sessions;
create policy deny_sessions on public.app_sessions for all using (false) with check(false);
drop policy if exists deny_news on public.news;
create policy deny_news on public.news for all using (false) with check(false);
drop policy if exists deny_services on public.services;
create policy deny_services on public.services for all using (false) with check(false);
drop policy if exists deny_emergency on public.emergency;
create policy deny_emergency on public.emergency for all using (false) with check(false);
drop policy if exists deny_events on public.events;
create policy deny_events on public.events for all using (false) with check(false);
drop policy if exists deny_directory on public.directory;
create policy deny_directory on public.directory for all using (false) with check(false);
drop policy if exists deny_prayer on public.prayer_times;
create policy deny_prayer on public.prayer_times for all using (false) with check(false);
drop policy if exists deny_complaints on public.complaints;
create policy deny_complaints on public.complaints for all using (false) with check(false);
drop policy if exists deny_suggestions on public.suggestions;
create policy deny_suggestions on public.suggestions for all using (false) with check(false);

create or replace function public.login_by_code(p_code text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare a public.access_codes; tok text;
begin
  select * into a from public.access_codes
  where active and code_hash=encode(extensions.digest(trim(p_code),'sha256'),'hex') limit 1;
  if not found then raise exception 'رمز الدخول غير صحيح'; end if;
  tok=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.app_sessions(token_hash,access_code_id,expires_at)
  values(encode(extensions.digest(tok,'sha256'),'hex'),a.id,now()+interval '30 days');
  return jsonb_build_object('token',tok,'role',a.role,'display_name',a.display_name);
end $$;

create or replace function public._session(p_token text)
returns public.app_sessions language sql security definer set search_path=public,extensions as $$
  select s from public.app_sessions s
  where s.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
    and s.expires_at>now() limit 1
$$;

create or replace function public.app_bootstrap(p_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare s public.app_sessions; a public.access_codes; result jsonb;
begin
  select * into s from public._session(p_token);
  if not found then raise exception 'الجلسة غير صالحة أو منتهية'; end if;
  select * into a from public.access_codes where id=s.access_code_id;
  select jsonb_build_object(
    'role',a.role,'display_name',a.display_name,
    'news',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.news x),'[]'::jsonb),
    'services',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.services x),'[]'::jsonb),
    'emergency',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.emergency x),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(x) order by x.event_date nulls last,x.event_time nulls last) from public.events x),'[]'::jsonb),
    'directory',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.directory x),'[]'::jsonb),
    'prayer',(select to_jsonb(x) from public.prayer_times x where x.id=true),
    'my_complaints',case when a.role='admin' then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.complaints x where x.access_code_id=a.id),'[]'::jsonb) end,
    'my_suggestions',case when a.role='admin' then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.suggestions x where x.access_code_id=a.id),'[]'::jsonb) end,
    'complaints',case when a.role='admin' then coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.complaints x),'[]'::jsonb) else '[]'::jsonb end,
    'suggestions',case when a.role='admin' then coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.suggestions x),'[]'::jsonb) else '[]'::jsonb end,
    'stats',jsonb_build_object(
      'users',(select count(*) from public.access_codes where role='user' and active),
      'complaints',(select count(*) from public.complaints),
      'suggestions',(select count(*) from public.suggestions)
    )
  ) into result;
  return result;
end $$;

create or replace function public.create_complaint(p_token text,p_title text,p_body text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare s public.app_sessions;a public.access_codes; r text;
begin
 select * into s from public._session(p_token); if not found then raise exception 'الجلسة غير صالحة'; end if;
 select * into a from public.access_codes where id=s.access_code_id;
 if a.role<>'user' then raise exception 'هذه الخدمة مخصصة للمستخدمين'; end if;
 r='FV-'||upper(substr(replace(extensions.gen_random_uuid()::text,'-',''),1,10));
 insert into public.complaints(ref_no,access_code_id,title,body) values(r,a.id,trim(p_title),trim(p_body));
 return jsonb_build_object('ref_no',r);
end $$;

create or replace function public.create_suggestion(p_token text,p_title text,p_body text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare s public.app_sessions;a public.access_codes;
begin
 select * into s from public._session(p_token); if not found then raise exception 'الجلسة غير صالحة'; end if;
 select * into a from public.access_codes where id=s.access_code_id;
 if a.role<>'user' then raise exception 'هذه الخدمة مخصصة للمستخدمين'; end if;
 insert into public.suggestions(access_code_id,title,body) values(a.id,trim(p_title),trim(p_body));
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.admin_add_content(p_token text,p_section text,p_title text,p_body text,p_icon text default null,p_phone text default null,p_event_date date default null,p_event_time time default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare s public.app_sessions;a public.access_codes;
begin
 select * into s from public._session(p_token); if not found then raise exception 'الجلسة غير صالحة'; end if;
 select * into a from public.access_codes where id=s.access_code_id; if a.role<>'admin' then raise exception 'صلاحيات الإدارة مطلوبة'; end if;
 case p_section
  when 'news' then insert into public.news(title,body) values(trim(p_title),trim(p_body));
  when 'services' then insert into public.services(title,body,icon) values(trim(p_title),trim(p_body),nullif(trim(p_icon),''));
  when 'emergency' then insert into public.emergency(title,body,phone) values(trim(p_title),trim(p_body),nullif(trim(p_phone),''));
  when 'directory' then insert into public.directory(title,body,phone) values(trim(p_title),trim(p_body),nullif(trim(p_phone),''));
  when 'events' then insert into public.events(title,body,event_date,event_time) values(trim(p_title),trim(p_body),p_event_date,p_event_time);
  else raise exception 'قسم غير معروف';
 end case;
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.admin_delete_content(p_token text,p_section text,p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare s public.app_sessions;a public.access_codes;
begin
 select * into s from public._session(p_token); if not found then raise exception 'الجلسة غير صالحة'; end if;
 select * into a from public.access_codes where id=s.access_code_id; if a.role<>'admin' then raise exception 'صلاحيات الإدارة مطلوبة'; end if;
 case p_section
  when 'news' then delete from public.news where id=p_id;
  when 'services' then delete from public.services where id=p_id;
  when 'emergency' then delete from public.emergency where id=p_id;
  when 'directory' then delete from public.directory where id=p_id;
  when 'events' then delete from public.events where id=p_id;
  else raise exception 'قسم غير معروف';
 end case;
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.admin_save_prayer(p_token text,p_fajr time,p_sunrise time,p_dhuhr time,p_asr time,p_maghrib time,p_isha time,p_note text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare s public.app_sessions;a public.access_codes;
begin
 select * into s from public._session(p_token); if not found then raise exception 'الجلسة غير صالحة'; end if;
 select * into a from public.access_codes where id=s.access_code_id; if a.role<>'admin' then raise exception 'صلاحيات الإدارة مطلوبة'; end if;
 insert into public.prayer_times(id,fajr,sunrise,dhuhr,asr,maghrib,isha,note,updated_at)
 values(true,p_fajr,p_sunrise,p_dhuhr,p_asr,p_maghrib,p_isha,p_note,now())
 on conflict(id) do update set fajr=excluded.fajr,sunrise=excluded.sunrise,dhuhr=excluded.dhuhr,asr=excluded.asr,maghrib=excluded.maghrib,isha=excluded.isha,note=excluded.note,updated_at=now();
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.admin_update_complaint(p_token text,p_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare s public.app_sessions;a public.access_codes;
begin
 select * into s from public._session(p_token); if not found then raise exception 'الجلسة غير صالحة'; end if;
 select * into a from public.access_codes where id=s.access_code_id; if a.role<>'admin' then raise exception 'صلاحيات الإدارة مطلوبة'; end if;
 update public.complaints set status=p_status,updated_at=now() where id=p_id;
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.admin_update_suggestion(p_token text,p_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare s public.app_sessions;a public.access_codes;
begin
 select * into s from public._session(p_token); if not found then raise exception 'الجلسة غير صالحة'; end if;
 select * into a from public.access_codes where id=s.access_code_id; if a.role<>'admin' then raise exception 'صلاحيات الإدارة مطلوبة'; end if;
 update public.suggestions set status=p_status,updated_at=now() where id=p_id;
 return jsonb_build_object('ok',true);
end $$;

-- أكواد البداية: يتم تخزين SHA-256 فقط، ولا يتم تخزين الرمز نفسه.
insert into public.access_codes(code_hash,role,display_name)
values
 ('8a6ba3a9c7c49bd0eb0f63b563f0e3096d1f8a51f07fa72ad2a85ca8b01a03fa','admin','المشرف العام'),
 ('8427f654f43869912be7894c36b682135a40ccb52e191c34f169505c27a01006','admin','المشرف العام'),
 ('c3e19c059981a97d80c9ca82d733a1566a90004cb82b35f9becf8804a223418e','admin','المشرف العام'),
 ('b15a1c5bd6486aacb54a90903ef4dae5493a2fcdff61e72ec83b9eb604800eb1','user','مستخدم القرية')
on conflict(code_hash) do update set active=true;

revoke all on all tables in schema public from anon,authenticated;
revoke all on all functions in schema public from anon,authenticated;
grant execute on function public.login_by_code(text) to anon,authenticated;
grant execute on function public.app_bootstrap(text) to anon,authenticated;
grant execute on function public.create_complaint(text,text,text) to anon,authenticated;
grant execute on function public.create_suggestion(text,text,text) to anon,authenticated;
grant execute on function public.admin_add_content(text,text,text,text,text,text,date,time) to anon,authenticated;
grant execute on function public.admin_delete_content(text,text,uuid) to anon,authenticated;
grant execute on function public.admin_save_prayer(text,time,time,time,time,time,time,text) to anon,authenticated;
grant execute on function public.admin_update_complaint(text,uuid,text) to anon,authenticated;
grant execute on function public.admin_update_suggestion(text,uuid,text) to anon,authenticated;

-- تنظيف جلسات منتهية اختياري:
delete from public.app_sessions where expires_at<now();

-- إعادة تحميل Schema Cache بعد إنشاء دوال RPC.
notify pgrst, 'reload schema';

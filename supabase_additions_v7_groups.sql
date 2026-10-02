-- DYSON V7 additions (Group chats). OPTIONAL and ADDITIVE ONLY: it creates NEW tables and functions and does not
-- change, drop or rename anything that already exists. Run once in Supabase > SQL Editor. Safe to re-run.
-- Without it everything else in DYSON still works; only "New group" will say groups are not set up yet.

create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now());
create table if not exists public.chat_group_members (
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id));
create table if not exists public.chat_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  reply_to uuid references public.chat_group_messages(id) on delete set null,
  created_at timestamptz not null default now());
create index if not exists chat_group_messages_idx on public.chat_group_messages(group_id, created_at desc);
create table if not exists public.chat_group_reactions (
  message_id uuid not null references public.chat_group_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 16),
  primary key (message_id, user_id, emoji));

create or replace function public.dyson_in_group(gid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from public.chat_group_members where group_id = gid and user_id = auth.uid()) $$;

alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.chat_group_messages enable row level security;
alter table public.chat_group_reactions enable row level security;

drop policy if exists "group read" on public.chat_groups;
create policy "group read" on public.chat_groups for select to authenticated using (public.dyson_in_group(id));
drop policy if exists "group members read" on public.chat_group_members;
create policy "group members read" on public.chat_group_members for select to authenticated using (public.dyson_in_group(group_id));
drop policy if exists "group leave" on public.chat_group_members;
create policy "group leave" on public.chat_group_members for delete to authenticated using (user_id = auth.uid());
drop policy if exists "group msg read" on public.chat_group_messages;
create policy "group msg read" on public.chat_group_messages for select to authenticated using (public.dyson_in_group(group_id));
drop policy if exists "group msg send" on public.chat_group_messages;
create policy "group msg send" on public.chat_group_messages for insert to authenticated with check (sender_id = auth.uid() and public.dyson_in_group(group_id));
drop policy if exists "group react read" on public.chat_group_reactions;
create policy "group react read" on public.chat_group_reactions for select to authenticated
  using (exists(select 1 from public.chat_group_messages m where m.id = message_id and public.dyson_in_group(m.group_id)));
drop policy if exists "group react add" on public.chat_group_reactions;
create policy "group react add" on public.chat_group_reactions for insert to authenticated
  with check (user_id = auth.uid() and exists(select 1 from public.chat_group_messages m where m.id = message_id and public.dyson_in_group(m.group_id)));
drop policy if exists "group react remove" on public.chat_group_reactions;
create policy "group react remove" on public.chat_group_reactions for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.chat_group_members to authenticated;
grant select on public.chat_groups to authenticated;
grant select, insert on public.chat_group_messages to authenticated;
grant select, insert, delete on public.chat_group_reactions to authenticated;

-- Create a group. Members must be people you saved as contacts. Returns the new group id.
create or replace function public.create_chat_group(p_name text, p_members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid; me uuid := auth.uid(); nm text := trim(coalesce(p_name,''));
begin
  if me is null then raise exception 'not signed in'; end if;
  if char_length(nm) < 1 or char_length(nm) > 60 then raise exception 'a group name is required'; end if;
  if coalesce(array_length(p_members,1),0) > 255 then raise exception 'too many members'; end if;
  insert into public.chat_groups(name, created_by) values (nm, me) returning id into gid;
  insert into public.chat_group_members(group_id, user_id, role) values (gid, me, 'admin');
  insert into public.chat_group_members(group_id, user_id)
    select gid, c.contact_id from public.contacts c where c.owner_id = me and c.contact_id = any(p_members) and c.contact_id <> me
    on conflict do nothing;
  return gid;
end $$;

create or replace function public.list_chat_groups()
returns table(id uuid, name text, member_count bigint, last_content text, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, (select count(*) from public.chat_group_members x where x.group_id = g.id),
         lm.content, coalesce(lm.created_at, g.created_at)
  from public.chat_groups g
  left join lateral (select content, created_at from public.chat_group_messages m where m.group_id = g.id order by created_at desc limit 1) lm on true
  where public.dyson_in_group(g.id)
  order by coalesce(lm.created_at, g.created_at) desc $$;

create or replace function public.chat_group_people(gid uuid)
returns table(user_id uuid, full_name text, username text, avatar_url text, role text)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.full_name, p.username, p.avatar_url, m.role
  from public.chat_group_members m join public.profiles p on p.id = m.user_id
  where m.group_id = gid and public.dyson_in_group(gid) order by m.joined_at $$;

revoke all on function public.create_chat_group(text,uuid[]), public.list_chat_groups(), public.chat_group_people(uuid) from public, anon;
grant execute on function public.create_chat_group(text,uuid[]), public.list_chat_groups(), public.chat_group_people(uuid) to authenticated;

do $$ begin alter publication supabase_realtime add table public.chat_group_messages; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.chat_group_reactions; exception when others then null; end $$;

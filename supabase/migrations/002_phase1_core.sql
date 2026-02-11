-- Phase 1 core improvements:
-- - safer room_members read policy (no recursive RLS)
-- - persisted message reactions with realtime

create or replace function public.is_room_member(target_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_members
    where room_id = target_room_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

drop policy if exists "room_members_select" on public.room_members;
create policy "room_members_select" on public.room_members
  for select to authenticated
  using (public.is_room_member(room_id));

create table if not exists public.message_reactions (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists idx_message_reactions_message
  on public.message_reactions(message_id);
create index if not exists idx_message_reactions_user
  on public.message_reactions(user_id);

alter table public.message_reactions enable row level security;
alter table public.message_reactions replica identity full;
alter table public.messages replica identity full;

drop policy if exists "message_reactions_select" on public.message_reactions;
create policy "message_reactions_select" on public.message_reactions
  for select to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_reactions.message_id
        and public.is_room_member(m.room_id)
    )
  );

drop policy if exists "message_reactions_insert" on public.message_reactions;
create policy "message_reactions_insert" on public.message_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.messages m
      where m.id = message_reactions.message_id
        and public.is_room_member(m.room_id)
    )
  );

drop policy if exists "message_reactions_delete" on public.message_reactions;
create policy "message_reactions_delete" on public.message_reactions
  for delete to authenticated
  using (user_id = auth.uid());

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end
$$;

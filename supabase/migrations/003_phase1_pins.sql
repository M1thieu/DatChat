-- Phase 1 pins:
-- - persistent room message pins
-- - realtime updates for pinned state

create table if not exists public.message_pins (
  room_id uuid not null references public.rooms(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, message_id)
);

create unique index if not exists idx_message_pins_message
  on public.message_pins(message_id);
create index if not exists idx_message_pins_room_created
  on public.message_pins(room_id, created_at desc);

alter table public.message_pins enable row level security;
alter table public.message_pins replica identity full;
alter table public.message_embeds replica identity full;

drop policy if exists "message_pins_select" on public.message_pins;
create policy "message_pins_select" on public.message_pins
  for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "message_pins_insert" on public.message_pins;
create policy "message_pins_insert" on public.message_pins
  for insert to authenticated
  with check (
    pinned_by = auth.uid()
    and exists (
      select 1
      from public.messages m
      where m.id = message_pins.message_id
        and m.room_id = message_pins.room_id
        and public.is_room_member(m.room_id)
    )
  );

drop policy if exists "message_pins_delete" on public.message_pins;
create policy "message_pins_delete" on public.message_pins
  for delete to authenticated
  using (public.is_room_member(room_id));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_embeds'
  ) then
    alter publication supabase_realtime add table public.message_embeds;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_pins'
  ) then
    alter publication supabase_realtime add table public.message_pins;
  end if;
end
$$;

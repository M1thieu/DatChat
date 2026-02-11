-- ╔═══════════════════════════════════════════════════════════╗
-- ║  DatChat v0 — Initial Schema                             ║
-- ║  Tables, indexes, RLS policies, RPC functions             ║
-- ╚═══════════════════════════════════════════════════════════╝

-- ══════════════════════════════════════════════════════════════
-- 1. TABLES
-- ══════════════════════════════════════════════════════════════

-- Profiles (extends Supabase auth.users)
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  display_name  text,
  avatar_url    text,
  status        text not null default 'offline'
                check (status in ('online', 'idle', 'dnd', 'offline')),
  created_at    timestamptz not null default now()
);

-- Relationships / Friend system
-- Directional: from_id → to_id. Two rows per friendship.
-- Types: 1=friends, 2=blocked, 3=incoming, 4=outgoing
create table public.relationships (
  id          uuid primary key default gen_random_uuid(),
  from_id     uuid not null references public.profiles(id) on delete cascade,
  to_id       uuid not null references public.profiles(id) on delete cascade,
  type        smallint not null check (type in (1, 2, 3, 4)),
  nickname    text,
  created_at  timestamptz not null default now(),
  unique(from_id, to_id)
);

-- Rooms (DM or group chat)
create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  type        text not null check (type in ('dm', 'group')),
  icon_url    text,
  owner_id    uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- Room membership
create table public.room_members (
  room_id   uuid not null references public.rooms(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  nickname  text,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- Messages
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  author_id   uuid not null references public.profiles(id),
  content     text not null,
  edited_at   timestamptz,
  reply_to_id uuid references public.messages(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Attachments
create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references public.messages(id) on delete cascade,
  filename      text not null,
  storage_path  text not null,
  content_type  text,
  size          integer
);

-- Message embeds (link previews)
create table public.message_embeds (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages(id) on delete cascade,
  url         text not null,
  title       text,
  description text,
  image_url   text,
  site_name   text,
  created_at  timestamptz not null default now()
);

-- Emote packs
create table public.emote_packs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- Emotes
create table public.emotes (
  id            uuid primary key default gen_random_uuid(),
  pack_id       uuid not null references public.emote_packs(id) on delete cascade,
  name          text not null,
  storage_path  text not null,
  animated      boolean not null default false
);

-- Room emote pack associations
create table public.room_emote_packs (
  room_id uuid not null references public.rooms(id) on delete cascade,
  pack_id uuid not null references public.emote_packs(id) on delete cascade,
  primary key (room_id, pack_id)
);


-- ══════════════════════════════════════════════════════════════
-- 2. INDEXES
-- ══════════════════════════════════════════════════════════════

create index idx_relationships_from   on public.relationships(from_id);
create index idx_relationships_to     on public.relationships(to_id);
create index idx_messages_room        on public.messages(room_id, created_at desc);
create index idx_messages_author      on public.messages(author_id);
create index idx_attachments_message  on public.attachments(message_id);
create index idx_embeds_message       on public.message_embeds(message_id);
create index idx_emotes_pack          on public.emotes(pack_id);
create index idx_room_members_user    on public.room_members(user_id);


-- ══════════════════════════════════════════════════════════════
-- 3. ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════

alter table public.profiles        enable row level security;
alter table public.relationships   enable row level security;
alter table public.rooms           enable row level security;
alter table public.room_members    enable row level security;
alter table public.messages        enable row level security;
alter table public.attachments     enable row level security;
alter table public.message_embeds  enable row level security;
alter table public.emote_packs     enable row level security;
alter table public.emotes          enable row level security;
alter table public.room_emote_packs enable row level security;

-- ── Profiles ─────────────────────────────────────────

-- Anyone authenticated can read any profile (needed for search/friend list)
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (true);

-- Users can only update their own profile
create policy "profiles_update" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Profile is created via trigger (see below), not direct insert
create policy "profiles_insert" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

-- ── Relationships ────────────────────────────────────

-- Users can see their own relationships
create policy "relationships_select" on public.relationships
  for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

-- Inserts/updates/deletes go through RPC functions (security definer)
-- No direct insert/update/delete from client

-- ── Rooms ────────────────────────────────────────────

-- Users can see rooms they're a member of
create policy "rooms_select" on public.rooms
  for select to authenticated
  using (
    exists (
      select 1 from public.room_members
      where room_members.room_id = rooms.id
        and room_members.user_id = auth.uid()
    )
  );

-- Room creation goes through RPC (group) or auto on friend accept (DM)
create policy "rooms_insert" on public.rooms
  for insert to authenticated
  with check (owner_id = auth.uid());

-- Only owner can update room (name, icon)
create policy "rooms_update" on public.rooms
  for update to authenticated
  using (owner_id = auth.uid());

-- ── Room Members ─────────────────────────────────────

-- Users can see members of rooms they belong to
create policy "room_members_select" on public.room_members
  for select to authenticated
  using (
    exists (
      select 1 from public.room_members as rm
      where rm.room_id = room_members.room_id
        and rm.user_id = auth.uid()
    )
  );

-- ── Messages ─────────────────────────────────────────

-- Users can read messages in rooms they belong to
create policy "messages_select" on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.room_members
      where room_members.room_id = messages.room_id
        and room_members.user_id = auth.uid()
    )
  );

-- Users can send messages to rooms they belong to
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.room_members
      where room_members.room_id = messages.room_id
        and room_members.user_id = auth.uid()
    )
  );

-- Users can edit their own messages
create policy "messages_update" on public.messages
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- Users can delete their own messages
create policy "messages_delete" on public.messages
  for delete to authenticated
  using (author_id = auth.uid());

-- ── Attachments ──────────────────────────────────────

-- Same access as messages (read if member of room)
create policy "attachments_select" on public.attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      join public.room_members rm on rm.room_id = m.room_id
      where m.id = attachments.message_id
        and rm.user_id = auth.uid()
    )
  );

create policy "attachments_insert" on public.attachments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.messages m
      where m.id = attachments.message_id
        and m.author_id = auth.uid()
    )
  );

-- ── Message Embeds ───────────────────────────────────

create policy "embeds_select" on public.message_embeds
  for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      join public.room_members rm on rm.room_id = m.room_id
      where m.id = message_embeds.message_id
        and rm.user_id = auth.uid()
    )
  );

-- Embeds inserted by Edge Functions (service role), not client directly

-- ── Emote Packs ──────────────────────────────────────

-- Anyone authenticated can see emote packs (for discovery)
create policy "emote_packs_select" on public.emote_packs
  for select to authenticated
  using (true);

create policy "emote_packs_insert" on public.emote_packs
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "emote_packs_update" on public.emote_packs
  for update to authenticated
  using (owner_id = auth.uid());

create policy "emote_packs_delete" on public.emote_packs
  for delete to authenticated
  using (owner_id = auth.uid());

-- ── Emotes ───────────────────────────────────────────

create policy "emotes_select" on public.emotes
  for select to authenticated
  using (true);

create policy "emotes_insert" on public.emotes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.emote_packs
      where emote_packs.id = emotes.pack_id
        and emote_packs.owner_id = auth.uid()
    )
  );

create policy "emotes_delete" on public.emotes
  for delete to authenticated
  using (
    exists (
      select 1 from public.emote_packs
      where emote_packs.id = emotes.pack_id
        and emote_packs.owner_id = auth.uid()
    )
  );

-- ── Room Emote Packs ─────────────────────────────────

create policy "room_emote_packs_select" on public.room_emote_packs
  for select to authenticated
  using (
    exists (
      select 1 from public.room_members
      where room_members.room_id = room_emote_packs.room_id
        and room_members.user_id = auth.uid()
    )
  );


-- ══════════════════════════════════════════════════════════════
-- 4. TRIGGERS — auto-create profile on user signup
-- ══════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- ══════════════════════════════════════════════════════════════
-- 5. RPC FUNCTIONS — Friend system (security definer)
-- ══════════════════════════════════════════════════════════════

-- ── Send friend request ──────────────────────────────
create or replace function public.send_friend_request(target_username text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_id uuid;
  existing_rel public.relationships;
  reverse_rel public.relationships;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Find target user
  select id into target_id
  from public.profiles
  where username = target_username;

  if target_id is null then
    raise exception 'User not found';
  end if;

  if target_id = caller_id then
    raise exception 'Cannot send friend request to yourself';
  end if;

  -- Check if relationship already exists
  select * into existing_rel
  from public.relationships
  where from_id = caller_id and to_id = target_id;

  if existing_rel.id is not null then
    if existing_rel.type = 1 then
      raise exception 'Already friends';
    elsif existing_rel.type = 2 then
      raise exception 'User is blocked';
    elsif existing_rel.type = 4 then
      raise exception 'Friend request already sent';
    elsif existing_rel.type = 3 then
      -- They sent us a request — auto-accept
      return public.accept_friend_request(target_id);
    end if;
  end if;

  -- Check if they blocked us
  select * into reverse_rel
  from public.relationships
  where from_id = target_id and to_id = caller_id and type = 2;

  if reverse_rel.id is not null then
    raise exception 'Cannot send request to this user';
  end if;

  -- Create outgoing request (caller → target)
  insert into public.relationships (from_id, to_id, type)
  values (caller_id, target_id, 4);

  -- Create incoming request (target → caller)
  insert into public.relationships (from_id, to_id, type)
  values (target_id, caller_id, 3);

  return json_build_object('status', 'request_sent', 'to_id', target_id);
end;
$$;


-- ── Accept friend request ────────────────────────────
create or replace function public.accept_friend_request(from_user_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  incoming_rel public.relationships;
  dm_room_id uuid;
  existing_dm uuid;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Verify incoming request exists
  select * into incoming_rel
  from public.relationships
  where from_id = caller_id and to_id = from_user_id and type = 3;

  if incoming_rel.id is null then
    raise exception 'No pending request from this user';
  end if;

  -- Update both relationships to friends
  update public.relationships
  set type = 1
  where (from_id = caller_id and to_id = from_user_id)
     or (from_id = from_user_id and to_id = caller_id);

  -- Check if a DM room already exists between these two users
  select r.id into existing_dm
  from public.rooms r
  where r.type = 'dm'
    and exists (
      select 1 from public.room_members rm1
      where rm1.room_id = r.id and rm1.user_id = caller_id
    )
    and exists (
      select 1 from public.room_members rm2
      where rm2.room_id = r.id and rm2.user_id = from_user_id
    );

  if existing_dm is not null then
    dm_room_id := existing_dm;
  else
    -- Create DM room
    insert into public.rooms (type)
    values ('dm')
    returning id into dm_room_id;

    -- Add both users as members
    insert into public.room_members (room_id, user_id)
    values (dm_room_id, caller_id), (dm_room_id, from_user_id);
  end if;

  return json_build_object(
    'status', 'accepted',
    'friend_id', from_user_id,
    'room_id', dm_room_id
  );
end;
$$;


-- ── Reject friend request ────────────────────────────
create or replace function public.reject_friend_request(from_user_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Delete both directions
  delete from public.relationships
  where (from_id = caller_id and to_id = from_user_id and type = 3)
     or (from_id = from_user_id and to_id = caller_id and type = 4);

  return json_build_object('status', 'rejected', 'user_id', from_user_id);
end;
$$;


-- ── Remove friend ────────────────────────────────────
create or replace function public.remove_friend(friend_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Delete both directions (only if they were friends)
  delete from public.relationships
  where ((from_id = caller_id and to_id = friend_id)
      or (from_id = friend_id and to_id = caller_id))
    and type = 1;

  return json_build_object('status', 'removed', 'user_id', friend_id);
end;
$$;


-- ── Block user ───────────────────────────────────────
create or replace function public.block_user(target_user_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if target_user_id = caller_id then
    raise exception 'Cannot block yourself';
  end if;

  -- Remove any existing relationship from caller → target
  delete from public.relationships
  where from_id = caller_id and to_id = target_user_id;

  -- Remove any existing relationship from target → caller
  delete from public.relationships
  where from_id = target_user_id and to_id = caller_id;

  -- Create block relationship
  insert into public.relationships (from_id, to_id, type)
  values (caller_id, target_user_id, 2);

  return json_build_object('status', 'blocked', 'user_id', target_user_id);
end;
$$;


-- ── Unblock user ─────────────────────────────────────
create or replace function public.unblock_user(target_user_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.relationships
  where from_id = caller_id and to_id = target_user_id and type = 2;

  return json_build_object('status', 'unblocked', 'user_id', target_user_id);
end;
$$;


-- ── Create group chat ────────────────────────────────
create or replace function public.create_group(
  group_name text,
  member_ids uuid[]
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  new_room_id uuid;
  member_id uuid;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if array_length(member_ids, 1) is null or array_length(member_ids, 1) < 1 then
    raise exception 'Must include at least one other member';
  end if;

  if array_length(member_ids, 1) > 9 then
    raise exception 'Maximum 10 members in a group (including you)';
  end if;

  -- Verify all members are friends with the caller
  foreach member_id in array member_ids loop
    if not exists (
      select 1 from public.relationships
      where from_id = caller_id and to_id = member_id and type = 1
    ) then
      raise exception 'Can only add friends to a group';
    end if;
  end loop;

  -- Create room
  insert into public.rooms (name, type, owner_id)
  values (group_name, 'group', caller_id)
  returning id into new_room_id;

  -- Add caller as member
  insert into public.room_members (room_id, user_id)
  values (new_room_id, caller_id);

  -- Add other members
  foreach member_id in array member_ids loop
    insert into public.room_members (room_id, user_id)
    values (new_room_id, member_id);
  end loop;

  return json_build_object('status', 'created', 'room_id', new_room_id);
end;
$$;


-- ══════════════════════════════════════════════════════════════
-- 6. REALTIME — Enable for relevant tables
-- ══════════════════════════════════════════════════════════════

-- These will be configured in the Supabase dashboard or via config,
-- but we can set the publication here for local dev.
-- Supabase auto-creates the "supabase_realtime" publication.

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.relationships;
alter publication supabase_realtime add table public.room_members;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.rooms;


-- ══════════════════════════════════════════════════════════════
-- 7. STORAGE BUCKETS
-- ══════════════════════════════════════════════════════════════

-- These are created via Supabase dashboard or seed.sql
-- Buckets: avatars, attachments, emotes

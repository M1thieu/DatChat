-- Phase 1 identity snapshots:
-- - preserve message sender name/handle at send time
-- - avoid old messages changing display labels after profile rename

alter table public.messages
  add column if not exists author_username_snapshot text,
  add column if not exists author_display_name_snapshot text;

update public.messages m
set
  author_username_snapshot = p.username,
  author_display_name_snapshot = coalesce(p.display_name, p.username)
from public.profiles p
where p.id = m.author_id
  and (
    m.author_username_snapshot is null
    or m.author_display_name_snapshot is null
  );

create or replace function public.set_message_author_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot_username text;
  snapshot_display_name text;
begin
  if new.author_username_snapshot is not null and new.author_display_name_snapshot is not null then
    return new;
  end if;

  select
    p.username,
    coalesce(p.display_name, p.username)
  into
    snapshot_username,
    snapshot_display_name
  from public.profiles p
  where p.id = new.author_id;

  new.author_username_snapshot := coalesce(new.author_username_snapshot, snapshot_username, 'unknown');
  new.author_display_name_snapshot := coalesce(
    new.author_display_name_snapshot,
    snapshot_display_name,
    new.author_username_snapshot,
    'unknown'
  );

  return new;
end;
$$;

drop trigger if exists trg_messages_set_author_snapshots on public.messages;
create trigger trg_messages_set_author_snapshots
  before insert or update of author_id on public.messages
  for each row
  execute function public.set_message_author_snapshots();

alter table public.messages
  alter column author_username_snapshot set not null,
  alter column author_display_name_snapshot set not null;

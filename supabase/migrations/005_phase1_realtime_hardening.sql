-- Phase 1 realtime hardening:
-- - ensure core chat tables are always in supabase_realtime publication
-- - avoid "subscribed but stale until manual refresh" behavior

alter table if exists public.profiles replica identity full;
alter table if exists public.relationships replica identity full;
alter table if exists public.rooms replica identity full;
alter table if exists public.room_members replica identity full;
alter table if exists public.messages replica identity full;
alter table if exists public.message_reactions replica identity full;
alter table if exists public.message_embeds replica identity full;
alter table if exists public.message_pins replica identity full;

do $$
declare
  publication_table text;
begin
  foreach publication_table in array array[
    'profiles',
    'relationships',
    'rooms',
    'room_members',
    'messages',
    'message_reactions',
    'message_embeds',
    'message_pins'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = publication_table
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        publication_table
      );
    end if;
  end loop;
end
$$;

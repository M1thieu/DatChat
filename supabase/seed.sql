-- Seed data for local development
-- Storage buckets (Supabase manages these)
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('attachments', 'attachments', true),
  ('emotes', 'emotes', true)
on conflict (id) do nothing;

-- Storage policies — anyone can read public buckets
create policy "public_read_avatars" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "public_read_attachments" on storage.objects
  for select using (bucket_id = 'attachments');

create policy "public_read_emotes" on storage.objects
  for select using (bucket_id = 'emotes');

-- Authenticated users can upload to their own folder
create policy "auth_upload_avatars" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "auth_upload_attachments" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments');

create policy "auth_upload_emotes" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'emotes');

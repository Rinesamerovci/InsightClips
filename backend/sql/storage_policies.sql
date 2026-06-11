-- InsightClips Supabase Storage buckets and policies
-- ==================================================
--
-- Run this after the public table schemas and final RLS policies.
-- Buckets stay private. The backend still serves protected downloads through
-- FastAPI routes, while policies keep each user's storage prefix isolated.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'podcast-sources',
    'podcast-sources',
    false,
    null,
    array[
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/wav',
      'audio/x-wav',
      'audio/webm',
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/webm',
      'video/x-matroska'
    ]
  ),
  (
    'clips',
    'clips',
    false,
    null,
    array[
      'application/json',
      'text/plain',
      'text/vtt',
      'video/mp4',
      'video/webm'
    ]
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Remove broad/default policies that may have been created from dashboard
-- templates. Keeping anon storage policies would make private media easier to
-- expose accidentally.
drop policy if exists "Give anon users access to JPG images in folder 1" on storage.objects;
drop policy if exists "Give anon users access to JPG images in folder 2" on storage.objects;
drop policy if exists "Give anon users access to JPG images in folder 3" on storage.objects;
drop policy if exists "Give anon users access to JPG images in folder 4" on storage.objects;

drop policy if exists "Users can read own podcast source objects" on storage.objects;
drop policy if exists "Users can upload own podcast source objects" on storage.objects;
drop policy if exists "Users can update own podcast source objects" on storage.objects;
drop policy if exists "Users can delete own podcast source objects" on storage.objects;
drop policy if exists "Service role manages podcast source objects" on storage.objects;

drop policy if exists "Users can read own clip objects" on storage.objects;
drop policy if exists "Service role manages clip objects" on storage.objects;

-- podcast-sources keys are written as:
-- {user_id}/sources/{filename}
create policy "Users can read own podcast source objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'podcast-sources'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can upload own podcast source objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'podcast-sources'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update own podcast source objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'podcast-sources'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'podcast-sources'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete own podcast source objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'podcast-sources'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Service role manages podcast source objects"
on storage.objects
for all
to service_role
using (bucket_id = 'podcast-sources')
with check (bucket_id = 'podcast-sources');

-- Generated/published clips are stored by podcast id. Users do not upload to
-- this bucket directly; backend service role publishes/removes objects and the
-- app serves downloads through ownership-checked API routes.
create policy "Users can read own clip objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'clips'
  and exists (
    select 1
    from public.podcasts
    where podcasts.id::text = (storage.foldername(storage.objects.name))[1]
      and podcasts.user_id = auth.uid()
  )
);

create policy "Service role manages clip objects"
on storage.objects
for all
to service_role
using (bucket_id = 'clips')
with check (bucket_id = 'clips');

-- Verification:
-- select id, public, file_size_limit, allowed_mime_types
-- from storage.buckets
-- where id in ('podcast-sources', 'clips')
-- order by id;
--
-- select policyname, roles, cmd
-- from pg_policies
-- where schemaname = 'storage'
--   and tablename = 'objects'
--   and (
--     policyname ilike '%podcast source%'
--     or policyname ilike '%clip objects%'
--   )
-- order by policyname;

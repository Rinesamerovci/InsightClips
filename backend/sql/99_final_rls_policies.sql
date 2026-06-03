begin;

alter table public.profiles enable row level security;
alter table public.podcasts enable row level security;
alter table public.scores enable row level security;
alter table public.clips enable row level security;
alter table public.clip_overlays enable row level security;
alter table public.clip_publications enable row level security;
alter table public.user_messages enable row level security;

-- PROFILES
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Service role manages profiles" on public.profiles;

create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Service role manages profiles"
on public.profiles
for all
to service_role
using (true)
with check (true);

-- PODCASTS
drop policy if exists "Users can view own podcasts" on public.podcasts;
drop policy if exists "Users can insert own podcasts" on public.podcasts;
drop policy if exists "Users can update own podcasts" on public.podcasts;
drop policy if exists "Service role manages podcasts" on public.podcasts;

create policy "Users can view own podcasts"
on public.podcasts
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own podcasts"
on public.podcasts
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own podcasts"
on public.podcasts
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Service role manages podcasts"
on public.podcasts
for all
to service_role
using (true)
with check (true);

-- SCORES
drop policy if exists "Users can view scores for own podcasts" on public.scores;
drop policy if exists "Service role can insert scores" on public.scores;
drop policy if exists "Service role manages scores" on public.scores;

create policy "Users can view scores for own podcasts"
on public.scores
for select
to authenticated
using (
  exists (
    select 1
    from public.podcasts
    where podcasts.id = scores.podcast_id
      and podcasts.user_id = auth.uid()
  )
);

create policy "Service role manages scores"
on public.scores
for all
to service_role
using (true)
with check (true);

-- CLIPS
drop policy if exists "Users can view clips for own podcasts" on public.clips;
drop policy if exists "Service role manages clips" on public.clips;

create policy "Users can view clips for own podcasts"
on public.clips
for select
to authenticated
using (
  exists (
    select 1
    from public.podcasts
    where podcasts.id = clips.podcast_id
      and podcasts.user_id = auth.uid()
  )
);

create policy "Service role manages clips"
on public.clips
for all
to service_role
using (true)
with check (true);

-- CLIP OVERLAYS
drop policy if exists "Users can view overlays for own podcasts" on public.clip_overlays;
drop policy if exists "Service role manages overlays" on public.clip_overlays;

create policy "Users can view overlays for own podcasts"
on public.clip_overlays
for select
to authenticated
using (
  exists (
    select 1
    from public.podcasts
    where podcasts.id = clip_overlays.podcast_id
      and podcasts.user_id = auth.uid()
  )
);

create policy "Service role manages overlays"
on public.clip_overlays
for all
to service_role
using (true)
with check (true);

-- CLIP PUBLICATIONS
drop policy if exists "Users can view publications for own podcasts" on public.clip_publications;
drop policy if exists "Service role manages publications" on public.clip_publications;

create policy "Users can view publications for own podcasts"
on public.clip_publications
for select
to authenticated
using (
  exists (
    select 1
    from public.podcasts
    where podcasts.id = clip_publications.podcast_id
      and podcasts.user_id = auth.uid()
  )
);

create policy "Service role manages publications"
on public.clip_publications
for all
to service_role
using (true)
with check (true);

-- USER MESSAGES
drop policy if exists "Users can submit own messages" on public.user_messages;
drop policy if exists "Users can view own messages" on public.user_messages;
drop policy if exists "Service role manages user messages" on public.user_messages;

create policy "Users can submit own messages"
on public.user_messages
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can view own messages"
on public.user_messages
for select
to authenticated
using (user_id = auth.uid());

create policy "Service role manages user messages"
on public.user_messages
for all
to service_role
using (true)
with check (true);

commit;

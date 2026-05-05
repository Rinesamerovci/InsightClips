create extension if not exists "pgcrypto";

create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references public.podcasts(id) on delete cascade,
  clip_number integer not null check (clip_number > 0),
  clip_start_sec double precision not null check (clip_start_sec >= 0),
  clip_end_sec double precision not null check (clip_end_sec >= 0),
  virality_score double precision not null check (virality_score >= 0 and virality_score <= 100),
  storage_path text,
  storage_url text,
  subtitle_url text,
  subtitle_text text,
  status text not null default 'processing',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists clips_podcast_id_idx on public.clips (podcast_id);
create unique index if not exists clips_podcast_clip_number_idx on public.clips (podcast_id, clip_number);

alter table public.clips enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'clips'
      and policyname = 'Users can view clips for own podcasts'
  ) then
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
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'clips'
      and policyname = 'Service role manages clips'
  ) then
    create policy "Service role manages clips"
      on public.clips
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

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

alter table public.clips
  add column if not exists generation_settings jsonb not null default '{"clip_duration_seconds":30,"number_of_clips":5,"topic_focus":null,"subtitles_enabled":true}'::jsonb,
  add column if not exists visual_output_mode text not null default 'original_people',
  add column if not exists effective_visual_output_mode text not null default 'original_people',
  add column if not exists render_fallback_reason text;

alter table public.clips
  drop constraint if exists clips_generation_settings_check;

alter table public.clips
  add constraint clips_generation_settings_check check (
    jsonb_typeof(generation_settings) = 'object'
    and generation_settings ? 'clip_duration_seconds'
    and (generation_settings ->> 'clip_duration_seconds')::integer between 8 and 90
    and generation_settings ? 'number_of_clips'
    and (generation_settings ->> 'number_of_clips')::integer between 1 and 10
    and generation_settings ? 'subtitles_enabled'
    and jsonb_typeof(generation_settings -> 'subtitles_enabled') = 'boolean'
  );

alter table public.clips
  drop constraint if exists clips_visual_output_mode_check;

alter table public.clips
  add constraint clips_visual_output_mode_check check (
    visual_output_mode in ('original_people', 'book_like', 'stylized_animated')
    and effective_visual_output_mode in ('original_people', 'book_like', 'stylized_animated')
  );

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

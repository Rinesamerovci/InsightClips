create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  free_trial_used boolean not null default false,
  full_name text,
  profile_picture_url text,
  export_settings jsonb not null default '{"preset_name":"youtube_landscape","export_mode":"landscape","crop_mode":"none","subtitle_timing_profile":"extended","mobile_optimized":false,"face_tracking_enabled":false,"subtitle_style":{"preset":"classic","font_family":"Arial","font_size":18,"primary_color":"#FFFFFF","outline_color":"#000000","background_color":"#000000","background_opacity":0.2,"position":"bottom","bold":false,"italic":false},"audio_enhancement":{"enabled":true,"normalize_loudness":true,"target_lufs":-16.0,"true_peak_db":-1.5,"status":"enabled"},"generation_settings":{"clip_duration_seconds":30,"number_of_clips":5,"topic_focus":null,"subtitles_enabled":true}}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.profiles
  add column if not exists email text,
  add column if not exists free_trial_used boolean not null default false,
  add column if not exists full_name text,
  add column if not exists profile_picture_url text,
  add column if not exists export_settings jsonb not null default '{"preset_name":"youtube_landscape","export_mode":"landscape","crop_mode":"none","subtitle_timing_profile":"extended","mobile_optimized":false,"face_tracking_enabled":false,"subtitle_style":{"preset":"classic","font_family":"Arial","font_size":18,"primary_color":"#FFFFFF","outline_color":"#000000","background_color":"#000000","background_opacity":0.2,"position":"bottom","bold":false,"italic":false},"audio_enhancement":{"enabled":true,"normalize_loudness":true,"target_lufs":-16.0,"true_peak_db":-1.5,"status":"enabled"},"generation_settings":{"clip_duration_seconds":30,"number_of_clips":5,"topic_focus":null,"subtitles_enabled":true}}'::jsonb,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

drop index if exists public.profiles_email_unique_idx;
create index if not exists profiles_email_idx on public.profiles (email);

drop trigger if exists on_auth_user_created_profile on auth.users;
drop function if exists public.handle_new_user_profile();

create table if not exists public.podcasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  duration integer not null default 0 check (duration >= 0),
  status text not null default 'draft',
  price numeric(10,2) not null default 0 check (price >= 0),
  payment_status text not null default 'pending',
  storage_path text,
  source_filename text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.podcasts
  add column if not exists price numeric(10,2) not null default 0,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists storage_path text,
  add column if not exists source_filename text,
  add column if not exists mime_type text,
  add column if not exists detected_format text,
  add column if not exists source_type text not null default 'upload',
  add column if not exists source_url text,
  add column if not exists external_source_id text,
  add column if not exists import_metadata jsonb not null default '{}'::jsonb;

alter table if exists public.podcasts
  drop constraint if exists podcasts_price_check;

alter table if exists public.podcasts
  add constraint podcasts_price_check check (price >= 0);

alter table if exists public.podcasts
  drop constraint if exists podcasts_status_check;

alter table if exists public.podcasts
  add constraint podcasts_status_check check (
    status in ('draft', 'awaiting_payment', 'ready_for_processing', 'processing', 'done', 'blocked')
  );

alter table if exists public.podcasts
  drop constraint if exists podcasts_payment_status_check;

alter table if exists public.podcasts
  add constraint podcasts_payment_status_check check (
    payment_status in ('pending', 'paid', 'not_required', 'failed')
  );

alter table if exists public.podcasts
  drop constraint if exists podcasts_source_type_check;

alter table if exists public.podcasts
  add constraint podcasts_source_type_check check (
    source_type in ('upload', 'youtube')
  );

alter table public.profiles enable row level security;
alter table public.podcasts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can view own profile'
  ) then
    create policy "Users can view own profile"
      on public.profiles
      for select
      to authenticated
      using (auth.uid() = id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can update own profile'
  ) then
    create policy "Users can update own profile"
      on public.profiles
      for update
      to authenticated
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'podcasts'
      and policyname = 'Users can view own podcasts'
  ) then
    create policy "Users can view own podcasts"
      on public.podcasts
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'podcasts'
      and policyname = 'Users can insert own podcasts'
  ) then
    create policy "Users can insert own podcasts"
      on public.podcasts
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'podcasts'
      and policyname = 'Users can update own podcasts'
  ) then
    create policy "Users can update own podcasts"
      on public.podcasts
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

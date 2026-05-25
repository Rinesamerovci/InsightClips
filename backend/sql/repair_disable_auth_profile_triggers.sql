drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_created_profile on auth.users;
drop trigger if exists handle_new_user on auth.users;
drop trigger if exists handle_new_user_profile on auth.users;
drop trigger if exists create_profile_for_new_user on auth.users;

drop function if exists public.handle_new_user();
drop function if exists public.handle_new_user_profile();
drop function if exists public.create_profile_for_new_user();

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

alter table public.profiles
  add column if not exists email text,
  add column if not exists free_trial_used boolean not null default false,
  add column if not exists full_name text,
  add column if not exists profile_picture_url text,
  add column if not exists export_settings jsonb not null default '{"preset_name":"youtube_landscape","export_mode":"landscape","crop_mode":"none","subtitle_timing_profile":"extended","mobile_optimized":false,"face_tracking_enabled":false,"subtitle_style":{"preset":"classic","font_family":"Arial","font_size":18,"primary_color":"#FFFFFF","outline_color":"#000000","background_color":"#000000","background_opacity":0.2,"position":"bottom","bold":false,"italic":false},"audio_enhancement":{"enabled":true,"normalize_loudness":true,"target_lufs":-16.0,"true_peak_db":-1.5,"status":"enabled"},"generation_settings":{"clip_duration_seconds":30,"number_of_clips":5,"topic_focus":null,"subtitles_enabled":true}}'::jsonb,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

drop index if exists public.profiles_email_unique_idx;
create index if not exists profiles_email_idx on public.profiles (email);

alter table public.profiles enable row level security;

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
end $$;

select
  'auth profile triggers disabled; backend creates profiles on login/verify' as status,
  count(*) as remaining_auth_user_triggers
from information_schema.triggers
where event_object_schema = 'auth'
  and event_object_table = 'users';

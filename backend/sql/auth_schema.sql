alter table public.profiles
  add column if not exists export_settings jsonb not null default '{"export_mode":"landscape","crop_mode":"none","mobile_optimized":false,"face_tracking_enabled":false,"subtitle_style":{"preset":"classic","font_family":"Arial","font_size":18,"primary_color":"#FFFFFF","outline_color":"#000000","background_color":"#000000","background_opacity":0.2,"position":"bottom","bold":false,"italic":false},"audio_enhancement":{"enabled":true,"normalize_loudness":true,"target_lufs":-16.0,"true_peak_db":-1.5,"status":"enabled"},"generation_settings":{"clip_duration_seconds":30,"number_of_clips":5,"topic_focus":null,"subtitles_enabled":true}}'::jsonb;

update public.profiles
set export_settings =
  (
    '{"export_mode":"landscape","crop_mode":"none","mobile_optimized":false,"face_tracking_enabled":false,"subtitle_style":{"preset":"classic","font_family":"Arial","font_size":18,"primary_color":"#FFFFFF","outline_color":"#000000","background_color":"#000000","background_opacity":0.2,"position":"bottom","bold":false,"italic":false},"audio_enhancement":{"enabled":true,"normalize_loudness":true,"target_lufs":-16.0,"true_peak_db":-1.5,"status":"enabled"},"generation_settings":{"clip_duration_seconds":30,"number_of_clips":5,"topic_focus":null,"subtitles_enabled":true}}'::jsonb
    || coalesce(export_settings, '{}'::jsonb)
  )
  || jsonb_build_object(
    'generation_settings',
    '{"clip_duration_seconds":30,"number_of_clips":5,"topic_focus":null,"subtitles_enabled":true}'::jsonb
      || coalesce(export_settings -> 'generation_settings', '{}'::jsonb)
  )
where jsonb_typeof(export_settings) = 'object';

alter table public.profiles
  drop constraint if exists profiles_export_settings_check;

alter table public.profiles
  add constraint profiles_export_settings_check check (
    jsonb_typeof(export_settings) = 'object'
    and export_settings ? 'export_mode'
    and export_settings ->> 'export_mode' in ('landscape', 'portrait')
    and export_settings ? 'crop_mode'
    and export_settings ->> 'crop_mode' in ('none', 'center_crop', 'smart_crop')
    and export_settings ? 'mobile_optimized'
    and jsonb_typeof(export_settings -> 'mobile_optimized') = 'boolean'
    and export_settings ? 'face_tracking_enabled'
    and jsonb_typeof(export_settings -> 'face_tracking_enabled') = 'boolean'
    and export_settings ? 'subtitle_style'
    and jsonb_typeof(export_settings -> 'subtitle_style') = 'object'
    and export_settings ? 'audio_enhancement'
    and jsonb_typeof(export_settings -> 'audio_enhancement') = 'object'
    and export_settings ? 'generation_settings'
    and jsonb_typeof(export_settings -> 'generation_settings') = 'object'
  );

create table if not exists public.user_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_type text not null default 'feedback',
  category text not null default 'general',
  subject text,
  message text not null,
  contact_email text,
  status text not null default 'received',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.user_messages
  drop constraint if exists user_messages_message_type_check;

alter table public.user_messages
  add constraint user_messages_message_type_check check (
    message_type in ('feedback', 'support', 'contact')
  );

alter table public.user_messages
  drop constraint if exists user_messages_category_check;

alter table public.user_messages
  add constraint user_messages_category_check check (
    category in ('bug', 'feature_request', 'general', 'billing', 'technical_support')
  );

alter table public.user_messages
  drop constraint if exists user_messages_status_check;

alter table public.user_messages
  add constraint user_messages_status_check check (
    status in ('received', 'triaged')
  );

alter table public.user_messages
  drop constraint if exists user_messages_message_length_check;

alter table public.user_messages
  add constraint user_messages_message_length_check check (
    length(trim(message)) between 10 and 2000
  );

create index if not exists user_messages_user_id_created_at_idx
  on public.user_messages (user_id, created_at desc);

alter table public.user_messages enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_messages'
      and policyname = 'Users can submit own messages'
  ) then
    create policy "Users can submit own messages"
      on public.user_messages
      for insert
      to authenticated
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_messages'
      and policyname = 'Users can view own messages'
  ) then
    create policy "Users can view own messages"
      on public.user_messages
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_messages'
      and policyname = 'Service role manages user messages'
  ) then
    create policy "Service role manages user messages"
      on public.user_messages
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

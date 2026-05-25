begin;

alter table public.profiles
  alter column export_settings set default '{"preset_name":"youtube_landscape","export_mode":"landscape","crop_mode":"none","subtitle_timing_profile":"extended","mobile_optimized":false,"face_tracking_enabled":false,"subtitle_style":{"preset":"classic","font_family":"Arial","font_size":18,"primary_color":"#FFFFFF","outline_color":"#000000","background_color":"#000000","background_opacity":0.2,"position":"bottom","bold":false,"italic":false},"audio_enhancement":{"enabled":true,"normalize_loudness":true,"target_lufs":-16.0,"true_peak_db":-1.5,"status":"enabled"},"generation_settings":{"clip_duration_seconds":30,"number_of_clips":5,"topic_focus":null,"subtitles_enabled":true}}'::jsonb;

update public.profiles
set export_settings =
  (
    '{"preset_name":"youtube_landscape","export_mode":"landscape","crop_mode":"none","subtitle_timing_profile":"extended","mobile_optimized":false,"face_tracking_enabled":false,"subtitle_style":{"preset":"classic","font_family":"Arial","font_size":18,"primary_color":"#FFFFFF","outline_color":"#000000","background_color":"#000000","background_opacity":0.2,"position":"bottom","bold":false,"italic":false},"audio_enhancement":{"enabled":true,"normalize_loudness":true,"target_lufs":-16.0,"true_peak_db":-1.5,"status":"enabled"},"generation_settings":{"clip_duration_seconds":30,"number_of_clips":5,"topic_focus":null,"subtitles_enabled":true}}'::jsonb
    || case
      when jsonb_typeof(export_settings) = 'object' then export_settings
      else '{}'::jsonb
    end
  )
  || jsonb_build_object(
    'subtitle_style',
    '{"preset":"classic","font_family":"Arial","font_size":18,"primary_color":"#FFFFFF","outline_color":"#000000","background_color":"#000000","background_opacity":0.2,"position":"bottom","bold":false,"italic":false}'::jsonb
      || coalesce(export_settings -> 'subtitle_style', '{}'::jsonb),
    'audio_enhancement',
    '{"enabled":true,"normalize_loudness":true,"target_lufs":-16.0,"true_peak_db":-1.5,"status":"enabled"}'::jsonb
      || coalesce(export_settings -> 'audio_enhancement', '{}'::jsonb),
    'generation_settings',
    '{"clip_duration_seconds":30,"number_of_clips":5,"topic_focus":null,"subtitles_enabled":true}'::jsonb
      || coalesce(export_settings -> 'generation_settings', '{}'::jsonb)
  )
where export_settings is null
   or jsonb_typeof(export_settings) is distinct from 'object'
   or not (export_settings ? 'preset_name')
   or not (export_settings ? 'subtitle_timing_profile')
   or not (export_settings ? 'generation_settings');

alter table public.profiles
  drop constraint if exists profiles_export_settings_check;

alter table public.profiles
  add constraint profiles_export_settings_check check (
    jsonb_typeof(export_settings) = 'object'
    and export_settings ? 'preset_name'
    and export_settings ->> 'preset_name' in ('youtube_landscape', 'youtube_shorts', 'instagram_reels', 'tiktok_vertical')
    and export_settings ? 'export_mode'
    and export_settings ->> 'export_mode' in ('landscape', 'portrait')
    and export_settings ? 'crop_mode'
    and export_settings ->> 'crop_mode' in ('none', 'center_crop', 'smart_crop')
    and export_settings ? 'subtitle_timing_profile'
    and export_settings ->> 'subtitle_timing_profile' in ('compact', 'balanced', 'extended')
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

commit;

alter table public.profiles
  add column if not exists export_settings jsonb not null default '{"export_mode":"landscape","crop_mode":"none","mobile_optimized":false,"face_tracking_enabled":false,"subtitle_style":{"preset":"classic","font_family":"Arial","font_size":18,"primary_color":"#FFFFFF","outline_color":"#000000","background_color":"#000000","background_opacity":0.2,"position":"bottom","bold":false,"italic":false},"audio_enhancement":{"enabled":true,"normalize_loudness":true,"target_lufs":-16.0,"true_peak_db":-1.5,"status":"enabled"}}'::jsonb;

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
  );

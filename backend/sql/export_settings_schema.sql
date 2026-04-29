alter table public.podcasts
  add column if not exists export_mode text not null default 'landscape',
  add column if not exists crop_mode text not null default 'none',
  add column if not exists mobile_optimized boolean not null default false,
  add column if not exists face_tracking_enabled boolean not null default false,
  add column if not exists subtitle_style jsonb not null default '{"preset":"classic","font_family":"Arial","font_size":18,"primary_color":"#FFFFFF","outline_color":"#000000","background_color":"#000000","background_opacity":0.2,"position":"bottom","bold":false,"italic":false}'::jsonb;

alter table public.podcasts
  drop constraint if exists podcasts_export_mode_check;

alter table public.podcasts
  add constraint podcasts_export_mode_check check (export_mode in ('landscape', 'portrait'));

alter table public.podcasts
  drop constraint if exists podcasts_crop_mode_check;

alter table public.podcasts
  add constraint podcasts_crop_mode_check check (crop_mode in ('none', 'center_crop', 'smart_crop'));

alter table public.podcasts
  drop constraint if exists podcasts_subtitle_style_check;

alter table public.podcasts
  add constraint podcasts_subtitle_style_check check (
    jsonb_typeof(subtitle_style) = 'object'
    and subtitle_style ? 'preset'
    and subtitle_style ->> 'preset' in ('classic', 'bold', 'minimal', 'boxed')
    and subtitle_style ? 'font_family'
    and jsonb_typeof(subtitle_style -> 'font_family') = 'string'
    and length(trim(subtitle_style ->> 'font_family')) between 1 and 64
    and subtitle_style ? 'font_size'
    and case
      when jsonb_typeof(subtitle_style -> 'font_size') = 'number'
      then (subtitle_style ->> 'font_size')::integer between 12 and 72
      else false
    end
    and subtitle_style ? 'primary_color'
    and subtitle_style ->> 'primary_color' ~ '^#[0-9A-Fa-f]{6}$'
    and subtitle_style ? 'outline_color'
    and subtitle_style ->> 'outline_color' ~ '^#[0-9A-Fa-f]{6}$'
    and subtitle_style ? 'background_color'
    and subtitle_style ->> 'background_color' ~ '^#[0-9A-Fa-f]{6}$'
    and subtitle_style ? 'background_opacity'
    and case
      when jsonb_typeof(subtitle_style -> 'background_opacity') = 'number'
      then (subtitle_style ->> 'background_opacity')::numeric between 0 and 1
      else false
    end
    and subtitle_style ? 'position'
    and subtitle_style ->> 'position' in ('top', 'center', 'bottom')
    and subtitle_style ? 'bold'
    and jsonb_typeof(subtitle_style -> 'bold') = 'boolean'
    and subtitle_style ? 'italic'
    and jsonb_typeof(subtitle_style -> 'italic') = 'boolean'
    and (
      subtitle_style ->> 'preset' = 'minimal'
      or subtitle_style ->> 'outline_color' <> subtitle_style ->> 'primary_color'
    )
    and (
      subtitle_style ->> 'preset' <> 'minimal'
      or (subtitle_style ->> 'background_opacity')::numeric = 0
    )
    and (
      subtitle_style ->> 'preset' <> 'boxed'
      or (subtitle_style ->> 'background_opacity')::numeric > 0
    )
  );

alter table public.clips
  add column if not exists export_mode text not null default 'landscape',
  add column if not exists crop_mode text not null default 'none',
  add column if not exists mobile_optimized boolean not null default false,
  add column if not exists face_tracking_enabled boolean not null default false,
  add column if not exists subtitle_style jsonb not null default '{"preset":"classic","font_family":"Arial","font_size":18,"primary_color":"#FFFFFF","outline_color":"#000000","background_color":"#000000","background_opacity":0.2,"position":"bottom","bold":false,"italic":false}'::jsonb;

alter table public.clips
  drop constraint if exists clips_export_mode_check;

alter table public.clips
  add constraint clips_export_mode_check check (export_mode in ('landscape', 'portrait'));

alter table public.clips
  drop constraint if exists clips_crop_mode_check;

alter table public.clips
  add constraint clips_crop_mode_check check (crop_mode in ('none', 'center_crop', 'smart_crop'));

alter table public.clips
  drop constraint if exists clips_subtitle_style_check;

alter table public.clips
  add constraint clips_subtitle_style_check check (
    jsonb_typeof(subtitle_style) = 'object'
    and subtitle_style ? 'preset'
    and subtitle_style ->> 'preset' in ('classic', 'bold', 'minimal', 'boxed')
    and subtitle_style ? 'font_family'
    and jsonb_typeof(subtitle_style -> 'font_family') = 'string'
    and length(trim(subtitle_style ->> 'font_family')) between 1 and 64
    and subtitle_style ? 'font_size'
    and case
      when jsonb_typeof(subtitle_style -> 'font_size') = 'number'
      then (subtitle_style ->> 'font_size')::integer between 12 and 72
      else false
    end
    and subtitle_style ? 'primary_color'
    and subtitle_style ->> 'primary_color' ~ '^#[0-9A-Fa-f]{6}$'
    and subtitle_style ? 'outline_color'
    and subtitle_style ->> 'outline_color' ~ '^#[0-9A-Fa-f]{6}$'
    and subtitle_style ? 'background_color'
    and subtitle_style ->> 'background_color' ~ '^#[0-9A-Fa-f]{6}$'
    and subtitle_style ? 'background_opacity'
    and case
      when jsonb_typeof(subtitle_style -> 'background_opacity') = 'number'
      then (subtitle_style ->> 'background_opacity')::numeric between 0 and 1
      else false
    end
    and subtitle_style ? 'position'
    and subtitle_style ->> 'position' in ('top', 'center', 'bottom')
    and subtitle_style ? 'bold'
    and jsonb_typeof(subtitle_style -> 'bold') = 'boolean'
    and subtitle_style ? 'italic'
    and jsonb_typeof(subtitle_style -> 'italic') = 'boolean'
    and (
      subtitle_style ->> 'preset' = 'minimal'
      or subtitle_style ->> 'outline_color' <> subtitle_style ->> 'primary_color'
    )
    and (
      subtitle_style ->> 'preset' <> 'minimal'
      or (subtitle_style ->> 'background_opacity')::numeric = 0
    )
    and (
      subtitle_style ->> 'preset' <> 'boxed'
      or (subtitle_style ->> 'background_opacity')::numeric > 0
    )
  );

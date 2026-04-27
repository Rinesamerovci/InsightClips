alter table public.podcasts
  add column if not exists export_mode text not null default 'landscape',
  add column if not exists crop_mode text not null default 'none',
  add column if not exists mobile_optimized boolean not null default false,
  add column if not exists face_tracking_enabled boolean not null default false;

alter table public.podcasts
  drop constraint if exists podcasts_export_mode_check;

alter table public.podcasts
  add constraint podcasts_export_mode_check check (export_mode in ('landscape', 'portrait'));

alter table public.podcasts
  drop constraint if exists podcasts_crop_mode_check;

alter table public.podcasts
  add constraint podcasts_crop_mode_check check (crop_mode in ('none', 'center_crop', 'smart_crop'));

alter table public.clips
  add column if not exists export_mode text not null default 'landscape',
  add column if not exists crop_mode text not null default 'none',
  add column if not exists mobile_optimized boolean not null default false,
  add column if not exists face_tracking_enabled boolean not null default false;

alter table public.clips
  drop constraint if exists clips_export_mode_check;

alter table public.clips
  add constraint clips_export_mode_check check (export_mode in ('landscape', 'portrait'));

alter table public.clips
  drop constraint if exists clips_crop_mode_check;

alter table public.clips
  add constraint clips_crop_mode_check check (crop_mode in ('none', 'center_crop', 'smart_crop'));

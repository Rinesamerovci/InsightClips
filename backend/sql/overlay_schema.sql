create table if not exists public.clip_overlays (
  id uuid primary key,
  clip_id uuid not null references public.clips(id) on delete cascade,
  podcast_id uuid not null references public.podcasts(id) on delete cascade,
  keyword varchar,
  overlay_category varchar,
  overlay_asset varchar,
  asset_path text,
  matched_text text,
  position varchar,
  scale float,
  opacity float,
  margin_x integer,
  margin_y integer,
  render_start_seconds float,
  render_end_seconds float,
  applied boolean not null default false,
  rendered boolean not null default false,
  render_status varchar,
  confidence float,
  created_at timestamptz not null default now()
);

alter table public.clip_overlays add column if not exists asset_path text;
alter table public.clip_overlays add column if not exists position varchar;
alter table public.clip_overlays add column if not exists scale float;
alter table public.clip_overlays add column if not exists opacity float;
alter table public.clip_overlays add column if not exists margin_x integer;
alter table public.clip_overlays add column if not exists margin_y integer;
alter table public.clip_overlays add column if not exists render_start_seconds float;
alter table public.clip_overlays add column if not exists render_end_seconds float;
alter table public.clip_overlays add column if not exists rendered boolean not null default false;
alter table public.clip_overlays add column if not exists render_status varchar;

create unique index if not exists clip_overlays_clip_id_idx
  on public.clip_overlays (clip_id);

create index if not exists clip_overlays_podcast_id_idx
  on public.clip_overlays (podcast_id);

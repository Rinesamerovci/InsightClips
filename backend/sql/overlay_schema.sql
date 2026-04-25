create table if not exists public.clip_overlays (
  id uuid primary key,
  clip_id uuid not null references public.clips(id) on delete cascade,
  podcast_id uuid not null references public.podcasts(id) on delete cascade,
  keyword varchar,
  overlay_category varchar,
  overlay_asset varchar,
  matched_text text,
  applied boolean not null default false,
  confidence float,
  created_at timestamptz not null default now()
);

create unique index if not exists clip_overlays_clip_id_idx
  on public.clip_overlays (clip_id);

create index if not exists clip_overlays_podcast_id_idx
  on public.clip_overlays (podcast_id);

alter table public.clips
  add column if not exists published boolean not null default false,
  add column if not exists download_url text,
  add column if not exists published_at timestamptz,
  add column if not exists view_count integer not null default 0,
  add column if not exists download_count integer not null default 0;

create index if not exists clips_podcast_published_idx
  on public.clips (podcast_id, published);

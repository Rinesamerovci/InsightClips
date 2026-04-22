alter table public.clips
  add column if not exists published boolean not null default false,
  add column if not exists download_url text,
  add column if not exists published_at timestamptz;

create index if not exists clips_podcast_published_idx
  on public.clips (podcast_id, published);

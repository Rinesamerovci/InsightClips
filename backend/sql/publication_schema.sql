alter table public.clips
  add column if not exists published boolean not null default false,
  add column if not exists download_url text,
  add column if not exists published_at timestamptz,
  add column if not exists view_count integer not null default 0,
  add column if not exists download_count integer not null default 0;

create index if not exists clips_podcast_published_idx
  on public.clips (podcast_id, published);

create table if not exists public.clip_publications (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips(id) on delete cascade,
  podcast_id uuid not null references public.podcasts(id) on delete cascade,
  destination text not null default 'download',
  status text not null default 'pending',
  download_url text,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clip_id, destination)
);

alter table public.clip_publications
  drop constraint if exists clip_publications_destination_check;

alter table public.clip_publications
  add constraint clip_publications_destination_check check (
    destination in ('download', 'tiktok', 'instagram', 'youtube', 'other')
  );

alter table public.clip_publications
  drop constraint if exists clip_publications_status_check;

alter table public.clip_publications
  add constraint clip_publications_status_check check (
    status in ('pending', 'published', 'failed', 'revoked')
  );

create index if not exists clip_publications_podcast_status_idx
  on public.clip_publications (podcast_id, status);

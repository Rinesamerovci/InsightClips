create extension if not exists "pgcrypto";

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references public.podcasts (id) on delete cascade,
  segment_start_sec double precision not null check (segment_start_sec >= 0),
  segment_end_sec double precision not null check (segment_end_sec >= 0),
  virality_score double precision not null check (virality_score >= 0 and virality_score <= 100),
  transcript_snippet text not null,
  sentiment varchar(16) not null check (sentiment in ('positive', 'neutral', 'negative')),
  keywords text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists scores_podcast_id_created_at_idx
  on public.scores (podcast_id, created_at desc);

create index if not exists scores_podcast_id_virality_score_idx
  on public.scores (podcast_id, virality_score desc);

alter table public.scores enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'scores'
      and policyname = 'Users can view scores for own podcasts'
  ) then
    create policy "Users can view scores for own podcasts"
      on public.scores
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.podcasts
          where podcasts.id = scores.podcast_id
            and podcasts.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'scores'
      and policyname = 'Service role can insert scores'
  ) then
    create policy "Service role can insert scores"
      on public.scores
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.podcasts
          where podcasts.id = scores.podcast_id
            and podcasts.user_id = auth.uid()
        )
      );
  end if;
end $$;

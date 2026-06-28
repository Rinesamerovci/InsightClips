begin;

-- Persist clip/topic match state and AI-generated hooks for generated clips.
alter table public.clips
  add column if not exists topic_matched boolean not null default false,
  add column if not exists smart_hooks jsonb not null default '[]'::jsonb;

update public.clips
set topic_matched = coalesce(topic_matched, false)
where topic_matched is null;

update public.clips
set smart_hooks = coalesce(smart_hooks, '[]'::jsonb)
where smart_hooks is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clips_smart_hooks_check'
  ) then
    alter table public.clips
      add constraint clips_smart_hooks_check
      check (jsonb_typeof(smart_hooks) = 'array');
  end if;
end $$;

-- Keep scoring rows aligned with the in-memory analysis model.
alter table public.scores
  add column if not exists topic_matched boolean not null default false,
  add column if not exists smart_hooks jsonb not null default '[]'::jsonb;

update public.scores
set topic_matched = coalesce(topic_matched, false)
where topic_matched is null;

update public.scores
set smart_hooks = coalesce(smart_hooks, '[]'::jsonb)
where smart_hooks is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scores_smart_hooks_check'
  ) then
    alter table public.scores
      add constraint scores_smart_hooks_check
      check (jsonb_typeof(smart_hooks) = 'array');
  end if;
end $$;

commit;

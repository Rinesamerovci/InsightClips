create table if not exists public.free_trial_usage (
  email text primary key,
  first_profile_id uuid,
  used_seconds numeric(12,2) not null default 0,
  first_used_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.free_trial_usage
  add column if not exists email text,
  add column if not exists first_profile_id uuid,
  add column if not exists used_seconds numeric(12,2) not null default 0,
  add column if not exists first_used_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

insert into public.free_trial_usage (email, first_profile_id, used_seconds)
select
  lower(profiles.email),
  profiles.id,
  least(
    1800,
    coalesce(
      sum(podcasts.duration) filter (
        where podcasts.price = 0
          and podcasts.payment_status = 'not_required'
      ),
      0
    )
  )::numeric(12,2)
from public.profiles
left join public.podcasts
  on podcasts.user_id = profiles.id
where profiles.email is not null
group by profiles.email, profiles.id
having profiles.free_trial_used is true
   or coalesce(
        sum(podcasts.duration) filter (
          where podcasts.price = 0
            and podcasts.payment_status = 'not_required'
        ),
        0
      ) > 0
on conflict (email) do update
set
  first_profile_id = coalesce(public.free_trial_usage.first_profile_id, excluded.first_profile_id),
  used_seconds = greatest(public.free_trial_usage.used_seconds, excluded.used_seconds),
  updated_at = timezone('utc', now());

alter table public.free_trial_usage enable row level security;

drop policy if exists "Service role manages free trial usage" on public.free_trial_usage;
create policy "Service role manages free trial usage"
on public.free_trial_usage
for all
to service_role
using (true)
with check (true);

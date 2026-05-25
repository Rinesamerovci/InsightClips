-- Repair existing podcast rows that were saved before the final payment gate.
-- Run this once after schema files if old <=30 minute imports/uploads were
-- accidentally allowed more than one free processing pass per user.
--
-- Rules:
-- - The first <=30 minute free podcast per user remains free.
-- - Later <=30 minute podcasts for the same user require the short price.
-- - Any >30 minute podcast marked as not_required is moved to awaiting_payment.
-- - Profiles are synced so users who already consumed a free podcast have
--   free_trial_used = true.

begin;

with free_candidates as (
  select
    id,
    user_id,
    row_number() over (
      partition by user_id
      order by created_at asc, id asc
    ) as free_rank
  from public.podcasts
  where duration <= 1800
    and coalesce(price, 0) = 0
    and payment_status = 'not_required'
),
extra_free_podcasts as (
  update public.podcasts as podcasts
  set
    status = 'awaiting_payment',
    payment_status = 'pending',
    price = 1.00,
    updated_at = timezone('utc', now())
  from free_candidates
  where podcasts.id = free_candidates.id
    and free_candidates.free_rank > 1
  returning podcasts.id
),
paid_duration_podcasts as (
  update public.podcasts
  set
    status = 'awaiting_payment',
    payment_status = 'pending',
    price = case
      when duration <= 3600 then 2.00
      else 4.00
    end,
    updated_at = timezone('utc', now())
  where duration > 1800
    and duration <= 7200
    and payment_status = 'not_required'
  returning id
)
update public.profiles as profiles
set
  free_trial_used = true,
  updated_at = timezone('utc', now())
where exists (
  select 1
  from public.podcasts
  where podcasts.user_id = profiles.id
    and podcasts.duration <= 1800
    and podcasts.payment_status = 'not_required'
    and coalesce(podcasts.price, 0) = 0
);

commit;


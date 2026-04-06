create extension if not exists "pgcrypto";

alter table if exists public.profiles
  add column if not exists full_name text,
  add column if not exists profile_picture_url text,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists profiles_email_unique_idx on public.profiles (email);

create table if not exists public.podcasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  duration integer not null default 0 check (duration >= 0),
  status text not null default 'queued',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles enable row level security;
alter table public.podcasts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can view own profile'
  ) then
    create policy "Users can view own profile"
      on public.profiles
      for select
      to authenticated
      using (auth.uid() = id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can update own profile'
  ) then
    create policy "Users can update own profile"
      on public.profiles
      for update
      to authenticated
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'podcasts'
      and policyname = 'Users can view own podcasts'
  ) then
    create policy "Users can view own podcasts"
      on public.podcasts
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'podcasts'
      and policyname = 'Users can insert own podcasts'
  ) then
    create policy "Users can insert own podcasts"
      on public.podcasts
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'podcasts'
      and policyname = 'Users can update own podcasts'
  ) then
    create policy "Users can update own podcasts"
      on public.podcasts
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

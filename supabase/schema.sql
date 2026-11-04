create extension if not exists pgcrypto;
create table if not exists public.team_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null, role text not null check(role in ('owner','admin','editor')),
 active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.creators (
 id uuid primary key default gen_random_uuid(), name text not null, role text not null default 'Creator',
 bio text not null default '', youtube_url text not null, youtube_channel_id text not null unique,
 youtube_title text, avatar_url text, subscriber_count bigint, video_count bigint, view_count bigint,
 youtube_synced_at timestamptz, featured boolean not null default false, published boolean not null default true,
 sort_order integer not null default 100, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.applications (
 id uuid primary key default gen_random_uuid(), full_name text not null, email text not null,
 age integer not null check(age between 13 and 99), game text not null, role text not null,
 experience text not null default '', youtube_url text not null default '', discord_tag text not null default '',
 availability text not null default '', status text not null default 'pending' check(status in ('pending','reviewing','accepted','rejected')),
 admin_notes text not null default '', reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists applications_created_idx on public.applications(created_at desc);
create index if not exists applications_status_idx on public.applications(status);
create index if not exists creators_public_idx on public.creators(published,sort_order);
alter table public.team_members enable row level security;
alter table public.creators enable row level security;
alter table public.applications enable row level security;
drop policy if exists "Public can view published creators" on public.creators;
create policy "Public can view published creators" on public.creators for select to anon,authenticated using(published=true);
-- Applications and team_members intentionally have no public policies. Server uses service-role key.
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists creators_updated_at on public.creators;
create trigger creators_updated_at before update on public.creators for each row execute function public.set_updated_at();
-- After creating your first Auth user, run (replace UUID and email):
-- insert into public.team_members(user_id,email,role) values('AUTH-USER-UUID','owner@example.com','owner');

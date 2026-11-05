
-- Maharaja Discord bot integration. Run after the existing schema.sql.
create table if not exists public.discord_settings (
 id integer primary key check (id = 1),
 guild_id text not null,
 welcome_enabled boolean not null default false,
 welcome_channel_id text not null default '',
 welcome_message text not null default 'Welcome {user} to **{server}**! You are member #{memberCount}.',
 ticket_category_id text not null default '',
 ticket_panel_channel_id text not null default '',
 ticket_log_channel_id text not null default '',
 ticket_support_role_id text not null default '',
 updated_at timestamptz not null default now()
);
create table if not exists public.discord_giveaways (
 id uuid primary key default gen_random_uuid(),
 guild_id text not null,
 channel_id text not null,
 message_id text,
 prize text not null,
 winners_count integer not null default 1 check(winners_count between 1 and 20),
 ends_at timestamptz not null,
 status text not null default 'active' check(status in ('active','ended','cancelled')),
 winner_ids jsonb not null default '[]'::jsonb,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists discord_giveaways_due_idx on public.discord_giveaways(status,ends_at);
create table if not exists public.discord_giveaway_entries (
 id uuid primary key default gen_random_uuid(),
 giveaway_id uuid not null references public.discord_giveaways(id) on delete cascade,
 user_id text not null,
 created_at timestamptz not null default now(),
 unique(giveaway_id,user_id)
);
create table if not exists public.discord_tickets (
 id uuid primary key default gen_random_uuid(),
 guild_id text not null,
 channel_id text not null unique,
 opener_id text not null,
 status text not null default 'open' check(status in ('open','closed')),
 created_at timestamptz not null default now(),
 closed_at timestamptz
);
create table if not exists public.discord_reaction_roles (
 id uuid primary key default gen_random_uuid(),
 guild_id text not null,
 channel_id text not null,
 message_id text,
 role_id text not null,
 label text not null,
 emoji text,
 created_at timestamptz not null default now()
);
alter table public.discord_settings enable row level security;
alter table public.discord_giveaways enable row level security;
alter table public.discord_giveaway_entries enable row level security;
alter table public.discord_tickets enable row level security;
alter table public.discord_reaction_roles enable row level security;
-- No client policies: the existing Express API uses the Supabase service-role key
-- after verifying that the caller is an active owner/admin.

-- ─────────────────────────────────────────────────────────────
--  Hockey Drills Lab — Supabase setup
--  Run this once in the Supabase SQL editor (Dashboard → SQL Editor)
-- ─────────────────────────────────────────────────────────────

-- ── Drill table ──────────────────────────────────────────────
create table if not exists drill (
  id         bigserial    primary key,
  user_id    uuid         not null references auth.users on delete cascade,
  coach      text         not null,
  slug       text         not null,
  title      text         not null,
  tags       text         not null default '[]',
  saved_at   timestamptz  not null default now(),
  scene      text         not null,
  thumbnail  text,
  unique (user_id, slug)
);

alter table drill enable row level security;

-- Anyone logged in (or anonymous) can read all drills
create policy "Anyone can view drills"
  on drill for select using (true);

-- Users can only insert/update/delete their own
create policy "Users insert own drills"
  on drill for insert with check (auth.uid() = user_id);

create policy "Users update own drills"
  on drill for update using (auth.uid() = user_id);

create policy "Users delete own drills"
  on drill for delete using (auth.uid() = user_id);


-- ── Practice table ────────────────────────────────────────────
create table if not exists practice (
  id        bigserial    primary key,
  user_id   uuid         not null references auth.users on delete cascade,
  coach     text         not null,
  slug      text         not null,
  name      text         not null,
  date      text         not null default '',
  team      text         not null default '',
  target    int          not null default 60,
  items     text         not null default '[]',
  saved_at  timestamptz  not null default now(),
  unique (user_id, slug)
);

alter table practice enable row level security;

create policy "Anyone can view practices"
  on practice for select using (true);

create policy "Users insert own practices"
  on practice for insert with check (auth.uid() = user_id);

create policy "Users update own practices"
  on practice for update using (auth.uid() = user_id);

create policy "Users delete own practices"
  on practice for delete using (auth.uid() = user_id);

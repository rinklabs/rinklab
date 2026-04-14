# 🏒 Rink Labs

**Coaching & Practices, Simplified.**

A free, open-source web app for volunteer youth hockey coaches. Design custom drill diagrams on an interactive rink canvas, build structured practice plans, and share everything with your team — no install required.

**Live site:** [your-username.github.io/HockeyDrills](https://your-username.github.io/HockeyDrills) *(update this link)*

---

## Features

- **Drill Canvas** — Draw drills on a full or half rink with players, pylons, nets, pucks, lines, arrows, and freehand pen paths
- **Practice Plan Builder** — Assemble timed practice plans from your saved drill library, with PDF export
- **Team Collaboration** — Create or join teams with a shareable invite code; share drills and practices across coaches
- **Auth & Cloud Save** — Email/password sign-in via Supabase; all drills and practices saved to the cloud
- **Stats Page** — Live coach and drill counts pulled from the database

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS, HTML5 Canvas, SVG |
| Backend / Auth / DB | [Supabase](https://supabase.com) (PostgreSQL + RLS) |
| Hosting | GitHub Pages |
| No build step | Drop files in `docs/`, push to `main` |

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/imo06/HockeyDrills.git
cd HockeyDrills
```

There is no build step. The project is plain HTML/CSS/JS served from the `docs/` folder.

To preview locally, use any static file server. With Python:

```bash
cd docs
python3 -m http.server 8080
# Open http://localhost:8080
```

Or with the VS Code **Live Server** extension, right-click `docs/index.html` → *Open with Live Server*.

---

### 2. Set Up Supabase

The app uses Supabase for authentication, the database, and row-level security. You need your own Supabase project to run a live instance.

#### 2a. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New Project** and fill in the name and password.
3. Once the project is ready, go to **Project Settings → API**.
4. Copy your **Project URL** and **anon public** key.

#### 2b. Add Your Keys

Open `docs/js/config.js` and replace the placeholder values:

```js
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';

window._supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

> The anon key is safe to commit — security is enforced by Row Level Security policies on the database, not by keeping the key secret.

#### 2c. Create the Database Tables

In the Supabase dashboard, go to **SQL Editor** and run the following:

```sql
-- Users are managed by Supabase Auth automatically.

-- Teams
create table team (
  id        bigint generated always as identity primary key,
  name      text not null,
  code      text not null unique,
  owner_id  uuid references auth.users(id) on delete cascade
);

-- Team membership (many-to-many: coaches ↔ teams)
create table team_member (
  id       bigint generated always as identity primary key,
  team_id  bigint references team(id) on delete cascade,
  user_id  uuid references auth.users(id) on delete cascade,
  unique(team_id, user_id)
);

-- Drills
create table drill (
  id        bigint generated always as identity primary key,
  user_id   uuid references auth.users(id) on delete cascade,
  title     text,
  coach     text,
  tags      text default '[]',
  scene     text,
  thumbnail text,
  saved_at  timestamptz default now()
);

-- Practice plans
create table practice (
  id       bigint generated always as identity primary key,
  user_id  uuid references auth.users(id) on delete cascade,
  team_id  bigint references team(id) on delete set null,
  coach    text,
  slug     text,
  name     text,
  date     date,
  team     text,
  target   int default 60,
  items    text default '[]',
  saved_at timestamptz default now(),
  unique(user_id, slug)
);
```

#### 2d. Enable Row Level Security

Still in the SQL Editor, run:

```sql
-- Enable RLS on all tables
alter table team        enable row level security;
alter table team_member enable row level security;
alter table drill       enable row level security;
alter table practice    enable row level security;

-- Drills: anyone can read, only owner can write
create policy "Drills readable by all" on drill for select using (true);
create policy "Drills writable by owner" on drill for all using (auth.uid() = user_id);

-- Practices: team practices readable by team members; private readable by owner
create policy "Practices readable" on practice for select
  using (
    user_id = auth.uid()
    or team_id in (
      select team_id from team_member where user_id = auth.uid()
    )
  );
create policy "Practices writable by owner" on practice for all using (auth.uid() = user_id);

-- Teams: readable by members, writable by owner
create policy "Teams readable by members" on team for select
  using (
    id in (select team_id from team_member where user_id = auth.uid())
  );
create policy "Teams writable by owner" on team for all using (auth.uid() = owner_id);

-- Team members: readable by members of same team, writable by self
create policy "Memberships readable" on team_member for select
  using (user_id = auth.uid() or team_id in (
    select team_id from team_member where user_id = auth.uid()
  ));
create policy "Memberships writable by self" on team_member for all using (auth.uid() = user_id);
```

#### 2e. Add the `get_coach_count` RPC (for the Stats page)

```sql
create or replace function get_coach_count()
returns bigint
language sql security definer
as $$
  select count(*) from auth.users;
$$;
```

#### 2f. Add the `delete_user` RPC (for account deletion)

```sql
create or replace function delete_user()
returns void
language sql security definer
as $$
  delete from auth.users where id = auth.uid();
$$;
```

#### 2g. Enable Email Auth

In the Supabase dashboard: **Authentication → Providers → Email** — make sure it is enabled. For development, you can disable email confirmation under **Authentication → Settings**.

---

### 3. Deploy to GitHub Pages

1. Push your code to the `main` branch of your repository.
2. In the repo on GitHub, go to **Settings → Pages**.
3. Under *Source*, choose **Deploy from a branch**.
4. Set the branch to `main` and the folder to `/docs`.
5. Click **Save**. Your site will be live at `https://your-username.github.io/HockeyDrills` within a minute or two.

Any subsequent `git push` to `main` will automatically redeploy.

---

## Project Structure

```
docs/
├── index.html          # Home page & auth
├── canvas.html         # Drill diagram editor
├── practice.html       # Practice plan builder
├── stats.html          # Community stats
├── tutorial.html       # How-to guide
├── terms_conditions.html
├── style.css           # Global styles & design tokens
├── assets/
│   ├── NHLRink.svg     # Rink background (hero banner)
│   ├── rink-full.svg   # Full rink canvas background
│   └── rink-half.svg   # Half rink canvas background
└── js/
    ├── config.js       # Supabase keys (edit this)
    ├── state.js        # Canvas app state
    ├── renderer.js     # Canvas rendering engine
    ├── interaction.js  # Mouse/touch event handling
    ├── io.js           # Save/load drill logic
    ├── rink.js         # Rink SVG setup
    ├── assets.js       # SVG asset cache (pylons, nets)
    ├── toast.js        # Toast notification helper
    └── report.js       # PDF/print export helpers
```

---

## Contributing

Contributions, bug reports, and feature requests are welcome! Please open an issue or email us at [rinklabs.admin@gmail.com](mailto:rinklabs.admin@gmail.com).

If you'd like to contribute code:

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push and open a pull request

---

## License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2024 Rink Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

*Built for volunteer youth hockey coaches. See you at the rink! 🏒*

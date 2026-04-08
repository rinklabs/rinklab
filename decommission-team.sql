-- ─────────────────────────────────────────────────────────────
--  Decommission a team (admin use)
--
--  Instructions:
--    1. Replace the team name or code below
--    2. Run the SELECTs first to confirm the right team
--    3. Uncomment and run the action blocks one at a time
-- ─────────────────────────────────────────────────────────────

-- ── Step 1: Find the team ─────────────────────────────────────
select t.id, t.name, t.code, u.email as owner_email, t.created_at
from team t
join auth.users u on u.id = t.owner_id
where t.name = 'Team Name Here'   -- ← change this (or use t.code = 'ABC123')
order by t.created_at;


-- ── Step 2: Preview members ───────────────────────────────────
select u.email, tm.joined_at
from team_member tm
join auth.users u on u.id = tm.user_id
where tm.team_id = (select id from team where name = 'Team Name Here');


-- ── Step 3: Preview shared practices that will be unshared ────
select id, name, coach, saved_at
from practice
where team_id = (select id from team where name = 'Team Name Here');


-- ── Step 4: Unshare all practices (makes them private again) ──
-- Uncomment to run:

-- update practice
-- set team_id = null
-- where team_id = (select id from team where name = 'Team Name Here');


-- ── Step 5: Delete the team ───────────────────────────────────
-- This cascades automatically:
--   - All team_member rows are deleted
--   - The team record is deleted
-- Uncomment to run:

-- delete from team
-- where name = 'Team Name Here';

-- Run in the Supabase SQL editor. If team.id is not bigint, change p_team_id's type.

create or replace function public.get_team_members(p_team_id bigint)
returns table (user_id uuid, display_name text, is_owner boolean)
language sql security definer set search_path = public as $$
  select tm.user_id,
         coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), 'Coach'),
         (t.owner_id = tm.user_id)
  from team_member tm
  join team t       on t.id = tm.team_id
  join auth.users u on u.id = tm.user_id
  where tm.team_id = p_team_id
    and exists (select 1 from team_member me
                where me.team_id = p_team_id and me.user_id = auth.uid())
  order by (t.owner_id = tm.user_id) desc, 2;
$$;

create or replace function public.kick_team_member(p_team_id bigint, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from team where id = p_team_id and owner_id = auth.uid()) then
    raise exception 'Only the team owner can remove members';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'The owner cannot be removed';
  end if;
  delete from team_member where team_id = p_team_id and user_id = p_user_id;
end;
$$;

revoke all on function public.get_team_members(bigint)       from public, anon;
revoke all on function public.kick_team_member(bigint, uuid) from public, anon;
grant execute on function public.get_team_members(bigint)       to authenticated;
grant execute on function public.kick_team_member(bigint, uuid) to authenticated;

-- "New code" uses a plain update on team; it already works for rename, so the
-- owner UPDATE policy exists. Code must have a unique constraint for retry logic:
-- alter table team add constraint team_code_key unique (code);

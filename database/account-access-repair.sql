-- Account permissions and quota repair. No existing users or payments are deleted.
alter table private.studio_admins enable row level security;
grant usage on schema private to authenticated;
revoke all on private.studio_admins from anon, authenticated;

alter policy studio_profiles_insert on public.studio_profiles
with check (
  private.is_studio_admin() or (
    user_id = (select auth.uid()) and role = 'user' and plan_code = 'free'
    and access_mode = 'limited' and render_limit = 2 and renders_used_week = 0
    and week_started_at = date_trunc('week', now())
  )
);

create or replace function public.studio_protect_profile()
returns trigger language plpgsql set search_path = public, private as $$
begin
  if current_user <> 'service_role' and not private.is_studio_admin() then
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    new.role := old.role;
    new.plan_code := old.plan_code;
    new.access_mode := old.access_mode;
    new.render_limit := old.render_limit;
    if old.week_started_at < date_trunc('week', now())
       and new.renders_used_week = 0
       and new.week_started_at = date_trunc('week', now()) then
      null;
    else
      new.week_started_at := old.week_started_at;
      if new.renders_used_week <> old.renders_used_week + 1 then
        new.renders_used_week := old.renders_used_week;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.reserve_studio_render()
returns jsonb language plpgsql set search_path = public, private as $$
declare
  current_user_id uuid := auth.uid();
  profile public.studio_profiles%rowtype;
begin
  if current_user_id is null then raise exception 'not_authenticated'; end if;
  insert into public.studio_profiles(user_id) values(current_user_id) on conflict(user_id) do nothing;
  select * into profile from public.studio_profiles where user_id=current_user_id for update;
  if profile.week_started_at < date_trunc('week', now()) then
    update public.studio_profiles set renders_used_week=0, week_started_at=date_trunc('week', now())
    where user_id=current_user_id returning * into profile;
  end if;
  if profile.access_mode in ('unlimited','free') then
    return jsonb_build_object('granted',true,'remaining',null,'mode',profile.access_mode);
  end if;
  -- Purchased plans must not silently remain active after their subscription expires.
  if profile.plan_code in ('starter','creator','pro')
     and exists(select 1 from public.studio_subscriptions where user_id=current_user_id and status='active')
     and not exists(select 1 from public.studio_subscriptions where user_id=current_user_id and status='active' and ends_at > now()) then
    return jsonb_build_object('granted',false,'remaining',0,'mode',profile.access_mode,'reason','subscription_expired');
  end if;
  if profile.renders_used_week >= profile.render_limit then
    return jsonb_build_object('granted',false,'remaining',0,'mode',profile.access_mode);
  end if;
  update public.studio_profiles set renders_used_week=renders_used_week+1 where user_id=current_user_id;
  return jsonb_build_object('granted',true,'remaining',greatest(profile.render_limit-profile.renders_used_week-1,0),'mode',profile.access_mode);
end;
$$;
revoke execute on function public.reserve_studio_render() from public, anon;
grant execute on function public.reserve_studio_render() to authenticated;

-- Financial records are written by the server, never by a browser client.
drop policy if exists studio_subscriptions_insert on public.studio_subscriptions;
drop policy if exists studio_payment_events_insert on public.studio_payment_events;

create or replace function private.studio_admin_users()
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
  if auth.uid() is null or not private.is_studio_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(p) || jsonb_build_object('email', u.email) order by p.created_at desc)
    from public.studio_profiles p join auth.users u on u.id=p.user_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function private.studio_admin_users() from public, anon;
grant execute on function private.studio_admin_users() to authenticated;
create or replace function public.list_studio_admin_users()
returns jsonb language sql security invoker set search_path=pg_catalog
as $$ select private.studio_admin_users(); $$;
revoke all on function public.list_studio_admin_users() from public, anon;
grant execute on function public.list_studio_admin_users() to authenticated;

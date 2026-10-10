-- Require a current paid subscription before consuming a paid quota, while
-- allowing explicitly billing-exempt artists to use their configured quota.
create or replace function public.reserve_studio_render()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
  profile public.studio_profiles%rowtype;
  has_current_subscription boolean;
  has_any_subscription boolean;
begin
  if current_user_id is null then raise exception 'not_authenticated'; end if;
  insert into public.studio_profiles(user_id) values(current_user_id)
  on conflict(user_id) do nothing;
  select * into profile from public.studio_profiles
  where user_id = current_user_id for update;

  if profile.is_suspended then
    return pg_catalog.jsonb_build_object('granted', false, 'remaining', 0, 'mode', profile.access_mode, 'reason', 'account_suspended');
  end if;

  if profile.week_started_at < pg_catalog.date_trunc('week', pg_catalog.now()) then
    update public.studio_profiles
    set renders_used_week = 0, week_started_at = pg_catalog.date_trunc('week', pg_catalog.now())
    where user_id = current_user_id returning * into profile;
  end if;

  if profile.access_mode in ('unlimited', 'free') then
    return pg_catalog.jsonb_build_object('granted', true, 'remaining', null, 'mode', profile.access_mode);
  end if;

  if profile.access_mode = 'limited'
     and profile.plan_code in ('starter', 'creator', 'pro')
     and not profile.billing_exempt then
    select exists(
      select 1 from public.studio_subscriptions s
      where s.user_id = current_user_id and s.plan_code = profile.plan_code
        and s.status = 'active' and s.ends_at > pg_catalog.now()
    ) into has_current_subscription;
    if not has_current_subscription then
      select exists(
        select 1 from public.studio_subscriptions s
        where s.user_id = current_user_id and s.plan_code = profile.plan_code
      ) into has_any_subscription;
      return pg_catalog.jsonb_build_object(
        'granted', false, 'remaining', 0, 'mode', profile.access_mode,
        'reason', case when has_any_subscription then 'subscription_expired' else 'subscription_required' end
      );
    end if;
  end if;

  if profile.renders_used_week >= profile.render_limit then
    return pg_catalog.jsonb_build_object('granted', false, 'remaining', 0, 'mode', profile.access_mode, 'reason', 'quota_exhausted');
  end if;
  update public.studio_profiles
  set renders_used_week = renders_used_week + 1
  where user_id = current_user_id;
  return pg_catalog.jsonb_build_object(
    'granted', true,
    'remaining', greatest(profile.render_limit - profile.renders_used_week - 1, 0),
    'mode', profile.access_mode
  );
end;
$function$;

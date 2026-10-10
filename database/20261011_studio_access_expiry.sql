-- Optional end date for complimentary/custom Studio access.
alter table public.studio_profiles
  add column if not exists access_expires_at timestamptz;

create or replace function public.studio_protect_profile()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if current_user <> 'service_role' and not private.is_studio_admin() then
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    new.role := old.role;
    new.plan_code := old.plan_code;
    new.access_mode := old.access_mode;
    new.render_limit := old.render_limit;
    new.is_suspended := old.is_suspended;
    new.billing_exempt := old.billing_exempt;
    new.access_expires_at := old.access_expires_at;
    if old.week_started_at < pg_catalog.date_trunc('week', pg_catalog.now())
       and new.renders_used_week = 0
       and new.week_started_at = pg_catalog.date_trunc('week', pg_catalog.now()) then
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
$function$;

create or replace function public.studio_admin_update_profile(
  p_user_id uuid,
  p_patch jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  old_profile public.studio_profiles%rowtype;
  updated_profile public.studio_profiles%rowtype;
  before_json jsonb;
begin
  if actor_id is null or not private.is_studio_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object'
     or p_patch = '{}'::jsonb then
    raise exception 'empty_or_invalid_patch' using errcode = '22023';
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason, ''))) < 3
     or pg_catalog.char_length(pg_catalog.btrim(p_reason)) > 500 then
    raise exception 'admin_reason_required' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_object_keys(p_patch) as keys(patch_key)
    where keys.patch_key not in (
      'plan_code', 'access_mode', 'render_limit', 'display_name',
      'renders_used_week', 'is_suspended', 'billing_exempt', 'access_expires_at'
    )
  ) then
    raise exception 'unsupported_admin_field' using errcode = '22023';
  end if;

  select * into old_profile from public.studio_profiles
  where user_id = p_user_id for update;
  if not found then raise exception 'studio_user_not_found' using errcode = 'P0002'; end if;
  before_json := pg_catalog.to_jsonb(old_profile);

  update public.studio_profiles p set
    plan_code = case when p_patch ? 'plan_code' then p_patch->>'plan_code' else p.plan_code end,
    access_mode = case when p_patch ? 'access_mode' then p_patch->>'access_mode' else p.access_mode end,
    render_limit = case when p_patch ? 'render_limit' then (p_patch->>'render_limit')::integer else p.render_limit end,
    display_name = case when p_patch ? 'display_name' then nullif(pg_catalog.btrim(p_patch->>'display_name'), '') else p.display_name end,
    renders_used_week = case when p_patch ? 'renders_used_week' then (p_patch->>'renders_used_week')::integer else p.renders_used_week end,
    is_suspended = case when p_patch ? 'is_suspended' then (p_patch->>'is_suspended')::boolean else p.is_suspended end,
    billing_exempt = case when p_patch ? 'billing_exempt' then (p_patch->>'billing_exempt')::boolean else p.billing_exempt end,
    access_expires_at = case when p_patch ? 'access_expires_at' then (p_patch->>'access_expires_at')::timestamptz else p.access_expires_at end,
    updated_at = pg_catalog.now()
  where p.user_id = p_user_id returning * into updated_profile;

  insert into private.studio_admin_audit(actor_user_id, target_user_id, reason, before_state, after_state)
  values(actor_id, p_user_id, pg_catalog.btrim(p_reason), before_json, pg_catalog.to_jsonb(updated_profile));
  return pg_catalog.to_jsonb(updated_profile);
end;
$function$;

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
  select * into profile from public.studio_profiles where user_id = current_user_id for update;

  if profile.is_suspended then
    return pg_catalog.jsonb_build_object('granted', false, 'remaining', 0, 'mode', profile.access_mode, 'reason', 'account_suspended');
  end if;
  if profile.access_expires_at is not null and profile.access_expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('granted', false, 'remaining', 0, 'mode', profile.access_mode, 'reason', 'access_expired');
  end if;
  if profile.week_started_at < pg_catalog.date_trunc('week', pg_catalog.now()) then
    update public.studio_profiles set renders_used_week = 0, week_started_at = pg_catalog.date_trunc('week', pg_catalog.now())
    where user_id = current_user_id returning * into profile;
  end if;
  if profile.access_mode in ('unlimited', 'free') then
    return pg_catalog.jsonb_build_object('granted', true, 'remaining', null, 'mode', profile.access_mode);
  end if;
  if profile.access_mode = 'limited' and profile.plan_code in ('starter', 'creator', 'pro') and not profile.billing_exempt then
    select exists(select 1 from public.studio_subscriptions s where s.user_id = current_user_id and s.plan_code = profile.plan_code and s.status = 'active' and s.ends_at > pg_catalog.now()) into has_current_subscription;
    if not has_current_subscription then
      select exists(select 1 from public.studio_subscriptions s where s.user_id = current_user_id and s.plan_code = profile.plan_code) into has_any_subscription;
      return pg_catalog.jsonb_build_object('granted', false, 'remaining', 0, 'mode', profile.access_mode, 'reason', case when has_any_subscription then 'subscription_expired' else 'subscription_required' end);
    end if;
  end if;
  if profile.renders_used_week >= profile.render_limit then
    return pg_catalog.jsonb_build_object('granted', false, 'remaining', 0, 'mode', profile.access_mode, 'reason', 'quota_exhausted');
  end if;
  update public.studio_profiles set renders_used_week = renders_used_week + 1 where user_id = current_user_id;
  return pg_catalog.jsonb_build_object('granted', true, 'remaining', greatest(profile.render_limit - profile.renders_used_week - 1, 0), 'mode', profile.access_mode);
end;
$function$;

-- Add auditable, server-enforced account controls without changing existing
-- user identities, subscriptions, payment events, or project storage.

alter table public.studio_profiles
  add column if not exists is_suspended boolean not null default false,
  add column if not exists billing_exempt boolean not null default false;

-- Preserve existing complimentary access semantics; separate the financial
-- exemption flag from the quota/access-mode fields going forward.
update public.studio_profiles
set billing_exempt = true
where access_mode = 'free' and billing_exempt = false;

create table if not exists private.studio_admin_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(reason) between 3 and 500),
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);

alter table private.studio_admin_audit enable row level security;
revoke all on table private.studio_admin_audit from public, anon, authenticated;

create index if not exists studio_admin_audit_target_created_idx
  on private.studio_admin_audit (target_user_id, created_at desc);

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

create or replace function public.studio_admin_search_users(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_role text default null,
  p_plan text default null,
  p_access_mode text default null,
  p_suspended boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  query_text text := nullif(pg_catalog.btrim(coalesce(p_query, '')), '');
  page_size integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  page_offset integer := greatest(coalesce(p_offset, 0), 0);
  result jsonb;
begin
  if auth.uid() is null or not private.is_studio_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_role is not null and p_role not in ('user', 'admin') then
    raise exception 'invalid_role_filter' using errcode = '22023';
  end if;
  if p_plan is not null and p_plan not in ('free', 'starter', 'creator', 'pro', 'unlimited') then
    raise exception 'invalid_plan_filter' using errcode = '22023';
  end if;
  if p_access_mode is not null and p_access_mode not in ('limited', 'free', 'unlimited') then
    raise exception 'invalid_access_filter' using errcode = '22023';
  end if;

  select pg_catalog.jsonb_build_object(
    'total', (
      select pg_catalog.count(*)
      from public.studio_profiles p
      join auth.users u on u.id = p.user_id
      where (query_text is null
         or u.email ilike '%' || query_text || '%'
         or coalesce(p.display_name, '') ilike '%' || query_text || '%'
         or p.user_id::text ilike '%' || query_text || '%')
        and (p_role is null or p.role = p_role)
        and (p_plan is null or p.plan_code = p_plan)
        and (p_access_mode is null or p.access_mode = p_access_mode)
        and (p_suspended is null or p.is_suspended = p_suspended)
    ),
    'items', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(page_row) order by page_row.created_at desc, page_row.user_id
      )
      from (
        select p.*, u.email, u.email_confirmed_at, u.last_sign_in_at
        from public.studio_profiles p
        join auth.users u on u.id = p.user_id
        where (query_text is null
           or u.email ilike '%' || query_text || '%'
           or coalesce(p.display_name, '') ilike '%' || query_text || '%'
           or p.user_id::text ilike '%' || query_text || '%')
          and (p_role is null or p.role = p_role)
          and (p_plan is null or p.plan_code = p_plan)
          and (p_access_mode is null or p.access_mode = p_access_mode)
          and (p_suspended is null or p.is_suspended = p_suspended)
        order by p.created_at desc, p.user_id
        limit page_size offset page_offset
      ) as page_row
    ), '[]'::jsonb)
  ) into result;

  return result;
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
      'renders_used_week', 'is_suspended', 'billing_exempt'
    )
  ) then
    raise exception 'unsupported_admin_field' using errcode = '22023';
  end if;

  select * into old_profile
  from public.studio_profiles
  where user_id = p_user_id
  for update;
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
    updated_at = pg_catalog.now()
  where p.user_id = p_user_id
  returning * into updated_profile;

  insert into private.studio_admin_audit (
    actor_user_id, target_user_id, reason, before_state, after_state
  ) values (
    actor_id, p_user_id, pg_catalog.btrim(p_reason), before_json,
    pg_catalog.to_jsonb(updated_profile)
  );

  return pg_catalog.to_jsonb(updated_profile);
end;
$function$;

create or replace function public.studio_admin_list_audit(
  p_user_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  page_size integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  page_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.uid() is null or not private.is_studio_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) order by a.created_at desc)
    from (
      select id, actor_user_id, target_user_id, reason, before_state, after_state, created_at
      from private.studio_admin_audit
      where p_user_id is null or target_user_id = p_user_id
      order by created_at desc
      limit page_size offset page_offset
    ) a
  ), '[]'::jsonb);
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
  if profile.plan_code in ('starter', 'creator', 'pro')
     and exists(select 1 from public.studio_subscriptions where user_id = current_user_id and status = 'active')
     and not exists(select 1 from public.studio_subscriptions where user_id = current_user_id and status = 'active' and ends_at > pg_catalog.now()) then
    return pg_catalog.jsonb_build_object('granted', false, 'remaining', 0, 'mode', profile.access_mode, 'reason', 'subscription_expired');
  end if;
  if profile.renders_used_week >= profile.render_limit then
    return pg_catalog.jsonb_build_object('granted', false, 'remaining', 0, 'mode', profile.access_mode);
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

revoke all on function public.studio_admin_search_users(text, integer, integer, text, text, text, boolean) from public, anon;
revoke all on function public.studio_admin_update_profile(uuid, jsonb, text) from public, anon;
revoke all on function public.studio_admin_list_audit(uuid, integer, integer) from public, anon;
grant execute on function public.studio_admin_search_users(text, integer, integer, text, text, text, boolean) to authenticated;
grant execute on function public.studio_admin_update_profile(uuid, jsonb, text) to authenticated;
grant execute on function public.studio_admin_list_audit(uuid, integer, integer) to authenticated;


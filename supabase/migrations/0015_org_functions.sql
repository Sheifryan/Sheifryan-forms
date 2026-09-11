-- -----------------------------------------------------------------------------
-- 0015_org_functions.sql
-- Bootstrap + privileged operations that cannot be expressed as RLS policies.
--
-- Why these exist: creating an organisation must insert the workspace AND its
-- first (owner) membership row, but the membership RLS requires the caller to
-- already hold `members.invite` in that workspace — a chicken-and-egg. Same for
-- accepting an invitation. These SECURITY DEFINER functions perform their own
-- authorization with auth.uid(), then write.
-- -----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Precondition: these functions insert into workspace_members (0012) and
-- subscriptions (0014).
-- ---------------------------------------------------------------------------
do $pre$
begin
  if to_regclass('public.workspace_members') is null then
    raise exception '0015_org_functions.sql requires 0012_org_workspaces.sql to be applied first (workspace_members is missing). Apply 0012 successfully, then re-run this file.'
      using errcode = 'undefined_table';
  end if;
  if to_regclass('public.subscriptions') is null then
    raise exception '0015_org_functions.sql requires 0014_org_billing.sql to be applied first (subscriptions is missing). Apply 0014 successfully, then re-run this file.'
      using errcode = 'undefined_table';
  end if;
end $pre$;

-- ---------------------------------------------------------------------------
-- create_organisation — workspace + owner membership + subscription + audit.
-- ---------------------------------------------------------------------------
create or replace function create_organisation(
  p_name text,
  p_org_type text default null,
  p_org_size text default null,
  p_country text default null,
  p_industry text default null,
  p_slug text default null,
  p_logo_url text default null
) returns uuid
language plpgsql security definer as $$
declare
  v_ws uuid;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Organisation name is required';
  end if;

  -- Derive a unique, URL-safe slug.
  v_slug := nullif(regexp_replace(lower(trim(coalesce(p_slug, p_name))), '[^a-z0-9]+', '-', 'g'), '');
  v_slug := trim(both '-' from coalesce(v_slug, ''));
  if length(v_slug) = 0 then
    v_slug := 'org';
  end if;
  if exists (select 1 from workspaces w where lower(w.slug) = lower(v_slug)) then
    v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 6);
  end if;

  insert into workspaces (
    owner_id, created_by, name, kind, plan, slug, logo_url,
    org_type, org_size, country, industry,
    credits_balance, storage_quota_bytes
  ) values (
    auth.uid(), auth.uid(), trim(p_name), 'business', 'free', v_slug, p_logo_url,
    p_org_type, p_org_size, p_country, p_industry,
    5000, 107374182400 -- welcome credits + 100 GB org storage
  ) returning id into v_ws;

  insert into workspace_members (workspace_id, user_id, role, status, joined_at, email)
  values (v_ws, auth.uid(), 'owner', 'active', now(), lower(coalesce(auth.jwt() ->> 'email', '')))
  on conflict (workspace_id, user_id) do nothing;

  insert into subscriptions (workspace_id, plan, status, seats)
  values (v_ws, 'free', 'active', 1)
  on conflict (workspace_id) do nothing;

  insert into activity_logs (workspace_id, user_id, action, resource_type, resource_id, resource_label)
  values (v_ws, auth.uid(), 'workspace.created', 'workspace', v_ws, trim(p_name));

  return v_ws;
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_invitation — joins the caller to the workspace the invite targets.
-- Validates the token, expiry, and that the invitation email matches the
-- signed-in user before writing anything.
-- ---------------------------------------------------------------------------
create or replace function accept_invitation(p_token text)
returns uuid
language plpgsql security definer as $$
declare
  v_inv workspace_invitations;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_inv from workspace_invitations where token = p_token limit 1;
  if v_inv.id is null then
    raise exception 'Invitation not found';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'This invitation is no longer valid';
  end if;
  if v_inv.expires_at < now() then
    update workspace_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'This invitation has expired';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' or v_email <> lower(v_inv.email) then
    raise exception 'This invitation was sent to a different email address';
  end if;

  insert into workspace_members (workspace_id, user_id, role, status, joined_at, invited_by, email)
  values (v_inv.workspace_id, auth.uid(), v_inv.role, 'active', now(), v_inv.invited_by, v_email)
  on conflict (workspace_id, user_id) do update set status = 'active', role = excluded.role, email = excluded.email;

  update workspace_invitations set status = 'accepted', accepted_at = now() where id = v_inv.id;

  insert into activity_logs (workspace_id, user_id, action, resource_type, resource_label)
  values (v_inv.workspace_id, auth.uid(), 'member.joined', 'member', v_email);

  return v_inv.workspace_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- transfer_ownership — exactly one owner per workspace, enforced by a partial
-- unique index, so the incumbent is demoted before the successor is promoted.
-- ---------------------------------------------------------------------------
create or replace function transfer_ownership(p_workspace uuid, p_to_user uuid)
returns void
language plpgsql security definer as $$
begin
  if not is_workspace_owner(p_workspace) then
    raise exception 'Only the current owner can transfer ownership';
  end if;
  if p_to_user = auth.uid() then
    raise exception 'You are already the owner';
  end if;
  if not exists (
    select 1 from workspace_members
    where workspace_id = p_workspace and user_id = p_to_user and status = 'active'
  ) then
    raise exception 'The new owner must be an active member of this workspace';
  end if;

  update workspace_members set role = 'admin'
    where workspace_id = p_workspace and role = 'owner';
  update workspace_members set role = 'owner'
    where workspace_id = p_workspace and user_id = p_to_user;

  update workspaces set owner_id = p_to_user where id = p_workspace;

  insert into activity_logs (workspace_id, user_id, action, resource_type, resource_label)
  values (p_workspace, auth.uid(), 'member.role_changed', 'member', 'ownership transferred');
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_organisation — owner only; cascades remove every resource.
-- ---------------------------------------------------------------------------
create or replace function delete_organisation(p_workspace uuid)
returns void
language plpgsql security definer as $$
begin
  if not is_workspace_owner(p_workspace) then
    raise exception 'Only the owner can delete the organisation';
  end if;
  delete from workspaces where id = p_workspace and kind = 'business';
end;
$$;

-- ---------------------------------------------------------------------------
-- Defense in depth: these functions authorize with auth.uid() internally, but
-- anonymous callers have no business invoking them at all.
-- ---------------------------------------------------------------------------
revoke execute on function create_organisation(text, text, text, text, text, text, text) from anon;
revoke execute on function accept_invitation(text) from anon;
revoke execute on function transfer_ownership(uuid, uuid) from anon;
revoke execute on function delete_organisation(uuid) from anon;

grant execute on function create_organisation(text, text, text, text, text, text, text) to authenticated;
grant execute on function accept_invitation(text) to authenticated;
grant execute on function transfer_ownership(uuid, uuid) to authenticated;
grant execute on function delete_organisation(uuid) to authenticated;
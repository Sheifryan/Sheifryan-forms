-- ---------------------------------------------------------------------------
-- 0016_org_preferences.sql
-- Organisation-scoped Security and Notification preferences.
--
-- Both live as jsonb on the workspace row so a new switch never needs its own
-- migration. Non-null with a '{}' default, so reads never null-check.
--
-- security_settings:
--   { require2fa, invitationExpiryDays, sessionTimeoutMinutes,
--     enforceDomains, auditRetentionDays }
-- notification_settings:
--   { newResponse, newMember, invitationAccepted, weeklyDigest,
--     storageAlerts, billingAlerts }
--
-- allowed_email_domains is a real enforcement column (not just a preference):
-- when non-empty, /api/members rejects invitations to other domains.
--
-- Idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

-- Precondition: these columns hang off the workspaces table created in 0011.
do $pre$
begin
  if to_regclass('public.workspaces') is null then
    raise exception '0016_org_preferences.sql requires 0011_personal_accounts.sql to be applied first (workspaces is missing).'
      using errcode = 'undefined_table';
  end if;
end $pre$;

alter table workspaces add column if not exists security_settings jsonb not null default '{}'::jsonb;
alter table workspaces add column if not exists notification_settings jsonb not null default '{}'::jsonb;
alter table workspaces add column if not exists allowed_email_domains text[] not null default '{}';

comment on column workspaces.security_settings is
  'Organisation security policy: 2FA requirement, invitation expiry, session timeout, audit retention.';
comment on column workspaces.notification_settings is
  'Organisation notification subscriptions for team-wide events.';
comment on column workspaces.allowed_email_domains is
  'When non-empty, only these email domains may be invited to the organisation.';

-- Admins already hold update rights on their own workspace (policy
-- "admins update workspaces", 0012), so these columns need no new policy.

-- ---------------------------------------------------------------------------
-- Migration pre-flight check — READ ONLY. Does not create or change anything.
--
-- Run this in the Supabase SQL editor BEFORE applying migrations. It reports,
-- for every migration file, whether that file's signature object exists, so you
-- can see exactly which files are still outstanding.
--
--   applied = false for 0009/0010 → 0012's form_analyses / form_ask_cache
--   policies are skipped (a NOTICE is printed). Apply those files, then re-run
--   0012 to pick the policies up.
--
--   applied = false for 0012 while 0013 is false too → expected; 0013 builds on
--   0012 and refuses to run without it.
-- ---------------------------------------------------------------------------

select '0001_init.sql'                as migration, 'table public.forms'                  as signature, (to_regclass('public.forms') is not null)                as applied
union all select '0001_init.sql',                'table public.responses',              (to_regclass('public.responses') is not null)
union all select '0002_theme_and_settings.sql',  'column forms.theme',                  (exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'forms' and c.column_name = 'theme'))
union all select '0003_password_and_notify.sql', 'column forms.password_hash',          (exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'forms' and c.column_name = 'password_hash'))
union all select '0004_folders.sql',             'table public.folders',                (to_regclass('public.folders') is not null)
union all select '0005_owner_isolation.sql',     'policy anon-reads-published-forms',   (exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'forms' and p.policyname = 'anyone can read published forms' and 'anon' = any(p.roles)))
union all select '0006_file_uploads.sql',        'table public.form_files',             (to_regclass('public.form_files') is not null)
union all select '0007_webhooks.sql',            'table public.webhook_deliveries',     (to_regclass('public.webhook_deliveries') is not null)
union all select '0008_payments.sql',            'table public.payments',               (to_regclass('public.payments') is not null)
union all select '0009_ai_analysis.sql',         'table public.form_analyses',          (to_regclass('public.form_analyses') is not null)
union all select '0010_ask_your_data.sql',       'table public.form_ask_cache',         (to_regclass('public.form_ask_cache') is not null)
union all select '0011_personal_accounts.sql',   'table public.workspaces',             (to_regclass('public.workspaces') is not null)
union all select '0012_org_workspaces.sql',      'table public.workspace_members',      (to_regclass('public.workspace_members') is not null)
union all select '0012_org_workspaces.sql',      'fn form_workspace(uuid)',             (to_regprocedure('public.form_workspace(uuid)') is not null)
union all select '0012_org_workspaces.sql',      'fn has_workspace_permission',         (to_regprocedure('public.has_workspace_permission(uuid,text)') is not null)
union all select '0013_org_collaboration.sql',   'table public.form_members',           (to_regclass('public.form_members') is not null)
union all select '0013_org_collaboration.sql',   'table public.activity_logs',          (to_regclass('public.activity_logs') is not null)
union all select '0014_org_billing.sql',         'table public.subscriptions',          (to_regclass('public.subscriptions') is not null)
union all select '0015_org_functions.sql',       'fn create_organisation',              (to_regprocedure('public.create_organisation(text,text,text,text,text,text,text)') is not null)
union all select '0015_org_functions.sql',       'fn accept_invitation(text)',          (to_regprocedure('public.accept_invitation(text)') is not null)
union all select '0016_org_preferences.sql',     'column workspaces.security_settings', (exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'workspaces' and c.column_name = 'security_settings'))
union all select '0017_owner_membership_repair.sql', 'fn ensure_own_memberships()',     (to_regprocedure('public.ensure_own_memberships()') is not null)
order by migration, signature;

// ---------------------------------------------------------------------------
// Turns "the migration hasn't been applied" database errors into something
// actionable.
//
// Without this, a missing RPC reaches the user as PostgREST's raw
// "Could not find the function public.create_organisation(...) in the schema
// cache" — which names the object but not the fix. Every organisation
// capability is created by a specific migration, so we map the object named in
// the error back to the file that provides it.
//
// The organisation chain, for reference:
//   create_organisation (0015) writes to workspaces + org columns (0011/0012),
//   workspace_members (0012), activity_logs (0013) and subscriptions (0014).
// ---------------------------------------------------------------------------

export interface DbErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/** Objects named in Postgres/PostgREST errors → the migration that creates them. */
const OBJECT_SOURCES: { match: RegExp; migration: string }[] = [
  {
    match: /create_organisation|accept_invitation|transfer_ownership|delete_organisation|touch_my_membership/i,
    migration: "0015_org_functions.sql",
  },
  { match: /subscriptions|invoices|payment_methods/i, migration: "0014_org_billing.sql" },
  { match: /form_members|activity_logs|response_notes/i, migration: "0013_org_collaboration.sql" },
  {
    // Columns 0012 adds to `workspaces` (org profile + creator). Only the
    // distinctive names are listed — `country`/`industry`/`timezone` are too
    // generic to attribute safely.
    match: /\b(slug|logo_url|org_type|org_size|created_by)\b/i,
    migration: "0012_org_workspaces.sql",
  },
  {
    match: /workspace_members|workspace_invitations|role_permissions|form_workspace|has_workspace_permission|is_workspace_member|is_workspace_admin|workspaces\b/i,
    migration: "0012_org_workspaces.sql",
  },
  { match: /form_analyses/i, migration: "0009_ai_analysis.sql" },
  { match: /form_ask_cache/i, migration: "0010_ask_your_data.sql" },
  { match: /form_files/i, migration: "0006_file_uploads.sql" },
  { match: /webhook_deliveries/i, migration: "0007_webhooks.sql" },
  { match: /payments/i, migration: "0008_payments.sql" },
  { match: /folders/i, migration: "0004_folders.sql" },
];

/**
 * True when the error means a schema object is missing rather than the request
 * being wrong.
 *   PGRST202 — PostgREST: function not found in the schema cache
 *   42P01    — undefined_table
 *   42883    — undefined_function
 *   42703    — undefined_column
 */
export function isMissingSchemaError(error: DbErrorLike | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const message = error.message ?? "";
  return (
    code === "PGRST202" ||
    code === "42P01" ||
    code === "42883" ||
    code === "42703" ||
    /could not find the function/i.test(message) ||
    /does not exist/i.test(message)
  );
}

/**
 * A user-facing explanation, or null when the error isn't schema-related (in
 * which case the caller should surface the original message).
 */
export function missingSchemaMessage(error: DbErrorLike | null | undefined): string | null {
  if (!isMissingSchemaError(error)) return null;

  const message = error?.message ?? "";
  const source = OBJECT_SOURCES.find((s) => s.match.test(message));
  const applyStep = source
    ? ` Apply ${source.migration} (and anything before it) first.`
    : "";

  return (
    `This feature isn't installed in your database yet.${applyStep} ` +
    "Run supabase/preflight.sql to list every missing migration, apply them in order, " +
    "then reload the API schema cache with: notify pgrst, 'reload schema';"
  );
}

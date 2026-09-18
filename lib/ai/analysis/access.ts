// Authorization for the AI routes.
//
// Every /api/ai/* route that takes a formId — ask, ask/export,
// analyze-responses, critique and improve — reads that form's schema (and, for
// the analysis routes, its submissions), and spends real AI credits doing it,
// so each one has to answer a single question first: may this caller let the AI
// read this form? Originally every route answered it with
// `.eq("owner_id", user.id)` on the forms query plus a `form.owner_id !==
// user.id` guard. Commit ae3799f ("Organisation commit") deleted both, leaving
// the "Ownership gate" comment behind — which let any workspace member run the
// AI over a colleague's form.
//
// The rule below mirrors the RLS policies installed by 0012_org_workspaces.sql:
//   * the owner of the form may always analyse it;
//   * otherwise the caller needs an ACTIVE membership of the form's workspace
//     with the 'responses.read' permission (the same helper the RLS policies
//     use, so route and database always agree);
//   * a form with no workspace can only ever be analysed by its owner.
//
// Everything fails CLOSED: a permission probe that errors denies access rather
// than falling through to "allowed".

import type { SupabaseClient } from "@supabase/supabase-js";

/** The columns the AI routes select from `forms` for the access check. */
export interface AnalysableForm {
  id: string;
  owner_id: string | null;
  workspace_id?: string | null;
}

/**
 * True when `userId` may let the AI read `form`.
 *
 * Call it with the SESSION client (not the service client) so RLS and the
 * permission helpers are evaluated as the requesting user.
 */
export async function canAnalyseForm(
  supabase: SupabaseClient,
  form: AnalysableForm,
  userId: string
): Promise<boolean> {
  if (form.owner_id === userId) return true;
  if (!form.workspace_id) return false;

  // RLS on workspace_members applies here too, so a non-member simply gets no
  // row back; the explicit status filter keeps 'invited'/'suspended' out.
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", form.workspace_id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (memberError || !membership) return false;

  // Role matrix + per-member grants/revokes (0012). A viewer/editor/owner has
  // responses.read; a role without it must not reach the AI routes either.
  const { data: allowed, error: permError } = await supabase.rpc("has_workspace_permission", {
    ws: form.workspace_id,
    perm: "responses.read",
  });
  if (permError) {
    console.error("[ai] permission check failed:", permError.message);
    return false;
  }
  return Boolean(allowed);
}

import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { PermissionDenied } from "@/components/PermissionDenied";
import { resolveActiveWorkspace, resolveProfile, isOrganisation } from "@/lib/workspace-server";
import { can, PERMISSION, type MemberLike } from "@/lib/permissions";
import { activityVerb, activityTone } from "@/lib/activity";
import { formatDateTime } from "@/lib/format";

interface LogRow {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_label: string | null;
  created_at: string;
}

export default async function ActivityPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { workspace, membership } = await resolveActiveWorkspace();
  const { profile } = await resolveProfile();
  if (!workspace) redirect("/dashboard");

  const member: MemberLike = membership
    ? { role: membership.role, status: membership.status, permissions: membership.permissions }
    : { role: "owner", status: "active" };

  const shellUser = { email: user.email, fullName: profile?.full_name || (user.user_metadata?.full_name as string) };
  const shellWs = { name: workspace.name, plan: workspace.plan };

  // The full log is an owner/admin capability; RLS would otherwise only return
  // the caller's own actions.
  if (!can(member, PERMISSION.ACTIVITY_VIEW)) {
    return (
      <AppShell active="activity" title="Activity" user={shellUser} workspace={shellWs}>
        <PermissionDenied
          title="The activity log is restricted"
          description="Only owners and admins can review everything that happens in this organisation."
        />
      </AppShell>
    );
  }

  const { data: logs } = await supabase
    .from("activity_logs")
    .select("id, user_id, action, resource_type, resource_label, created_at")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (logs ?? []) as LogRow[];
  const actorIds = Array.from(new Set(rows.map((r) => r.user_id).filter((id): id is string => Boolean(id))));
  const nameById: Record<string, string | null> = {};
  if (actorIds.length > 0) {
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
    (profs ?? []).forEach((p) => {
      nameById[p.id] = p.full_name;
    });
  }

  return (
    <AppShell active="activity" title="Activity" user={shellUser} workspace={shellWs}>
      <div className="min-h-screen p-7">
        {!isOrganisation(workspace) && (
          <p className="mb-4 rounded-xl border border-line bg-white p-4 font-body text-[12.5px] text-slate-500 shadow-sm dark:border-lineDark dark:bg-panelDark dark:text-mutedDark">
            This is your personal workspace — activity is only recorded for organisation workspaces.
          </p>
        )}

        <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm dark:border-lineDark dark:bg-panelDark">
          <h2 className="border-b border-line px-4 py-3 font-display text-[15px] font-semibold text-ink dark:border-lineDark dark:text-inkDark">
            Organisation activity
          </h2>

          {rows.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-signalSoft/20">
                <History size={24} className="text-signal" />
              </div>
              <h3 className="font-display text-lg font-semibold text-ink dark:text-inkDark">No activity yet</h3>
              <p className="mt-1.5 font-body text-sm text-slate-500 dark:text-mutedDark">
                Invitations, form changes and workflow edits will show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line dark:divide-lineDark">
              {rows.map((r) => {
                const actor = (r.user_id && nameById[r.user_id]) || "A team member";
                const initials = actor.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "M";
                return (
                  <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-signal to-accent2 text-[10px] font-bold text-white">
                      {initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-[12.5px] text-ink dark:text-inkDark">
                        <b className="font-semibold">{actor}</b> {activityVerb(r.action)}
                        {r.resource_label ? <span className="text-slate-500 dark:text-mutedDark"> · {r.resource_label}</span> : null}
                      </p>
                      <p className="mt-0.5 font-body text-[11px] text-slate-400 dark:text-mutedDark">{formatDateTime(r.created_at)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 font-body text-[10px] font-semibold ${activityTone(r.action)}`}>
                      {(r.resource_type ?? "event").replace(/_/g, " ")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
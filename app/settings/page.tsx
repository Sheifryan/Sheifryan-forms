import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { resolveActiveWorkspace, resolveProfile } from "@/lib/workspace-server";
import { planById } from "@/lib/plans";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { workspace, membership } = await resolveActiveWorkspace();
  const { profile } = await resolveProfile();
  void userError;

  // Organisation profile fields (General settings tab) — only for orgs.
  let org: { name: string; description: string; industry: string; country: string; timezone: string; logoUrl: string; orgType: string; orgSize: string } | null = null;
  type OrgPrefsShape = {
    security: { require2fa?: boolean; enforceDomains?: boolean; invitationExpiryDays?: number; sessionTimeoutMinutes?: number; auditRetentionDays?: number };
    notifications: { newResponse?: boolean; newMember?: boolean; invitationAccepted?: boolean; weeklyDigest?: boolean; storageAlerts?: boolean; billingAlerts?: boolean };
    allowedEmailDomains: string[];
  };
  let orgPreferences: OrgPrefsShape | null = null;

  if (workspace && workspace.kind === "business") {
    // Two-tier select: the preference columns arrive in 0016, so a database
    // that hasn't seen that migration yet still renders the General tab.
    type WsRow = {
      name: string | null;
      description: string | null;
      industry: string | null;
      country: string | null;
      timezone: string | null;
      logo_url: string | null;
      org_type: string | null;
      org_size: string | null;
      security_settings?: Record<string, unknown> | null;
      notification_settings?: Record<string, unknown> | null;
      allowed_email_domains?: string[] | null;
    };

    let ws: WsRow | null = null;
    const full = await supabase
      .from("workspaces")
      .select("name, description, industry, country, timezone, logo_url, org_type, org_size, security_settings, notification_settings, allowed_email_domains")
      .eq("id", workspace.id)
      .maybeSingle();
    if (!full.error) {
      ws = full.data as WsRow;
    } else {
      const bare = await supabase
        .from("workspaces")
        .select("name, description, industry, country, timezone, logo_url, org_type, org_size")
        .eq("id", workspace.id)
        .maybeSingle();
      ws = bare.data as WsRow | null;
    }

    if (ws) {
      org = {
        name: (ws.name as string) ?? "",
        description: (ws.description as string) ?? "",
        industry: (ws.industry as string) ?? "",
        country: (ws.country as string) ?? "",
        timezone: (ws.timezone as string) ?? "UTC",
        logoUrl: (ws.logo_url as string) ?? "",
        orgType: (ws.org_type as string) ?? "",
        orgSize: (ws.org_size as string) ?? "",
      };
      orgPreferences = {
        security: (ws.security_settings ?? {}) as OrgPrefsShape["security"],
        notifications: (ws.notification_settings ?? {}) as OrgPrefsShape["notifications"],
        allowedEmailDomains: (ws.allowed_email_domains ?? []) as string[],
      };
    }
  }

  // Members are only listed for organisations (used by the transfer-ownership
  // control and the seats counter).
  let members: { userId: string; name: string | null; email: string | null; role: string }[] = [];
  if (workspace && workspace.kind === "business") {
    const { data: memberRows } = await supabase
      .from("workspace_members")
      .select("user_id, role, email, status")
      .eq("workspace_id", workspace.id)
      .eq("status", "active");
    const ids = (memberRows ?? []).map((m) => m.user_id);
    const nameById: Record<string, string | null> = {};
    if (ids.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      (profs ?? []).forEach((p) => {
        nameById[p.id] = p.full_name;
      });
    }
    members = (memberRows ?? []).map((m) => ({
      userId: m.user_id,
      name: nameById[m.user_id] ?? null,
      email: m.email ?? null,
      role: m.role,
    }));
  }

  // Live usage for the Billing tab, mirroring /api/billing (this runs server-
  // side so the page renders with real numbers, no client round-trip).
  let usage = { forms: 0, monthlyResponses: 0, responses: 0, storageBytes: 0, workflows: 0, fileUploads: 0 };
  const plan = planById(workspace?.plan);
  if (workspace) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count: formsCount } = await supabase.from("forms").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id);
    const { data: formRows } = await supabase.from("forms").select("id").eq("workspace_id", workspace.id);
    const formIds = (formRows ?? []).map((f) => f.id);
    const empty = ["00000000-0000-0000-0000-000000000000"];
    const scopedIn = (formIds.length > 0 ? formIds : empty);

    let rq1 = supabase.from("responses").select("id", { count: "exact", head: true });
    let rq2 = supabase.from("responses").select("id", { count: "exact", head: true });
    const { count: responsesCount } = await rq1.in("form_id", scopedIn);
    const { count: monthCount } = await rq2.in("form_id", scopedIn).gte("created_at", monthStart.toISOString());
    const { count: workflowsCount } = await supabase.from("workflows").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id);

    const { data: files } = await supabase.from("form_files").select("size_bytes").in("form_id", scopedIn);
    const { count: uploadsCount } = await supabase.from("form_files").select("id", { count: "exact", head: true }).in("form_id", scopedIn);

    usage = {
      forms: formsCount ?? 0,
      monthlyResponses: monthCount ?? 0,
      responses: responsesCount ?? 0,
      storageBytes: (files ?? []).reduce((a, f) => a + Number(f.size_bytes ?? 0), 0),
      workflows: workflowsCount ?? 0,
      fileUploads: uploadsCount ?? 0,
    };
  }

  const activeTab = searchParams.tab ?? "profile";
  const validTabs = ["profile", "preferences", "notifications", "security", "billing", "danger", "organisation"];

  return (
    <AppShell
      active="settings"
      title="Settings"
      user={{ email: user.email, fullName: profile?.full_name || (user.user_metadata?.full_name as string) }}
      workspace={{ name: workspace?.name, plan: workspace?.plan }}
    >
      <SettingsClient
        initialTab={validTabs.includes(activeTab) ? activeTab : "profile"}
        email={user.email ?? ""}
        authId={user.id}
        profile={{
          fullName: profile?.full_name ?? (user.user_metadata?.full_name as string) ?? "",
          avatarUrl: profile?.avatar_url,
          preferences: profile ? (profile.preferences ?? {}) : {},
        }}
        workspace={{
          id: workspace?.id,
          name: workspace?.name ?? "",
          plan: workspace?.plan ?? "free",
          credits: workspace?.credits_balance ?? 0,
          kind: workspace?.kind ?? "personal",
        }}
        members={members}
        isOwner={membership?.role === "owner"}
        organisation={org}
        orgPreferences={orgPreferences}
        plan={plan}
        usage={usage}
      />
    </AppShell>
  );
}
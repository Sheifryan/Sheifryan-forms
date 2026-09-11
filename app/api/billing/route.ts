import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolveActiveWorkspace } from "@/lib/workspace-server";
import { planById } from "@/lib/plans";

// Workspace-scoped plan usage.
//   GET /api/billing          – returns current plan, limits, and live usage.
//   POST /api/billing         – change plan ({ plan: "free"|"pro"|"premium" }).
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await resolveActiveWorkspace();
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const plan = planById(workspace.plan);

  // Live usage counts (scoped by workspace through the forms join).
  const { count: formsCount } = await supabase.from("forms").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id);
  const { data: formRows } = await supabase.from("forms").select("id").eq("workspace_id", workspace.id);
  const formIds = (formRows ?? []).map((f) => f.id);
  const empty = ["00000000-0000-0000-0000-000000000000"];

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  let responsesQuery = supabase.from("responses").select("id", { count: "exact", head: true });
  responsesQuery = formIds.length ? responsesQuery.in("form_id", formIds) : responsesQuery.in("form_id", empty);
  const { count: responsesCount } = await responsesQuery;
  const { count: monthResponsesCount } = await responsesQuery.gte("created_at", monthStart.toISOString());

  const { count: workflowsCount } = await supabase.from("workflows").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id);

  const { data: files } = await supabase
    .from("form_files")
    .select("size_bytes")
    .in("form_id", formIds.length ? formIds : empty);
  const storageUsed = (files ?? []).reduce((acc, f) => acc + Number(f.size_bytes ?? 0), 0);
  const { count: uploadsCount } = await supabase.from("form_files").select("id", { count: "exact", head: true }).in("form_id", formIds.length ? formIds : empty);

  return NextResponse.json({
    plan: workspace.plan,
    quota: { forms: plan.limits.forms, monthlyResponses: plan.limits.monthlyResponses, storageBytes: plan.limits.storageBytes, workflows: plan.limits.workflows, fileUploads: plan.limits.fileUploads },
    usage: {
      forms: formsCount ?? 0,
      monthlyResponses: monthResponsesCount ?? 0,
      responses: responsesCount ?? 0,
      storageBytes: storageUsed,
      workflows: workflowsCount ?? 0,
      fileUploads: uploadsCount ?? 0,
    },
  });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await resolveActiveWorkspace();
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const targetPlan = body.plan;
  if (targetPlan !== "free" && targetPlan !== "pro" && targetPlan !== "premium") {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  // Downgrade guard: never strand a workspace over its limits.
  const limits = planById(targetPlan).limits;
  const needsCheck = targetPlan === "free" || targetPlan === "pro";
  if (needsCheck && limits.forms >= 0) {
    const { count: formsCount } = await supabase.from("forms").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id);
    if ((formsCount ?? 0) > limits.forms) {
      return NextResponse.json(
        { error: `You have ${formsCount} forms — the ${targetPlan} plan allows ${limits.forms}. Delete some forms or upgrade instead.` },
        { status: 409 }
      );
    }
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("workspaces")
    .update({ plan: targetPlan })
    .eq("id", workspace.id)
    .select("id, plan, credits_balance")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, workspace: data });
}
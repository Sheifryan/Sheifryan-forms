import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolveActiveWorkspace } from "@/lib/workspace-server";
import { isPlanId, planById } from "@/lib/plans";
import { computeUsage } from "@/lib/usage";

// Workspace-scoped plan usage.
//   GET /api/billing          – returns current plan, limits, and live usage.
//   POST /api/billing         – change plan ({ plan: <any PlanId> }), e.g.
//                               "free" | "pro" | "premium" for personal
//                               workspaces, "starter" | "business" |
//                               "enterprise" for organisations.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspace } = await resolveActiveWorkspace();
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const plan = planById(workspace.plan);

  // One shared meter (lib/usage.ts) so this endpoint and the Billing tab can
  // never report different numbers. Meter-only: nothing blocks on these values.
  const usage = await computeUsage(supabase, workspace.id);

  return NextResponse.json({
    plan: workspace.plan,
    quota: {
      forms: plan.limits.forms,
      monthlyResponses: plan.limits.monthlyResponses,
      storageBytes: plan.limits.storageBytes,
      workflows: plan.limits.workflows,
      fileUploads: plan.limits.fileUploads,
      members: plan.limits.members,
      aiRequests: plan.limits.aiRequestsPerMonth,
    },
    usage,
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
  // Every tier is selectable — personal (free/pro/premium) and organisation
  // (starter/business/enterprise). Validated against PLANS, so a new tier
  // becomes sellable the moment it's defined there.
  if (!isPlanId(targetPlan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  // Downgrade guard: never strand a workspace over its limits. Plans with an
  // unlimited form ceiling (-1) can't be overshot, so only finite ones check.
  const limits = planById(targetPlan).limits;
  if (limits.forms >= 0) {
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
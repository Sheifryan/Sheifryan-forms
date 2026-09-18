// Regression cover for the shared usage meter (lib/usage.ts).
//
// The Billing tab and GET /api/billing both call computeUsage, so these tests
// pin the numbers they agree on: every plan feature is counted, monthly windows
// exclude older rows, an empty workspace reads zero (never "everything"), and
// the Billing row list keeps up with PlanLimits.

import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeUsage, countAiRequests, monthStart, planUsageRows } from "../../lib/usage";
import type { PlanUsage } from "../../lib/usage";
import { PLANS } from "../../lib/plans";
import type { PlanLimits } from "../../lib/plans";
import { fakeService, makeDb, type FakeDbWithFailure } from "./fake-service";

const WORKSPACE = "ws-1";
const OTHER_WORKSPACE = "ws-2";
const FORM = "form-1";
const OTHER_FORM = "form-2";

const client = (db: FakeDbWithFailure) => fakeService(db) as unknown as SupabaseClient;

/** A timestamp inside the current month but never in the previous one. */
function thisMonth(): string {
  const d = monthStart();
  d.setHours(12);
  return d.toISOString();
}

function lastMonth(): string {
  const d = monthStart();
  d.setDate(0); // last day of the previous month
  d.setHours(23);
  return d.toISOString();
}

test("counts every plan feature for one workspace only", async () => {
  const db = makeDb({
    forms: [
      { id: FORM, workspace_id: WORKSPACE },
      { id: "form-3", workspace_id: WORKSPACE },
      { id: OTHER_FORM, workspace_id: OTHER_WORKSPACE },
    ],
    responses: [
      { id: "r1", form_id: FORM, created_at: thisMonth() },
      { id: "r2", form_id: FORM, created_at: lastMonth() },
      { id: "r3", form_id: FORM, created_at: lastMonth() },
      { id: "r4", form_id: OTHER_FORM, created_at: thisMonth() },
    ],
    form_files: [
      { id: "f1", form_id: FORM, size_bytes: 1024 },
      { id: "f2", form_id: FORM, size_bytes: 2048 },
      { id: "f3", form_id: OTHER_FORM, size_bytes: 999 },
    ],
    workflows: [
      { id: "w1", workspace_id: WORKSPACE },
      { id: "w2", workspace_id: WORKSPACE },
      { id: "w3", workspace_id: OTHER_WORKSPACE },
    ],
    workspace_members: [
      { id: "m1", workspace_id: WORKSPACE, status: "active" },
      { id: "m2", workspace_id: WORKSPACE, status: "active" },
      { id: "m3", workspace_id: WORKSPACE, status: "invited" },
      { id: "m4", workspace_id: OTHER_WORKSPACE, status: "active" },
    ],
  });

  const usage = await computeUsage(client(db), WORKSPACE);

  assert.equal(usage.forms, 2);
  assert.equal(usage.responses, 3, "only this workspace's responses");
  assert.equal(usage.monthlyResponses, 1, "only this month's responses");
  assert.equal(usage.storageBytes, 3072, "size_bytes summed");
  assert.equal(usage.fileUploads, 2);
  assert.equal(usage.workflows, 2);
  assert.equal(usage.members, 2, "active members only");
  assert.equal(usage.aiRequests, 0);
});

test("a workspace with no resources reads zero, never everything", async () => {
  const db = makeDb({
    forms: [{ id: OTHER_FORM, workspace_id: OTHER_WORKSPACE }],
    responses: [{ id: "r1", form_id: OTHER_FORM, created_at: thisMonth() }],
    form_files: [{ id: "f1", form_id: OTHER_FORM, size_bytes: 5000 }],
  });

  const usage = await computeUsage(client(db), WORKSPACE);

  assert.equal(usage.forms, 0);
  assert.equal(usage.responses, 0, "the impossible-id scope must not match other forms");
  assert.equal(usage.monthlyResponses, 0);
  assert.equal(usage.storageBytes, 0);
  assert.equal(usage.fileUploads, 0);
  assert.equal(usage.workflows, 0);
  assert.equal(usage.members, 1, "floors at one (the owner)");
  assert.equal(usage.aiRequests, 0);
});

test("members floors at one when no member row is active", async () => {
  const db = makeDb({ workspace_members: [{ id: "m1", workspace_id: WORKSPACE, status: "invited" }] });
  const usage = await computeUsage(client(db), WORKSPACE);
  assert.equal(usage.members, 1);
});

test("AI requests count this month only, per workspace", async () => {
  const db = makeDb({
    ai_usage: [
      { id: "a1", workspace_id: WORKSPACE, created_at: thisMonth() },
      { id: "a2", workspace_id: WORKSPACE, created_at: thisMonth() },
      { id: "a3", workspace_id: WORKSPACE, created_at: lastMonth() },
      { id: "a4", workspace_id: OTHER_WORKSPACE, created_at: thisMonth() },
    ],
  });

  assert.equal(await countAiRequests(client(db), WORKSPACE), 2);
  assert.equal((await computeUsage(client(db), WORKSPACE)).aiRequests, 2);
});

test("monthStart is local midnight on the 1st", () => {
  const start = monthStart();
  assert.equal(start.getDate(), 1);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(start.getSeconds(), 0);
  assert.equal(start.getMilliseconds(), 0);
});

test("Billing rows cover every metered plan limit", () => {
  // PlanLimits → the PlanUsage field that meters it. Two things are deliberately
  // absent: `creditsPerMonth` (a wallet allowance, not a resource ceiling) and
  // PlanUsage.responses (a lifetime total — the tab shows "Responses / month").
  const metered: [keyof PlanLimits, keyof PlanUsage][] = [
    ["forms", "forms"],
    ["monthlyResponses", "monthlyResponses"],
    ["storageBytes", "storageBytes"],
    ["workflows", "workflows"],
    ["fileUploads", "fileUploads"],
    ["members", "members"],
    ["aiRequestsPerMonth", "aiRequests"],
  ];
  const excluded = ["creditsPerMonth"];

  const orgRows = planUsageRows(PLANS.business.limits, true);
  for (const [limitKey, usageKey] of metered) {
    assert.ok(
      orgRows.some((r) => r.key === usageKey),
      `${limitKey} has no Billing row`
    );
  }

  // A limit added to PlanLimits must be metered or explicitly excluded here.
  for (const key of Object.keys(PLANS.free.limits) as (keyof PlanLimits)[]) {
    const covered = metered.some(([limitKey]) => limitKey === key) || excluded.includes(key);
    assert.ok(covered, `${key} is neither metered nor explicitly excluded`);
  }

  // Seats are only meaningful for organisations.
  const personalKeys = planUsageRows(PLANS.free.limits, false).map((r) => r.key);
  assert.deepEqual(
    personalKeys,
    orgRows.map((r) => r.key).filter((k) => k !== "members")
  );
});

test("limits shown come from the plan, including an unlimited tier", () => {
  const free = planUsageRows(PLANS.free.limits, false);
  assert.equal(free.find((r) => r.key === "aiRequests")?.limit, 10);
  assert.equal(free.find((r) => r.key === "storageBytes")?.bytes, true);

  const enterprise = planUsageRows(PLANS.enterprise.limits, true);
  assert.equal(enterprise.find((r) => r.key === "aiRequests")?.limit, -1, "-1 renders as Unlimited");
  assert.equal(enterprise.find((r) => r.key === "members")?.limit, 250);
});

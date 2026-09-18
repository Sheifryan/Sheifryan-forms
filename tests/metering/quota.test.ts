// Regression cover for AI request metering (lib/ai/quota.ts).
//
// These tests pin the contract the six AI routes rely on: one row per
// successful user action, a writer that can never break the request it meters,
// and a read that reports the month's usage against the plan's allowance.
// Nothing here blocks anything — metering is observational by design.

import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_REQUEST_KINDS, getAiUsage, recordAiUsage, type AiRequestKind } from "../../lib/ai/quota";
import { monthStart } from "../../lib/usage";
import { PLANS } from "../../lib/plans";
import { fakeService, makeDb, type FakeDbWithFailure } from "./fake-service";

const WORKSPACE = "ws-1";
const OTHER_WORKSPACE = "ws-2";
const FORM = "form-1";
const USER = "user-1";

const client = (db: FakeDbWithFailure) => fakeService(db) as unknown as SupabaseClient;

function thisMonth(): string {
  const d = monthStart();
  d.setHours(12);
  return d.toISOString();
}

function lastMonth(): string {
  const d = monthStart();
  d.setDate(0);
  d.setHours(23);
  return d.toISOString();
}

test("records one row with the workspace, user, form and kind", async () => {
  const db = makeDb();
  const wrote = await recordAiUsage(client(db), { workspaceId: WORKSPACE, userId: USER, formId: FORM, kind: "ask" });

  assert.equal(wrote, true);
  assert.equal(db.ai_usage.length, 1);
  assert.equal(db.ai_usage[0].workspace_id, WORKSPACE);
  assert.equal(db.ai_usage[0].user_id, USER);
  assert.equal(db.ai_usage[0].form_id, FORM);
  assert.equal(db.ai_usage[0].kind, "ask");
});

test("workspace-less requests (generate/import with no workspace) write nothing", async () => {
  const db = makeDb();
  const wrote = await recordAiUsage(client(db), { workspaceId: null, userId: USER, kind: "generate" });
  assert.equal(wrote, false);
  assert.equal(db.ai_usage.length, 0);
});

test("a failing insert is swallowed, never thrown", async () => {
  const db = makeDb();
  db.failOn = "ai_usage";
  const wrote = await recordAiUsage(client(db), { workspaceId: WORKSPACE, userId: USER, kind: "insight" });
  assert.equal(wrote, false, "metering must never break the feature it meters");
});

test("usage is reported against the plan allowance", async () => {
  const db = makeDb({
    ai_usage: [
      { id: "a1", workspace_id: WORKSPACE, created_at: thisMonth() },
      { id: "a2", workspace_id: WORKSPACE, created_at: thisMonth() },
      { id: "a3", workspace_id: WORKSPACE, created_at: lastMonth() },
      { id: "a4", workspace_id: OTHER_WORKSPACE, created_at: thisMonth() },
    ],
  });

  const usage = await getAiUsage(client(db), WORKSPACE, "free");
  assert.equal(usage.used, 2, "this month, this workspace");
  assert.equal(usage.limit, PLANS.free.limits.aiRequestsPerMonth);
  assert.equal(usage.unlimited, false);
  assert.equal(usage.remaining, PLANS.free.limits.aiRequestsPerMonth - 2);
});

test("an unlimited plan reports no ceiling and no remaining count", async () => {
  const db = makeDb();
  const usage = await getAiUsage(client(db), WORKSPACE, "enterprise");
  assert.equal(usage.limit, -1);
  assert.equal(usage.unlimited, true);
  assert.equal(usage.remaining, null);
});

test("remaining floors at zero once the allowance is passed", async () => {
  const db = makeDb();
  for (let i = 0; i < PLANS.free.limits.aiRequestsPerMonth + 3; i += 1) {
    db.ai_usage.push({ id: `a${i}`, workspace_id: WORKSPACE, created_at: thisMonth() });
  }
  const usage = await getAiUsage(client(db), WORKSPACE, "free");
  assert.equal(usage.used, PLANS.free.limits.aiRequestsPerMonth + 3);
  assert.equal(usage.remaining, 0);
});

test("every kind the routes send is a kind the database accepts", async () => {
  // Must match the check constraint in supabase/migrations/0021_ai_usage.sql.
  assert.deepEqual(AI_REQUEST_KINDS, ["ask", "insight", "generate", "improve", "critique", "import"]);

  for (const kind of AI_REQUEST_KINDS) {
    const db = makeDb();
    const wrote = await recordAiUsage(client(db), { workspaceId: WORKSPACE, userId: USER, kind: kind as AiRequestKind });
    assert.equal(wrote, true, `${kind} must record`);
    assert.equal(db.ai_usage[0].kind, kind);
  }
});

test("every tier states an AI allowance", () => {
  for (const plan of Object.values(PLANS)) {
    assert.equal(typeof plan.limits.aiRequestsPerMonth, "number", `${plan.id} has no AI allowance`);
    assert.ok(plan.features.some((f) => /AI request/i.test(f)), `${plan.id} does not advertise its AI allowance`);
  }
});

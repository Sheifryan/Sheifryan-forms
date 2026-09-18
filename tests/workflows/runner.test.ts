// Regression cover for the workflow runtime (lib/workflows.ts).
//
// Workflows have been configurable since 0011 but nothing ever ran them. These
// tests pin the behaviour that makes them real: which rows fire, in what order,
// what gets recorded, and that one broken action can never take down a
// respondent's submission.

import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { parseWorkflowActions, runWorkflows, workflowsForForm, type RunContext } from "../../lib/workflows";
import { fromAddress } from "../../lib/email";
import type { FormSchema } from "../../lib/schema";
import { fakeService, makeDb, type FakeDb, type Row } from "./fake-service";

const WORKSPACE = "ws-1";
const OTHER_WORKSPACE = "ws-2";
const FORM = "11111111-1111-1111-1111-111111111111";
const OTHER_FORM = "22222222-2222-2222-2222-222222222222";
const RESPONSE = "33333333-3333-3333-3333-333333333333";
const OWNER = "44444444-4444-4444-4444-444444444444";
const MEMBER = "55555555-5555-5555-5555-555555555555";
const SUSPENDED = "66666666-6666-6666-6666-666666666666";

const SCHEMA = {
  fields: [
    { id: "full_name", type: "short_text", label: "Full name", required: true },
    { id: "email", type: "email", label: "Email address", required: false },
  ],
} as unknown as FormSchema;

function ctx(overrides: Partial<RunContext> = {}): RunContext {
  return {
    formId: FORM,
    workspaceId: WORKSPACE,
    responseId: RESPONSE,
    answers: { full_name: "Ada Lovelace", email: "ada@example.com" },
    schema: SCHEMA,
    formTitle: "Registration",
    schemaVersion: 1,
    notifyEmail: null,
    ...overrides,
  };
}

function workflow(overrides: Partial<Row> = {}): Row {
  return {
    id: "wf-1",
    workspace_id: WORKSPACE,
    name: "On submit",
    trigger_type: "new_response",
    trigger_form_id: FORM,
    enabled: true,
    actions: [],
    last_run_at: null,
    ...overrides,
  };
}

function seedDb(workflows: Row[], extra: Partial<FakeDb> = {}): FakeDb {
  return makeDb({
    workflows,
    responses: [{ id: RESPONSE, form_id: FORM, status: "new", assigned_to: null }],
    workspace_members: [
      { workspace_id: WORKSPACE, user_id: OWNER, status: "active" },
      { workspace_id: WORKSPACE, user_id: MEMBER, status: "active" },
      { workspace_id: WORKSPACE, user_id: SUSPENDED, status: "suspended" },
    ],
    workspaces: [{ id: WORKSPACE, credits_balance: 10 }],
    ...extra,
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const service = (db: FakeDb) => fakeService(db) as any;
const statusOf = (db: FakeDb) => db.responses[0].status;
const assigneeOf = (db: FakeDb) => db.responses[0].assigned_to;

/** Emails are metered separately from the workflow run itself. */
const emailCredits = (db: FakeDb) => db.credit_transactions.filter((t) => t.category === "email");

/** A local stand-in for Resend, so email is exercised without sending any. */
async function stubResend(status = 200) {
  const requests: any[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      requests.push({ url: req.url, body: JSON.parse(body || "{}") });
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status === 200 ? { id: "stub-email-1" } : { message: "domain is not verified" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    requests,
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Run `fn` with exactly this email environment, then restore it. */
async function withEmailEnv<T>(env: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const keys = ["RESEND_API_KEY", "RESEND_API_BASE", "NOTIFY_FROM_EMAIL", "DEFAULT_FROM_EMAIL", "SERVER_EMAIL"];
  const previous = keys.map((key) => [key, process.env[key]] as const);
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, env);
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("an enabled workflow runs, is recorded, stamped, logged and metered", async () => {
  const db = seedDb([workflow({ actions: [{ type: "update_status", internalStatus: "in_progress" }] })]);
  const summaries = await runWorkflows(service(db), ctx());

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].actions[0].ok, true);
  assert.equal(statusOf(db), "in_progress");

  assert.equal(db.workflow_runs.length, 1, "the run is recorded (and guards repeats)");
  assert.equal(db.workflow_runs[0].ok, true);
  assert.ok(db.workflows[0].last_run_at, "last_run_at is stamped — it never used to be");

  assert.equal(db.activity_logs.length, 1);
  assert.equal(db.activity_logs[0].action, "workflow.ran");
  assert.equal(db.activity_logs[0].user_id, null, "no human actor, so it isn't mis-attributed");

  assert.equal(db.credit_transactions.length, 1, "metered: 1 credit per run");
  assert.equal(db.credit_transactions[0].amount, -1);
  assert.equal(db.workspaces[0].credits_balance, 9);
});

test("a workflow belonging to another workspace never fires", async () => {
  const db = seedDb([
    workflow({ workspace_id: OTHER_WORKSPACE, actions: [{ type: "update_status", internalStatus: "completed" }] }),
  ]);
  const summaries = await runWorkflows(service(db), ctx());
  assert.equal(summaries.length, 0);
  assert.equal(statusOf(db), "new");
});

test("a catch-all workflow (no trigger form) fires for a form in its workspace", async () => {
  const db = seedDb([
    workflow({ trigger_form_id: null, actions: [{ type: "update_status", internalStatus: "completed" }] }),
  ]);
  await runWorkflows(service(db), ctx());
  assert.equal(statusOf(db), "completed");
});

test("a paused workflow is skipped", async () => {
  const db = seedDb([
    workflow({ enabled: false, actions: [{ type: "update_status", internalStatus: "completed" }] }),
  ]);
  const summaries = await runWorkflows(service(db), ctx());
  assert.equal(summaries.length, 0);
  assert.equal(statusOf(db), "new");
});

test("a pre-workspace form only runs its own explicitly targeted workflows", async () => {
  const db = seedDb([
    workflow({ id: "wf-catch-all", trigger_form_id: null }),
    workflow({ id: "wf-targeted", trigger_form_id: FORM, actions: [{ type: "assign_response", assignToUserId: OWNER }] }),
  ]);
  await runWorkflows(service(db), ctx({ workspaceId: null }));
  assert.equal(assigneeOf(db), OWNER);
  assert.equal(statusOf(db), "new");
});

test("one failing action doesn't stop the rest, and the run is marked failed", async () => {
  const db = seedDb([
    workflow({
      actions: [
        { type: "update_status", internalStatus: "not-a-status" },
        { type: "assign_response", assignToUserId: OWNER },
      ],
    }),
  ]);
  const [summary] = await runWorkflows(service(db), ctx());

  assert.equal(summary.actions.length, 2);
  assert.equal(summary.actions[0].ok, false);
  assert.match(String(summary.actions[0].detail), /[Nn]ot a response status/);
  assert.equal(summary.actions[1].ok, true, "the next action still ran");
  assert.equal(assigneeOf(db), OWNER);
  assert.equal(db.workflow_runs[0].ok, false, "the run records the failure");
});

test("a response runs a given workflow only once", async () => {
  const db = seedDb([workflow({ actions: [{ type: "update_status", internalStatus: "in_progress" }] })]);
  await runWorkflows(service(db), ctx());

  // Someone moves it back, then the same response is processed again.
  db.responses[0].status = "new";
  const second = await runWorkflows(service(db), ctx());

  assert.equal(second[0].skipped, "already-ran");
  assert.equal(statusOf(db), "new", "the repeat changed nothing");
  assert.equal(db.workflow_runs.length, 1, "and recorded no second run");
  assert.equal(db.activity_logs.length, 1);
});

test("an assignee who is no longer an active member is refused", async () => {
  const db = seedDb([workflow({ actions: [{ type: "assign_response", assignToUserId: SUSPENDED }] })]);
  const [summary] = await runWorkflows(service(db), ctx());
  assert.equal(summary.actions[0].ok, false);
  assert.match(String(summary.actions[0].detail), /active member/);
  assert.equal(assigneeOf(db), null);
});

test("notify_team writes one notification per active member, or just the chosen ones", async () => {
  const everyone = seedDb([workflow({ actions: [{ type: "notify_team" }] })]);
  await runWorkflows(service(everyone), ctx());
  assert.equal(everyone.notifications.length, 2, "the suspended member is skipped");
  assert.match(String(everyone.notifications[0].href), /open=/);

  const chosen = seedDb([workflow({ actions: [{ type: "notify_team", notifyUserIds: [OWNER] }] })]);
  await runWorkflows(service(chosen), ctx());
  assert.equal(chosen.notifications.length, 1);
  assert.equal(chosen.notifications[0].user_id, OWNER);
});

test("email actions fail cleanly when no provider is configured", async () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try {
    const db = seedDb([workflow({ actions: [{ type: "email_notification" }, { type: "confirmation_email" }] })]);
    const [summary] = await runWorkflows(service(db), ctx());
    assert.equal(summary.actions.length, 2);
    assert.equal(summary.actions[0].ok, false);
    assert.match(String(summary.actions[0].detail), /not configured/);
    assert.equal(summary.actions[1].ok, false);
    assert.equal(emailCredits(db).length, 0, "an unconfigured send is not billed");
  } finally {
    if (previous === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous;
  }
});

test("the webhook action posts the submission payload and logs the delivery", async () => {
  const received: string[] = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push(body);
      res.writeHead(204).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const db = seedDb([workflow({ actions: [{ type: "webhook", webhookUrl: `http://127.0.0.1:${port}/hook` }] })]);
    const [summary] = await runWorkflows(service(db), ctx());

    assert.equal(summary.actions[0].ok, true, String(summary.actions[0].detail));
    assert.equal(received.length, 1);
    const payload = JSON.parse(received[0]);
    assert.equal(payload.event, "submission");
    assert.equal(payload.response.id, RESPONSE);
    assert.equal(payload.form.id, FORM);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("a workflow with no actions still records a run, so the guard exists", async () => {
  const db = seedDb([workflow({ actions: [] })]);
  const summaries = await runWorkflows(service(db), ctx());
  assert.equal(summaries[0].actions.length, 0);
  assert.equal(db.workflow_runs.length, 1);
});

test("an unaffordable workspace isn't charged, and the run still happens", async () => {
  const db = seedDb([workflow({ actions: [{ type: "update_status", internalStatus: "completed" }] })], {
    workspaces: [{ id: WORKSPACE, credits_balance: 0 }],
  });
  await runWorkflows(service(db), ctx());
  assert.equal(db.credit_transactions.length, 0);
  assert.equal(statusOf(db), "completed");
});

test("parseWorkflowActions drops unknown types and caps the list at five", () => {
  const parsed = parseWorkflowActions([
    { type: "update_status", internalStatus: "new" },
    { type: "not-a-real-action" },
    null,
    ...Array.from({ length: 6 }, () => ({ type: "notify_team" })),
  ]);
  assert.equal(parsed.length, 5);
  assert.equal(parsed[0].type, "update_status");
});

test("workflowsForForm asks for enabled rows scoped to the workspace", async () => {
  const db = seedDb([
    workflow({ id: "wf-on", trigger_form_id: FORM }),
    workflow({ id: "wf-off", enabled: false, trigger_form_id: FORM }),
    workflow({ id: "wf-other-form", trigger_form_id: OTHER_FORM }),
    workflow({ id: "wf-other-ws", workspace_id: OTHER_WORKSPACE }),
  ]);
  const rows = await workflowsForForm(service(db), FORM, WORKSPACE);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["wf-on"]
  );
});

// ---------------------------------------------------------------------------
// Email: sender resolution and metering
// ---------------------------------------------------------------------------

test("a sent email uses the configured sender and costs exactly one credit", async () => {
  const stub = await stubResend();
  try {
    await withEmailEnv(
      {
        RESEND_API_KEY: "re_test",
        RESEND_API_BASE: stub.base,
        DEFAULT_FROM_EMAIL: "NibbleAI <no-reply@nibbleai.online>",
      },
      async () => {
        const db = seedDb([workflow({ actions: [{ type: "email_notification", emailTo: "owner@example.com" }] })]);
        const [summary] = await runWorkflows(service(db), ctx());

        assert.equal(summary.actions[0].ok, true, String(summary.actions[0].detail));
        assert.equal(stub.requests.length, 1);
        assert.equal(stub.requests[0].url, "/emails");
        assert.equal(stub.requests[0].body.from, "NibbleAI <no-reply@nibbleai.online>");
        assert.deepEqual(stub.requests[0].body.to, ["owner@example.com"]);
        assert.match(String(stub.requests[0].body.subject), /New response/);

        assert.equal(emailCredits(db).length, 1, "the email is metered on success");
        assert.equal(emailCredits(db)[0].amount, -1);
        assert.match(String(emailCredits(db)[0].description), /owner@example\.com/);
        // The workflow run itself is metered separately.
        assert.equal(db.credit_transactions.filter((t) => t.category === "workflow").length, 1);
      }
    );
  } finally {
    await stub.close();
  }
});

test("a refused email fails the action and is not billed", async () => {
  const stub = await stubResend(422);
  try {
    await withEmailEnv(
      { RESEND_API_KEY: "re_test", RESEND_API_BASE: stub.base, SERVER_EMAIL: "no-reply@nibbleai.online" },
      async () => {
        const db = seedDb([workflow({ actions: [{ type: "email_notification", emailTo: "owner@example.com" }] })]);
        const [summary] = await runWorkflows(service(db), ctx());

        assert.equal(summary.actions[0].ok, false);
        assert.match(String(summary.actions[0].detail), /HTTP 422/);
        assert.equal(emailCredits(db).length, 0, "a failed send is not billed");
        assert.equal(stub.requests[0].body.from, "no-reply@nibbleai.online", "SERVER_EMAIL is used when it is the only one");
      }
    );
  } finally {
    await stub.close();
  }
});

test("confirmation_email goes to the respondent's address from the answers", async () => {
  const stub = await stubResend();
  try {
    await withEmailEnv(
      { RESEND_API_KEY: "re_test", RESEND_API_BASE: stub.base, DEFAULT_FROM_EMAIL: "NibbleAI <no-reply@nibbleai.online>" },
      async () => {
        const db = seedDb([workflow({ actions: [{ type: "confirmation_email" }] })]);
        const [summary] = await runWorkflows(service(db), ctx());

        assert.equal(summary.actions[0].ok, true, String(summary.actions[0].detail));
        assert.deepEqual(stub.requests[0].body.to, ["ada@example.com"]);
        assert.equal(emailCredits(db).length, 1);
      }
    );
  } finally {
    await stub.close();
  }
});

test("the From address resolves NOTIFY_FROM_EMAIL -> DEFAULT_FROM_EMAIL -> SERVER_EMAIL", async () => {
  await withEmailEnv({ SERVER_EMAIL: "server@x.test" }, async () => {
    assert.equal(fromAddress(), "server@x.test");
  });
  await withEmailEnv({ SERVER_EMAIL: "server@x.test", DEFAULT_FROM_EMAIL: "default@x.test" }, async () => {
    assert.equal(fromAddress(), "default@x.test");
  });
  await withEmailEnv(
    { SERVER_EMAIL: "server@x.test", DEFAULT_FROM_EMAIL: "default@x.test", NOTIFY_FROM_EMAIL: "notify@x.test" },
    async () => {
      assert.equal(fromAddress(), "notify@x.test");
    }
  );
  await withEmailEnv({}, async () => {
    assert.equal(fromAddress(), "", "unset means no sender, not a guessed domain");
  });
});



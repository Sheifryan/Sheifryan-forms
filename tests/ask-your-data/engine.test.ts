// Self-tests for the ask-your-data engine. Pure-logic tests against in-memory
// rows: empty datasets, multi-condition filters, grouping, aggregation,
// sorting, missing data, caps and invalid/ambiguous questions — no DB or AI key.

import { test } from "node:test";
import assert from "node:assert/strict";

import { FIELDS, arraySource, footballDataset, row } from "./fixtures";
import { executeQuery } from "../../lib/ai/analysis/execute";
import { normalizeQuery } from "../../lib/ai/analysis/normalize";
import type { AskQuery, NormalizedAskQuery } from "../../lib/ai/analysis/types";

function baseList(overrides: Partial<NormalizedAskQuery> = {}): NormalizedAskQuery {
  return { operation: "list", select: ["name", "phone"], conditions: [], sort: [], limit: 100, ...overrides };
}

const SAT_AVAIL: NormalizedAskQuery = {
  ...baseList(),
  select: ["name", "phone", "position"],
  conditions: [{ fieldId: "availability", operator: "contains", optionId: "sat", value: "Saturday" }],
};

test("count returns the total submission number", async () => {
  const query: NormalizedAskQuery = { operation: "count", select: [], conditions: [], sort: [], limit: 100 };
  const outcome = await executeQuery(FIELDS, query, arraySource(footballDataset()));
  assert.equal(outcome.answer.type, "number");
  assert.equal((outcome.answer as { value: number }).value, 8);
});

test("empty dataset answers politely instead of crashing", async () => {
  const outcome = await executeQuery(FIELDS, baseList(), arraySource([]));
  assert.equal(outcome.answer.type, "message");
  assert.equal((outcome.answer as { kind: string }).kind, "empty");
  assert.equal(outcome.noSubmissions, true);
});

test("multi-select contains → people available on Saturday", async () => {
  const outcome = await executeQuery(FIELDS, SAT_AVAIL, arraySource(footballDataset()));
  assert.equal(outcome.answer.type, "table");
  const t = outcome.answer as { total: number; rows: string[][]; columns: string[] };
  assert.equal(t.total, 5); // John, David, Sarah, Grace, Ivan
  assert.equal(t.rows.length, 5);
  assert.deepEqual(t.columns, ["Full name", "Phone number", "Preferred position"]);
});

test("multiple filter conditions: females aged 18–25", async () => {
  const query: NormalizedAskQuery = {
    ...baseList({ select: ["name", "age"] }),
    conditions: [
      { fieldId: "age", operator: "between", value: 18, value2: 25 },
      { fieldId: "gender", operator: "equals", optionId: "female", value: "Female" },
    ],
  };
  const outcome = await executeQuery(FIELDS, query, arraySource(footballDataset()));
  const t = outcome.answer as { total: number; rows: string[][] };
  assert.equal(t.total, 2); // Sarah (21), Grace (18)
  const names = t.rows.map((r) => r[0]).sort();
  assert.deepEqual(names, ["Grace Achieng", "Sarah Nambi"]);
});

test("missing data: who didn't provide a phone number", async () => {
  const query: NormalizedAskQuery = {
    ...baseList({ select: ["name", "phone"] }),
    conditions: [{ fieldId: "phone", operator: "is_empty" }],
  };
  const outcome = await executeQuery(FIELDS, query, arraySource(footballDataset()));
  const t = outcome.answer as { total: number; rows: string[][] };
  assert.equal(t.total, 1);
  assert.equal(t.rows[0][0], "Ali Mukasa");
});

test("sorting by age descending puts oldest first", async () => {
  const query: NormalizedAskQuery = {
    ...baseList({ select: ["name", "age"] }),
    sort: [{ fieldId: "age", direction: "desc" }],
  };
  const outcome = await executeQuery(FIELDS, query, arraySource(footballDataset()));
  const t = outcome.answer as { rows: string[][] };
  assert.equal(t.rows[0][0], "Peter Okello"); // 35
  assert.equal(t.rows[t.rows.length - 1][0], "Grace Achieng"); // 18
});

test("aggregation: average age", async () => {
  const avg = 24.5; // 19+24+21+30+18+35+22+27 = 196 / 8
  const query: NormalizedAskQuery = {
    operation: "aggregate",
    select: [],
    conditions: [],
    sort: [],
    limit: 100,
    function: "avg",
    field: "age",
  };
  const outcome = await executeQuery(FIELDS, query, arraySource(footballDataset()));
  assert.equal(outcome.answer.type, "number");
  assert.ok(Math.abs((outcome.answer as { value: number }).value - avg) < 0.001);
});

test("group: submissions per position with stable counts", async () => {
  const query: NormalizedAskQuery = {
    operation: "group",
    select: [],
    conditions: [],
    sort: [],
    limit: 100,
    groupBy: "position",
  };
  const outcome = await executeQuery(FIELDS, query, arraySource(footballDataset()));
  assert.equal(outcome.answer.type, "chart");
  const chart = outcome.answer as { labels: string[]; values: number[] };
  assert.deepEqual(chart.labels, ["Striker", "Defender", "Goalkeeper", "Midfielder"]);
  assert.deepEqual(chart.values, [3, 2, 2, 1]);
});

test("compare male vs female registrations", async () => {
  const query: NormalizedAskQuery = {
    operation: "compare",
    select: [],
    conditions: [],
    sort: [],
    limit: 100,
    compareBy: "gender",
  };
  const outcome = await executeQuery(FIELDS, query, arraySource(footballDataset()));
  const chart = outcome.answer as { labels: string[]; values: number[] };
  assert.deepEqual(chart.labels, ["Male", "Female"]);
  assert.deepEqual(chart.values, [5, 3]);
});

test("normalizeQuery accepts option labels and maps them to option ids", () => {
  const raw: AskQuery = {
    operation: "list",
    select: ["name", "phone"],
    conditions: [{ field: "position", operator: "equals", value: "Striker" }],
  };
  const result = normalizeQuery(FIELDS, raw);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.query.conditions[0].optionId, "st");
    assert.equal(result.query.conditions[0].fieldId, "position");
  }
});

test("normalizeQuery clarifies when the field doesn't exist (Kampala)", () => {
  const raw: AskQuery = {
    operation: "list",
    select: ["name"],
    conditions: [{ field: "location", operator: "equals", value: "Kampala" }],
  };
  const result = normalizeQuery(FIELDS, raw);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.message.type, "message");
    assert.equal(result.message.kind, "clarify");
    assert.match(result.message.message, /location/i);
  }
});

test("normalizeQuery flags an unknown option for a choice field", () => {
  const raw: AskQuery = {
    operation: "list",
    select: ["name"],
    conditions: [{ field: "position", operator: "equals", value: "Bowler" }],
  };
  const result = normalizeQuery(FIELDS, raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message.message, /option/i);
});

test("table output is capped at the requested limit", async () => {
  const many = Array.from({ length: 250 }, (_, i) =>
    row(`big-${i}`, new Date(Date.UTC(2024, 0, 1) + i * 60_000).toISOString(), {
      name: `Player ${i}`,
      age: 20 + (i % 10),
    })
  );
  const query = baseList({ limit: 25 });
  const outcome = await executeQuery(FIELDS, query, arraySource(many));
  const t = outcome.answer as { returned: number; total: number; truncated: boolean };
  assert.equal(t.returned, 25);
  assert.equal(t.total, 250);
  assert.equal(t.truncated, true);
});

test("chunked scan handles datasets larger than one chunk", async () => {
  const many = Array.from({ length: 2500 }, (_, i) =>
    row(`chunk-${i}`, new Date(Date.UTC(2024, 0, 1) + i * 60_000).toISOString(), {
      name: `Player ${i}`,
      position: i % 2 === 0 ? "gk" : "st",
    })
  );
  const query: NormalizedAskQuery = {
    operation: "count",
    select: [],
    conditions: [],
    sort: [],
    limit: 100,
  };
  const outcome = await executeQuery(FIELDS, query, arraySource(many), { chunk: 1000 });
  assert.equal((outcome.answer as { value: number }).value, 2500);
  assert.equal(outcome.scanned, 2500);
  assert.equal(outcome.truncatedScan, false);
});

test("is_empty treats missing keys and blank strings as empty", async () => {
  const rows = [
    row("a1", "2024-02-01T00:00:00.000Z", { name: "No phone key" }),
    row("a2", "2024-02-01T00:00:00.000Z", { name: "Blank phone", phone: "" }),
    row("a3", "2024-02-01T00:00:00.000Z", { name: "Has phone", phone: "+256700111222" }),
  ];
  const query: NormalizedAskQuery = {
    ...baseList({ select: ["name", "phone"] }),
    conditions: [{ fieldId: "phone", operator: "is_empty" }],
  };
  const outcome = await executeQuery(FIELDS, query, arraySource(rows));
  const t = outcome.answer as { total: number };
  assert.equal(t.total, 2);
});

test("summary produces per-field insight cards", async () => {
  const query: NormalizedAskQuery = {
    operation: "summary",
    select: [],
    conditions: [],
    sort: [],
    limit: 100,
  };
  const outcome = await executeQuery(FIELDS, query, arraySource(footballDataset()));
  assert.equal(outcome.answer.type, "summary");
  const summary = outcome.answer as { items: { label: string; detail: string }[] };
  const positionItem = summary.items.find((i) => i.label === "Preferred position");
  assert.ok(positionItem);
  assert.match(positionItem.detail, /Striker \(3\)/);
});


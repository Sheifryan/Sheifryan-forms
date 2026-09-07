// Zod contracts for the "Ask your data" interpretation. The model's reply is
// parsed against this discriminated union before anything touches the DB — a
// malformed or out-of-contract reply is rejected (and retried by completeJSON).

import { z } from "zod";
import type { AiInterpretation, AskQuery } from "./types";

export const CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "greater_than",
  "less_than",
  "greater_than_or_equal",
  "less_than_or_equal",
  "between",
  "one_of",
  "is_empty",
  "is_not_empty",
] as const;

export const AGGREGATE_FUNCTIONS = ["count", "avg", "sum", "min", "max"] as const;

const conditionSchema = z
  .object({
    field: z.string().min(1).max(200),
    operator: z.enum(CONDITION_OPERATORS),
    value: z.union([z.string().max(500), z.number()]).optional(),
    value2: z.union([z.string().max(500), z.number()]).optional(),
    values: z.array(z.union([z.string().max(500), z.number()])).min(1).max(60).optional(),
  })
  .superRefine((c, ctx) => {
    const needsValue = !["is_empty", "is_not_empty"].includes(c.operator);
    const valueSet =
      c.value !== undefined ||
      c.values !== undefined ||
      (c.operator === "between" && c.value2 !== undefined);
    if (needsValue && !valueSet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Operator "${c.operator}" needs a value (or values for one_of).`,
        path: ["value"],
      });
    }
    if (c.operator === "between" && c.value2 === undefined && !c.values) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Operator "between" needs value2 (the upper bound).',
        path: ["value2"],
      });
    }
  });

const clarifySchema = z.object({
  operation: z.literal("clarify"),
  clarification: z.string().min(1).max(700),
});

const baseQueryFields = {
  conditions: z.array(conditionSchema).max(8).optional(),
};

const countSchema = z.object({
  operation: z.literal("count"),
  ...baseQueryFields,
  scope: z.enum(["all", "matching"]).optional(),
});

const listSchema = z.object({
  operation: z.literal("list"),
  ...baseQueryFields,
  select: z.array(z.string().min(1).max(200)).min(1).max(8).optional(),
  sort: z
    .array(z.object({ field: z.string().min(1).max(200), direction: z.enum(["asc", "desc"]) }))
    .min(1)
    .max(3)
    .optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const metricSchema = z.object({
  function: z.enum(AGGREGATE_FUNCTIONS),
  field: z.string().min(1).max(200).optional(),
});

const groupSchema = z.object({
  operation: z.literal("group"),
  ...baseQueryFields,
  groupBy: z.string().min(1).max(200),
  metric: metricSchema.optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const aggregateSchema = z.object({
  operation: z.literal("aggregate"),
  ...baseQueryFields,
  function: z.enum(AGGREGATE_FUNCTIONS),
  field: z.string().min(1).max(200).optional(),
});

const compareSchema = z.object({
  operation: z.literal("compare"),
  ...baseQueryFields,
  compareBy: z.string().min(1).max(200),
  metric: metricSchema.optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const summarySchema = z.object({
  operation: z.literal("summary"),
  ...baseQueryFields,
  scope: z.enum(["all", "matching"]).optional(),
});

export const askQuerySchema = z.discriminatedUnion("operation", [
  clarifySchema,
  countSchema,
  listSchema,
  groupSchema,
  aggregateSchema,
  compareSchema,
  summarySchema,
]);

export type AskQueryRaw = z.infer<typeof askQuerySchema>;
export type { AiInterpretation, AskQuery };

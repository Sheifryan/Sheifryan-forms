// POST /api/ai/ask — "Ask your data" endpoint.
//
// Pipeline: ownership check → fingerprint + cache hit → AI interprets the
// question into a strict operation JSON → deterministic validation against the
// form's real fields → server-side chunked execution over the owner's rows →
// (optional) sanitized AI narration → structured answer. Raw submissions never
// reach the browser or the model.

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { aiConfigured, aiRateLimited, completeJSON } from "@/lib/ai/client";
import { buildAskPrompt } from "@/lib/ai/analysis/prompts";
import { canAnalyseForm } from "@/lib/ai/analysis/access";
import { aiErrorMessage } from "@/lib/ai/errors";
import { askQuerySchema, type AskQueryRaw } from "@/lib/ai/analysis/contracts";
import { normalizeQuery } from "@/lib/ai/analysis/normalize";
import { executeQuery } from "@/lib/ai/analysis/execute";
import { createSupabaseResponsesSource } from "@/lib/ai/analysis/source";
import {
  buildNarrationPrompt,
  narrationSchema,
  shouldNarrate,
  type NarrationView,
} from "@/lib/ai/analysis/summarize";
import { getCachedAnswer, putCachedAnswer, type CacheFingerprint } from "@/lib/ai/analysis/cache";
import type { MessageAnswer, NormalizedAskQuery, StructuredAnswer, AskQuery } from "@/lib/ai/analysis/types";
import type { FormField, FormSchema } from "@/lib/schema";

export const runtime = "nodejs";

const MAX_QUESTION = 500;

function sanitizeQuestion(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_QUESTION);
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "AI isn't configured yet. Add AI_API_KEY to your .env file and restart the dev server." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const formId = typeof body?.formId === "string" ? body.formId : "";
  const question = sanitizeQuestion(body?.question);
  if (!formId) return NextResponse.json({ error: "Missing form id" }, { status: 400 });
  if (!question) {
    return NextResponse.json({ error: "Ask a question about your submissions first." }, { status: 400 });
  }
  if (aiRateLimited(user.id, 6)) {
    return NextResponse.json({ error: "Too many AI requests — try again in a minute." }, { status: 429 });
  }

  // Ownership gate: the caller must be allowed to read this form's responses —
  // either it is their own form, or they hold 'responses.read' in its workspace.
  const { data: form } = await supabase
    .from("forms")
    .select("id, owner_id, workspace_id, title, description, schema, schema_version")
    .eq("id", formId)
    .single();
  if (!form || !(await canAnalyseForm(supabase, form, user.id))) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  const fields = ((form.schema as FormSchema | null)?.fields ?? []) as FormField[];
  const model = process.env.AI_MODEL ?? "deepseek-chat";

  // Dataset fingerprint → cheap cache hits for repeated questions.
  const source = createSupabaseResponsesSource(supabase, formId);
  const [responseCount, latestResponseAt] = await Promise.all([source.count(), source.latestCreatedAt()]);
  const fp: CacheFingerprint = {
    schemaVersion: Number(form.schema_version ?? 1),
    responseCount,
    latestResponseAt,
  };

  let serviceClient: ReturnType<typeof createServiceClient> | null = null;
  try {
    serviceClient = createServiceClient();
  } catch (err) {
    console.error("[ask] service client unavailable (caching off):", err instanceof Error ? err.message : err);
  }

  try {
    const cached = serviceClient
      ? await getCachedAnswer(serviceClient, formId, question, fp, model)
      : null;
    if (cached) {
      return NextResponse.json(
        { answer: cached.answer, query: cached.query, model: cached.model, cached: true },
        { status: 200 }
      );
    }

    // 1. AI interpretation → strict JSON operation.
    const { system, user: userPrompt } = buildAskPrompt(
      {
        title: form.title,
        description: (form.description as string | undefined) ?? "",
        totalResponses: responseCount,
        fields,
      },
      question
    );
    const raw = await completeJSON<AskQueryRaw>({
      system,
      user: userPrompt,
      schema: askQuerySchema,
      maxTokens: 1200,
    });

    if (raw.operation === "clarify") {
      const answer: StructuredAnswer = {
        type: "message",
        kind: "clarify",
        title: "I need a little more information",
        message: raw.clarification,
      };
      if (serviceClient)
        await putCachedAnswer(serviceClient, formId, question, fp, model, { v: 1, answer, query: null });
      return NextResponse.json({ answer, query: null, model, cached: false }, { status: 200 });
    }

    // 2. Deterministic validation against the actual schema.
    const normalized = normalizeQuery(fields, raw as AskQuery);
    if (!normalized.ok) {
      if (serviceClient)
        await putCachedAnswer(serviceClient, formId, question, fp, model, {
          v: 1,
          answer: normalized.message,
          query: null,
        });
      return NextResponse.json({ answer: normalized.message, query: null, model, cached: false }, { status: 200 });
    }
    const query = normalized.query;

    // 3. Execute against the DB.
    const outcome = await executeQuery(fields, query, source);
    let answer = outcome.answer;

    // 4. Optional sanitized AI narration (never receives raw rows).
    if (shouldNarrate(answer) && outcome.matchedRows.length > 0 && aiConfigured()) {
      try {
        const view = buildNarrationView(form.title, question, query, answer, fields);
        const { system: narSystem, user: narUser } = buildNarrationPrompt(view);
        const narration = await completeJSON({
          system: narSystem,
          user: narUser,
          schema: narrationSchema,
          temperature: 0.2,
          maxTokens: 200,
        });
        if (answer.type !== "message") {
          answer = { ...answer, summary: narration.explanation } as StructuredAnswer;
        }
      } catch (err) {
        console.error("[ask] narration skipped:", err instanceof Error ? err.message : err);
      }
    }

    if (serviceClient)
      await putCachedAnswer(serviceClient, formId, question, fp, model, { v: 1, answer, query });
    return NextResponse.json({ answer, query, model, cached: false }, { status: 200 });
  } catch (err) {
    console.error("[ai/ask]", err);
    const message = aiErrorMessage(err, "The AI couldn't answer that question. Try again.");
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** Compact, safe view of a result for the narration model. */
function buildNarrationView(
  formTitle: string,
  question: string,
  query: NormalizedAskQuery,
  answer: StructuredAnswer,
  fields: FormField[]
): NarrationView {
  const labelOf = (id: string) => fields.find((f) => f.id === id)?.label ?? id;
  const fieldLabels = new Set<string>();
  query.select.forEach((id) => fieldLabels.add(labelOf(id)));
  for (const cond of query.conditions) fieldLabels.add(labelOf(cond.fieldId));
  if (query.groupBy) fieldLabels.add(labelOf(query.groupBy));
  if (query.compareBy) fieldLabels.add(labelOf(query.compareBy));
  if (query.field) fieldLabels.add(labelOf(query.field));

  const view: NarrationView = {
    formTitle,
    question,
    operation: query.operation,
    fields: [...fieldLabels],
    numbers: [],
  };

  if (answer.type === "chart") {
    view.breakdown = answer.labels.map((label, i) => ({ label, count: answer.values[i] ?? 0 }));
    view.numbers = [{ label: "total submissions grouped", value: answer.total }];
  }
  if (answer.type === "summary") {
    view.summaryItems = answer.items;
  }
  return view;
}


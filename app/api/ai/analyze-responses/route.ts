import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { aiConfigured, aiRateLimited, completeJSON } from "@/lib/ai/client";
import { buildAnalysisPrompt } from "@/lib/ai/prompts";
import { buildResponseDigest } from "@/lib/ai/answers";
import { analysisSchema, type AnalysisResult } from "@/lib/ai/contracts";
import type { FormField, FormSchema } from "@/lib/schema";

const RESPONSE_CAP = 300;

/**
 * Analyze real submissions for an owner's form. Responses are aggregated and
 * PII-redacted into a compact digest server-side, then sent to the AI. The
 * structured result is cached in form_analyses so repeat views are instant.
 */
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
  if (aiRateLimited(user.id, 5)) {
    return NextResponse.json({ error: "Too many AI requests — try again in a minute." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const formId = typeof body?.formId === "string" ? body.formId : "";
  if (!formId) return NextResponse.json({ error: "Missing form id" }, { status: 400 });

  const { data: form } = await supabase
    .from("forms")
    .select("id, owner_id, title, description, schema")
    .eq("id", formId)
    
    .single();
  if (!form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  // Optional "since" (ISO timestamp) limits the run to newer responses, so the
  // owner can analyze just what arrived since the last run.
  const since =
    typeof body?.since === "string" && !Number.isNaN(Date.parse(body.since)) ? body.since : undefined;

  let query = supabase
    .from("responses")
    .select("answers, created_at")
    .eq("form_id", formId)
    .order("created_at", { ascending: false })
    .limit(RESPONSE_CAP);
  if (since) query = query.gte("created_at", since);

  const { data: rows } = await query;
  const responses = (rows ?? []) as { answers: Record<string, unknown>; created_at: string }[];

  if (responses.length === 0) {
    return NextResponse.json(
      { noResponses: true, message: since ? "No newer responses to analyze yet." : "No responses yet — share the form's public link first." },
      { status: 200 }
    );
  }

  const fields = (form.schema as FormSchema | null)?.fields as FormField[] | undefined;
  const digest = buildResponseDigest(fields ?? [], responses);

  try {
    const { system, user: userPrompt } = buildAnalysisPrompt({
      title: form.title,
      description: (form.description as string | undefined) ?? "",
      digest,
    });
    const insight = await completeJSON<AnalysisResult>({
      system,
      user: userPrompt,
      schema: analysisSchema,
    });

    // Persist through the service client (RLS only grants the owner SELECT).
    const service = createServiceClient();
    const { data: saved, error: insertError } = await service
      .from("form_analyses")
      .insert({
        form_id: formId,
        responses_analyzed: responses.length,
        response_window: {
          from: digest.from ?? null,
          to: digest.to ?? null,
        },
        insight,
        model: process.env.AI_MODEL ?? "deepseek-chat",
      })
      .select("id, form_id, created_at, responses_analyzed, response_window, insight, model")
      .single();

    if (insertError || !saved) {
      console.error("[ai/analyze-responses] Couldn't cache analysis:", insertError?.message);
      return NextResponse.json({ analysis: { insight, responses_analyzed: responses.length } }, { status: 200 });
    }
    return NextResponse.json({ analysis: saved }, { status: 200 });
  } catch (err) {
    console.error("[ai/analyze-responses]", err);
    const message = err instanceof Error ? err.message : "The AI analysis failed. Try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

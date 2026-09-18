import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { aiConfigured, aiRateLimited, completeJSON } from "@/lib/ai/client";
import { recordAiUsage } from "@/lib/ai/quota";
import { buildCritiquePrompt, type EditableFormShape } from "@/lib/ai/prompts";
import { canAnalyseForm } from "@/lib/ai/analysis/access";
import { critiqueSchema, type CritiqueResult } from "@/lib/ai/contracts";
import { aiErrorMessage } from "@/lib/ai/errors";
import type { FormField, FormSchema } from "@/lib/schema";

/**
 * Pre-publish review of a form. The owner's latest editor state is sent from
 * the client so unsaved changes are critiqued; ownership is still verified
 * server-side against the form row.
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
  if (aiRateLimited(user.id)) {
    return NextResponse.json({ error: "Too many AI requests — try again in a minute." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const formId = typeof body?.formId === "string" ? body.formId : "";
  if (!formId) return NextResponse.json({ error: "Missing form id" }, { status: 400 });

  const { data: form } = await supabase
    .from("forms")
    .select("id, owner_id, workspace_id, title, description, schema")
    .eq("id", formId)
    .single();
  if (!form || !(await canAnalyseForm(supabase, form, user.id))) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  // Prefer the client's latest editor snapshot when it's well-formed.
  const snapshotSchema = body?.schema as FormSchema | undefined;
  const clientFields: FormField[] = Array.isArray(snapshotSchema?.fields)
    ? (snapshotSchema.fields as FormField[])
    : [];
  const effective: EditableFormShape = {
    title: typeof body?.title === "string" && body.title.trim() ? body.title.trim() : form.title,
    description:
      typeof body?.description === "string" && body.description.trim()
        ? body.description.trim()
        : (form.description as string | undefined) ?? "",
    fields: clientFields.length > 0
      ? clientFields.filter((f) => f && typeof f.id === "string" && typeof f.label === "string")
      : (((form.schema as FormSchema | null)?.fields as FormField[] | undefined) ?? []),
  };
  if (effective.fields.length === 0) {
    return NextResponse.json({ error: "Add at least one question before asking for a review." }, { status: 400 });
  }

  try {
    const { system, user: userPrompt } = buildCritiquePrompt(effective);
    const critique = await completeJSON<CritiqueResult>({
      system,
      user: userPrompt,
      schema: critiqueSchema,
    });
    // Meter the review (meter-only: nothing blocks on this yet).
    void recordAiUsage(createServiceClient(), { workspaceId: form.workspace_id, userId: user.id, formId, kind: "critique" });
    return NextResponse.json({ critique });
  } catch (err) {
    console.error("[ai/critique]", err);
    const message = aiErrorMessage(err, "The AI review failed — try again.");
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

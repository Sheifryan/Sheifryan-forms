import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, aiRateLimited, completeJSON } from "@/lib/ai/client";
import { buildGenerationPrompt } from "@/lib/ai/prompts";
import { formDraftSchema, normalizeFormDraft, type FormDraftOutput } from "@/lib/ai/contracts";

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
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 5) {
    return NextResponse.json({ error: "Describe the form you want in a sentence or two." }, { status: 400 });
  }
  if (prompt.length > 1000) {
    return NextResponse.json({ error: "Keep the description under 1000 characters." }, { status: 400 });
  }
  if (aiRateLimited(user.id)) {
    return NextResponse.json({ error: "Too many AI requests — try again in a minute." }, { status: 429 });
  }

  try {
    const { system, user: userPrompt } = buildGenerationPrompt(prompt);
    const raw = await completeJSON<FormDraftOutput>({ system, user: userPrompt, schema: formDraftSchema });
    return NextResponse.json(normalizeFormDraft(raw));
  } catch (err) {
    console.error("[ai/generate-form]", err);
    const message = err instanceof Error ? err.message : "The AI couldn't build a form. Try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

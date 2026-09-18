// POST /api/ai/import-form — "Import an existing form".
//
// Takes photos/scans of a paper form, a PDF or a Word document, reads it, and
// returns the SAME shape as /api/ai/generate-form, so the builder preview and
// the "Open in builder" flow are reused unchanged.
//
// The uploaded bytes are processed in memory and discarded — nothing is written
// to Supabase Storage, form_files or the database.

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolveActiveWorkspace } from "@/lib/workspace-server";
import { aiConfigured, aiRateLimited, completeJSON, imagePart, type ContentPart } from "@/lib/ai/client";
import { recordAiUsage } from "@/lib/ai/quota";
import { buildImportPrompt } from "@/lib/ai/prompts";
import { formDraftSchema, normalizeFormDraft, type FormDraftOutput } from "@/lib/ai/contracts";
import {
  extractSource,
  UnsupportedFileError,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_IMAGES,
  type ExtractedSource,
} from "@/lib/ai/import/extract";
import { aiErrorMessage } from "@/lib/ai/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_HINT = 300;

function megabytes(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
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
  if (aiRateLimited(user.id, 6)) {
    return NextResponse.json({ error: "Too many AI requests — try again in a minute." }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Upload a form to import." }, { status: 400 });

  const files = form.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) {
    return NextResponse.json(
      { error: "Upload a form first — a photo or scan, a PDF, or a Word document." },
      { status: 400 }
    );
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Upload at most ${MAX_FILES} files at a time.` }, { status: 400 });
  }
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `"${file.name}" is ${megabytes(file.size)} — the limit is ${megabytes(MAX_FILE_BYTES)} per file.` },
        { status: 413 }
      );
    }
  }
  const hint = typeof form.get("hint") === "string" ? String(form.get("hint")).trim().slice(0, MAX_HINT) : "";

  try {
    const sources: ExtractedSource[] = [];
    for (const file of files) {
      sources.push(
        await extractSource({
          bytes: new Uint8Array(await file.arrayBuffer()),
          declaredMime: file.type,
          filename: file.name,
        })
      );
    }

    const text = sources
      .map((source) => source.text)
      .filter(Boolean)
      .join("\n\n")
      .trim();
    const images = sources.flatMap((source) => source.images).slice(0, MAX_IMAGES);
    const warnings = [...new Set(sources.flatMap((source) => source.warnings))];

    if (images.length === 0 && text.length < 20) {
      return NextResponse.json(
        {
          error:
            warnings[0] ??
            "I couldn't read anything in that file. Try a sharper photo, or export the form as a PDF.",
        },
        { status: 422 }
      );
    }

    const { system, user: userPrompt } = buildImportPrompt({
      kind: images.length > 0 && !text ? "image" : sources[0].kind,
      text,
      pageCount: images.length,
      hint,
    });

    const content: ContentPart[] = [{ type: "text", text: userPrompt }];
    for (const image of images) {
      content.push(imagePart(image.mimeType, image.dataUrl.slice(image.dataUrl.indexOf(",") + 1)));
    }

    const raw = await completeJSON<FormDraftOutput>({
      system,
      user: content,
      schema: formDraftSchema,
      temperature: 0.2,
      // Optional pin: some accounts expose a specific vision model.
      model: process.env.AI_VISION_MODEL || undefined,
    });
    const draft = normalizeFormDraft(raw);

    // Meter the import against the workspace the user is working in (meter-only:
    // nothing blocks on this yet). One uploaded form = one AI request.
    const { workspace } = await resolveActiveWorkspace();
    void recordAiUsage(createServiceClient(), { workspaceId: workspace?.id ?? null, userId: user.id, kind: "import" });

    return NextResponse.json({
      ...draft,
      warnings,
      source: {
        files: files.length,
        pages: sources.reduce((sum, source) => sum + source.pages, 0),
        images: images.length,
        chars: text.length,
      },
    });
  } catch (err) {
    if (err instanceof UnsupportedFileError) {
      return NextResponse.json({ error: err.message }, { status: 415 });
    }
    console.error("[ai/import-form]", err);
    return NextResponse.json(
      { error: aiErrorMessage(err, "I couldn't convert that file into a form. Try again.") },
      { status: 502 }
    );
  }
}

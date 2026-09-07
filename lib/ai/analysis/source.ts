// Supabase-backed ResponsesSource for the ask engine. All reads go through the
// session-scoped client, so row-level security (owner-only responses) applies
// to every chunk the engine pulls. Ranges are ordered by created_at + id so
// pagination is stable even when submissions share a timestamp.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResponseRowLike, ResponsesSource } from "./types";

interface ResponseRowShape {
  id: string;
  answers: Record<string, unknown>;
  created_at: string;
}

export function createSupabaseResponsesSource(
  supabase: SupabaseClient,
  formId: string
): ResponsesSource {
  return {
    async count(): Promise<number> {
      const { count } = await supabase
        .from("responses")
        .select("id", { count: "exact", head: true })
        .eq("form_id", formId);
      return count ?? 0;
    },
    async latestCreatedAt(): Promise<string | null> {
      const { data } = await supabase
        .from("responses")
        .select("created_at")
        .eq("form_id", formId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.created_at as string | undefined) ?? null;
    },
    async range(start: number, end: number): Promise<ResponseRowLike[]> {
      const { data, error } = await supabase
        .from("responses")
        .select("id, answers, created_at")
        .eq("form_id", formId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(start, Math.max(start, end - 1));
      if (error) {
        console.error("[ask] response scan failed:", error.message);
        return [];
      }
      return (data ?? []) as ResponseRowShape[];
    },
  };
}

export type { ResponseRowLike };

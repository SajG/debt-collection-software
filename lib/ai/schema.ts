import { z } from "zod";

export const recommendationContentSchema = z.object({
  nextAction: z.string().min(1),
  urgency: z.enum(["today", "this_week", "this_month"]),
  talkingPoints: z.array(z.string().min(1)).min(1).max(5),
  draftMessage: z.string().min(1),
});

export type RecommendationContent = z.infer<typeof recommendationContentSchema>;

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const body = fenced?.[1]?.trim() ?? trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

export function parseRecommendation(raw: string): RecommendationContent | null {
  try {
    const parsed = recommendationContentSchema.safeParse(
      JSON.parse(extractJsonObject(raw))
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

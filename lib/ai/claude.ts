import { captureError } from "../monitoring";
import { parseRecommendation, type RecommendationContent } from "./schema";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const CLAUDE_MODEL = "claude-haiku-4-5";

export type PartyAiContext = {
  name: string;
  outstanding: number;
  maxDaysOverdue: number;
  brokenPromises: number;
  riskLevel: string;
  creditDays: number | null;
  openInvoices: { number: string; pending: number; daysOverdue: number }[];
  recentPayments: { date: string; amount: number; method: string }[];
  recentActions: { date: string; type: string; outcome: string | null; notes: string | null }[];
};

const SYSTEM_PROMPT = `You are a credit-collections advisor for an Indian MSME distributor. Customers are small shops and traders buying on 30-60 day credit. Recommend the single next best collection action for the given customer. Be direct, specific, and culturally aware (Indian B2B, Hinglish WhatsApp drafts are fine).

Respond with ONLY a JSON object, no prose, exactly this shape:
{"nextAction": string, "urgency": "today"|"this_week"|"this_month", "talkingPoints": string[] (1-5 items), "draftMessage": string (a short WhatsApp message to the customer)}`;

export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function callOnce(context: PartyAiContext): Promise<string | null> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: JSON.stringify(context) }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  return data.content?.find((b) => b.type === "text")?.text ?? null;
}

export async function generatePartyRecommendation(
  context: PartyAiContext
): Promise<RecommendationContent | null> {
  if (!claudeConfigured()) return null;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await callOnce(context);
      if (raw) {
        const parsed = parseRecommendation(raw);
        if (parsed) return parsed;
      }
    }
    return null;
  } catch (e) {
    await captureError(e, { scope: "ai.recommendation" });
    return null;
  }
}

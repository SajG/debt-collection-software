// THE deterministic sending gate. Every outbound message — automated,
// scheduled, or a manual "send now" click — must pass evaluateGate() inside
// sendMessage() (lib/messaging/send.ts). There is no bypass parameter, and
// none should ever be added. Pure function: all state is injected, so it is
// unit-testable and cannot be talked around by prompts or callers.

import type { ConsentStatus } from "@prisma/client";

export type GateParty = {
  consentStatus: ConsentStatus;
  outreachPaused: boolean;
};

export type GateSettings = {
  /** IANA timezone the quiet hours apply in, e.g. "Asia/Kolkata". */
  timezone: string;
  /** Local hour (0–23) before which nothing may be sent. */
  quietHoursStart: number;
  /** Local hour (0–23) at/after which nothing may be sent. */
  quietHoursEnd: number;
  /** Max outbound messages to one party per local calendar day. */
  maxMessagesPerDay: number;
  /** Max outbound messages to one party per rolling 7 days. */
  maxMessagesPerWeek: number;
};

export type GateInput = {
  party: GateParty;
  settings: GateSettings;
  /** Timestamps of outbound messages actually sent to this party in the last 7 days. */
  recentOutboundAt: Date[];
  /**
   * Failed attempts (provider errors). They never reached the party, so the
   * weekly cap ignores them — but they count toward the daily cap so a
   * misconfigured provider can't be hammered by retries all day.
   */
  recentFailedAt?: Date[];
  now?: Date;
};

export type GateResult = { allowed: true } | { allowed: false; reason: string };

type LocalTime = { hour: number; dayKey: string };

function localTime(date: Date, timeZone: string): LocalTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // "24" can appear for midnight in some ICU versions — normalise to 0.
  const hour = Number(get("hour")) % 24;
  return { hour, dayKey: `${get("year")}-${get("month")}-${get("day")}` };
}

export function evaluateGate(input: GateInput): GateResult {
  const { party, settings, recentOutboundAt } = input;
  const now = input.now ?? new Date();

  if (party.consentStatus === "OPTED_OUT") {
    return { allowed: false, reason: "Party has opted out of messages" };
  }

  if (party.outreachPaused) {
    return {
      allowed: false,
      reason: "Outreach is paused for this party (e.g. open dispute)",
    };
  }

  if (party.consentStatus !== "OPTED_IN") {
    return {
      allowed: false,
      reason: "No recorded consent — capture opt-in before messaging",
    };
  }

  const nowLocal = localTime(now, settings.timezone);
  if (
    nowLocal.hour < settings.quietHoursStart ||
    nowLocal.hour >= settings.quietHoursEnd
  ) {
    return {
      allowed: false,
      reason: `Outside allowed hours (${settings.quietHoursStart}:00–${settings.quietHoursEnd}:00 ${settings.timezone})`,
    };
  }

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const withinWeek = recentOutboundAt.filter((t) => t >= weekAgo && t <= now);
  if (withinWeek.length >= settings.maxMessagesPerWeek) {
    return {
      allowed: false,
      reason: `Weekly contact limit reached (${settings.maxMessagesPerWeek} in 7 days)`,
    };
  }

  const attemptsToday = [...withinWeek, ...(input.recentFailedAt ?? [])].filter(
    (t) => localTime(t, settings.timezone).dayKey === nowLocal.dayKey
  );
  if (attemptsToday.length >= settings.maxMessagesPerDay) {
    return {
      allowed: false,
      reason: `Daily contact limit reached (${settings.maxMessagesPerDay}/day)`,
    };
  }

  return { allowed: true };
}

import { describe, expect, it } from "vitest";
import {
  buildCapturePayload,
  posthogConfig,
  PRODUCT_EVENTS,
  sanitizeProperties,
} from "../analytics-events/posthog";

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
const ORG = "0b8c6f0e-1111-4222-8333-444455556666";
const PROFILE = "7d1a2b3c-aaaa-4bbb-8ccc-ddddeeeeffff";

describe("product analytics", () => {
  it("knows the nine agreed events", () => {
    expect([...PRODUCT_EVENTS].sort()).toEqual(
      [
        "company_created", "first_order_placed", "first_payment_recorded", "plan_selected",
        "reminder_sent", "signup_completed", "subscription_activated", "tally_connected", "user_invited",
      ].sort(),
    );
  });

  it("is off without a key and defaults to the EU cloud", () => {
    expect(posthogConfig(env({}))).toBeNull();
    expect(posthogConfig(env({ NEXT_PUBLIC_POSTHOG_KEY: "phc_x" }))).toEqual({ key: "phc_x", host: "https://eu.i.posthog.com" });
    expect(posthogConfig(env({ NEXT_PUBLIC_POSTHOG_KEY: "phc_x", NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com/" })))
      .toEqual({ key: "phc_x", host: "https://us.i.posthog.com" });
  });

  it("identifies by profile id and groups by company", () => {
    const p = buildCapturePayload(
      { event: "plan_selected", profileId: PROFILE, organizationId: ORG, properties: { plan: "growth", cycle: "annual" } },
      "phc_x",
      new Date("2026-10-09T00:00:00Z"),
    );
    expect(p.distinct_id).toBe(PROFILE);
    expect(p.properties.$groups).toEqual({ organization: ORG });
    expect(p.properties).toMatchObject({ plan: "growth", cycle: "annual", $geoip_disable: true });
  });

  it("uses the company as the actor for automated work", () => {
    const p = buildCapturePayload({ event: "reminder_sent", profileId: null, organizationId: ORG }, "k");
    expect(p.distinct_id).toBe(`org:${ORG}`);
  });

  it("drops names, free text, emails, phones and amounts", () => {
    expect(
      sanitizeProperties({
        plan: "growth",
        automated: true,
        seats: 5,
        // none of these may leave the server:
        customerName: "Shree Ganesh Plywood",
        partyName: "Sai Traders",
        amount: 184500,
        email: "a@b.in",
        channel: "Shree Ganesh Plywood & Hardware", // allowed key, free-text value
        kind: "a@b.in",
        role: "9999900010 call me",
        seatsHuge: 5,
        change: 184500.5,
        source: { nested: "x" },
      }),
    ).toEqual({ plan: "growth", automated: true, seats: 5 });
    // A large number under an allowed key is still dropped.
    expect(sanitizeProperties({ seats: 184500 })).toEqual({});
  });
});

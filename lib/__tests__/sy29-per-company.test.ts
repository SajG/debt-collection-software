import { beforeEach, describe, expect, it, vi } from "vitest";

// SY29 — "Pay now" and automated reminders must work from a company's
// OWN settings, and must not borrow the platform-wide env values that
// only the legacy Synergy tenant may fall back to.

type Row = {
  organizationId: string;
  organization: { slug: string };
  razorpayKeyId: string | null;
  razorpayKeySecret: string | null;
  razorpayWebhookSecret: string | null;
  whatsappPhoneNumberId: string | null;
  whatsappBusinessAccountId: string | null;
  whatsappApiToken: string | null;
  whatsappTemplateName: string | null;
  tallySyncTokenHash: null;
  tallyHost: null;
  tallyPort: null;
  tallyCompanyName: null;
};
const rows = new Map<string, Row>();
const features = new Map<string, boolean>();

vi.mock("@/lib/tenant", () => ({
  tenantDb: (organizationId: string) => ({
    businessSettings: {
      findUnique: async () => rows.get(organizationId) ?? null,
      findFirst: async () => rows.get(organizationId) ?? null,
    },
  }),
}));
vi.mock("@/lib/crypto", () => ({
  decryptSecret: (v: string) => v.replace(/^enc:/, ""),
  encryptSecret: (v: string) => `enc:${v}`,
}));
vi.mock("@/lib/platform/billing", () => ({
  orgHasFeature: async (organizationId: string) => features.get(organizationId) ?? false,
}));
vi.mock("@/lib/monitoring", () => ({ captureError: async () => undefined }));

const row = (organizationId: string, slug: string, over: Partial<Row> = {}): Row => ({
  organizationId,
  organization: { slug },
  razorpayKeyId: null,
  razorpayKeySecret: null,
  razorpayWebhookSecret: null,
  whatsappPhoneNumberId: null,
  whatsappBusinessAccountId: null,
  whatsappApiToken: null,
  whatsappTemplateName: null,
  tallySyncTokenHash: null,
  tallyHost: null,
  tallyPort: null,
  tallyCompanyName: null,
  ...over,
});

beforeEach(() => {
  rows.clear();
  features.clear();
  process.env.RAZORPAY_KEY_ID = "rzp_platform";
  process.env.RAZORPAY_KEY_SECRET = "platform_secret";
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.MSG91_AUTH_KEY;
  delete process.env.MSG91_SENDER_ID;
});

describe("Pay now — per-company Razorpay keys", () => {
  it("a company without its own keys gets no link, even when the env pair is set", async () => {
    rows.set("acme", row("acme", "acme-traders"));
    const { razorpayCredsFor } = await import("../payments/razorpay");
    expect(await razorpayCredsFor("acme")).toBeNull();
  });

  it("a company with its own keys uses them", async () => {
    rows.set("acme", row("acme", "acme-traders", { razorpayKeyId: "enc:rzp_acme", razorpayKeySecret: "enc:acme_secret" }));
    const { razorpayCredsFor } = await import("../payments/razorpay");
    expect(await razorpayCredsFor("acme")).toEqual({ keyId: "rzp_acme", keySecret: "acme_secret" });
  });

  it("half a key pair is not a key pair", async () => {
    rows.set("acme", row("acme", "acme-traders", { razorpayKeyId: "enc:rzp_acme" }));
    const { razorpayCredsFor } = await import("../payments/razorpay");
    expect(await razorpayCredsFor("acme")).toBeNull();
  });

  it("refuses to create a link without credentials and never calls Razorpay", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { getOrCreatePaymentLink } = await import("../payments/razorpay");
    const res = await getOrCreatePaymentLink({} as never, null, {
      partyId: "p", amount: 100, partyName: "X", description: "d",
    });
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("automated reminders — only on channels the company has set up", () => {
  it("nothing set up → no channels (so the cron attempts nothing)", async () => {
    rows.set("acme", row("acme", "acme-traders"));
    features.set("acme", true);
    const { configuredChannels } = await import("../messaging/send");
    expect(await configuredChannels("acme")).toEqual([]);
  });

  it("WhatsApp needs the company's number, token, template AND a plan that includes it", async () => {
    const wa = { whatsappPhoneNumberId: "123", whatsappApiToken: "enc:tok", whatsappTemplateName: "payment_reminder" };
    rows.set("acme", row("acme", "acme-traders", wa));
    const { configuredChannels } = await import("../messaging/send");
    features.set("acme", false);
    expect(await configuredChannels("acme")).toEqual([]);
    features.set("acme", true);
    expect(await configuredChannels("acme")).toEqual(["WHATSAPP"]);
    rows.set("acme", row("acme", "acme-traders", { ...wa, whatsappTemplateName: null }));
    expect(await configuredChannels("acme")).toEqual([]);
  });

  it("one company's WhatsApp set-up does not switch it on for another", async () => {
    rows.set("acme", row("acme", "acme-traders", { whatsappPhoneNumberId: "123", whatsappApiToken: "enc:tok", whatsappTemplateName: "t" }));
    rows.set("other", row("other", "other-co"));
    features.set("acme", true);
    features.set("other", true);
    const { configuredChannels } = await import("../messaging/send");
    expect(await configuredChannels("other")).toEqual([]);
  });

  it("email counts once the mail transport is set up; a customer still needs an address", async () => {
    process.env.RESEND_API_KEY = "re_x";
    process.env.EMAIL_FROM = "Syncit <no-reply@getsyncit.app>";
    rows.set("acme", row("acme", "acme-traders"));
    const { configuredChannels, partyReachableOn } = await import("../messaging/send");
    expect(await configuredChannels("acme")).toEqual(["EMAIL"]);
    expect(partyReachableOn("EMAIL", { phone: "9999900010", email: null })).toBe(false);
    expect(partyReachableOn("WHATSAPP", { phone: "9999900010", email: null })).toBe(true);
  });
});

/**
 * SY28 — create Syncit's subscription plans in Razorpay. Run once per
 * account (test, then live) and paste the printed env lines.
 *
 *   npm run billing:create-plans
 *
 * Uses RAZORPAY_PLATFORM_KEY_ID / _SECRET (Syncit's platform account).
 * Prices come from lib/plans.ts; Razorpay charges the GST-inclusive
 * amount (chargeAmountPaise) and our invoice splits GST back out.
 * Razorpay plans are immutable: after a price change, run this again
 * and swap the env ids. Existing subscribers stay on the old plan
 * until they change plan.
 */
import { PLANS, chargeAmountPaise, type BillingCycle } from "../lib/plans";

const keyId = process.env.RAZORPAY_PLATFORM_KEY_ID;
const keySecret = process.env.RAZORPAY_PLATFORM_KEY_SECRET;
if (!keyId || !keySecret) {
  console.error("Set RAZORPAY_PLATFORM_KEY_ID and RAZORPAY_PLATFORM_KEY_SECRET in .env first.");
  process.exit(1);
}
const auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

async function createPlan(name: string, cycle: BillingCycle, amountPaise: number): Promise<string> {
  const res = await fetch("https://api.razorpay.com/v1/plans", {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      period: cycle === "monthly" ? "monthly" : "yearly",
      interval: 1,
      item: {
        name: `Syncit ${name} — ${cycle}`,
        amount: amountPaise,
        currency: "INR",
        description: `Syncit ${name}, ${cycle} (incl. 18% GST)`,
      },
    }),
  });
  const data = (await res.json()) as { id?: string; error?: { description?: string } };
  if (!res.ok || !data.id) throw new Error(data.error?.description ?? `HTTP ${res.status}`);
  return data.id;
}

async function main() {
  console.log(`# Razorpay ${keyId!.startsWith("rzp_live_") ? "LIVE" : "TEST"} plans`);
  for (const plan of PLANS.filter((p) => p.selfServe)) {
    for (const cycle of ["monthly", "annual"] as const) {
      const amount = chargeAmountPaise(plan, cycle);
      if (amount === null) continue;
      const id = await createPlan(plan.name, cycle, amount);
      console.log(`RAZORPAY_PLATFORM_PLAN_${plan.id.toUpperCase()}_${cycle.toUpperCase()}="${id}"`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

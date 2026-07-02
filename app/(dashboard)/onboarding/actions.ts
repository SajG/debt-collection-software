"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";

const onboardingSchema = z.object({
  accountingTool: z.enum(["TALLY", "ZOHO", "SAP", "EXCEL", "OTHER"]),
});

type OnboardingInput = z.infer<typeof onboardingSchema>;
type ActionResult = { error: string } | never;

export async function saveOnboardingAction(
  input: OnboardingInput
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
    error: sessionError,
  } = await supabase.auth.getUser();

  if (sessionError || !user) {
    redirect("/login");
  }

  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Please select your accounting tool." };
  }

  await db.businessSettings.upsert({
    where: { profileId: user.id },
    create: {
      profileId: user.id,
      accountingTool: parsed.data.accountingTool,
      onboardingDone: true,
    },
    update: {
      accountingTool: parsed.data.accountingTool,
      onboardingDone: true,
    },
  });

  redirect("/dashboard");
}

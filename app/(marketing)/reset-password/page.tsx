import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password — Syncit" };
export const dynamic = "force-dynamic";

// Reached from the emailed reset link via /auth/callback, which has
// already exchanged the code for a session.
export default async function ResetPasswordPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login/forgot");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
        </div>
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          <ResetForm />
        </div>
      </div>
    </main>
  );
}

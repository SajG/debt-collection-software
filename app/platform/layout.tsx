import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform/admin";

// SY40 — Syncit operator console. Every page under /platform passes
// requirePlatformAdmin() here: session + PLATFORM_ADMINS + aal2, 404
// otherwise (lib/platform/admin.ts). Pages call it again themselves so
// a page is never reachable without the check.

export const dynamic = "force-dynamic";
export const metadata = { title: "Platform — Syncit", robots: { index: false, follow: false } };

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin();
  return (
    <div className="min-h-screen bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-8">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-foreground">Syncit platform</span>
          <Link href="/platform/crons" className="text-sm text-primary hover:underline">
            Scheduled jobs
          </Link>
          <Link href="/status" className="text-sm text-primary hover:underline">
            Service status
          </Link>
        </div>
        <span className="text-sm text-muted-foreground">{admin.email}</span>
      </header>
      {children}
    </div>
  );
}

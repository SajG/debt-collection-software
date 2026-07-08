"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshStatusesAction } from "./actions";

export function RefreshStatusesButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      title="Recompute overdue statuses now (runs automatically every morning)"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await refreshStatusesAction();
          router.refresh();
        })
      }
    >
      <RefreshCw size={13} className={isPending ? "animate-spin" : ""} />
      {isPending ? "Refreshing…" : "Refresh statuses"}
    </button>
  );
}

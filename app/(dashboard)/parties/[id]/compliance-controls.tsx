"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { btnSecondaryCls, inputCls } from "../../_components/ui";
import {
  setConsentAction,
  pauseOutreachAction,
  resumeOutreachAction,
} from "../actions";

export function ComplianceControls({
  partyId,
  consentStatus,
  outreachPaused,
  isAdmin,
}: {
  partyId: string;
  consentStatus: "UNKNOWN" | "OPTED_IN" | "OPTED_OUT";
  outreachPaused: boolean;
  isAdmin: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pauseReason, setPauseReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error: string } | undefined>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {consentStatus !== "OPTED_IN" && (
          <button
            type="button"
            disabled={isPending}
            className={btnSecondaryCls}
            onClick={() =>
              run(() => setConsentAction({ partyId, status: "OPTED_IN" }))
            }
          >
            Record opt-in
          </button>
        )}
        {consentStatus !== "OPTED_OUT" && (
          <button
            type="button"
            disabled={isPending}
            className={btnSecondaryCls}
            onClick={() =>
              run(() => setConsentAction({ partyId, status: "OPTED_OUT" }))
            }
          >
            Record opt-out
          </button>
        )}
        {outreachPaused ? (
          isAdmin && (
            <button
              type="button"
              disabled={isPending}
              className={btnSecondaryCls}
              onClick={() => run(() => resumeOutreachAction(partyId))}
            >
              Resume outreach
            </button>
          )
        ) : (
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="Pause reason…"
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              maxLength={300}
            />
            <button
              type="button"
              disabled={isPending}
              className={`${btnSecondaryCls} whitespace-nowrap`}
              onClick={() => run(() => pauseOutreachAction(partyId, pauseReason))}
            >
              Pause outreach
            </button>
          </div>
        )}
        {isPending && <Loader2 size={16} className="mt-2 animate-spin" />}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

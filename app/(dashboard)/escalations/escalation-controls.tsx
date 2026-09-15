"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { inputCls, btnPrimaryCls, btnSecondaryCls } from "../_components/ui";
import {
  advanceEscalation,
  resolveEscalation,
  dismissEscalation,
  addEscalationNote,
} from "./actions";

type Action = (i: { escalationId: string; note: string }) => Promise<{ error: string } | { ok: true }>;

export function EscalationControls({
  escalationId,
  stage,
  isAdmin,
}: {
  escalationId: string;
  stage: string;
  isAdmin: boolean;
}) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function run(action: Action) {
    startTransition(async () => {
      const result = await action({ escalationId, note });
      if ("error" in result) toast.error(result.error);
      else {
        toast.success("Updated");
        setNote("");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (required)"
        className={`${inputCls} max-w-xs`}
      />
      {isAdmin && stage !== "LEGAL" && (
        <button className={btnPrimaryCls} disabled={pending} onClick={() => run(advanceEscalation)}>
          Advance
        </button>
      )}
      {isAdmin && (
        <>
          <button className={btnSecondaryCls} disabled={pending} onClick={() => run(resolveEscalation)}>
            Resolve
          </button>
          <button className={btnSecondaryCls} disabled={pending} onClick={() => run(dismissEscalation)}>
            Dismiss
          </button>
        </>
      )}
      {!isAdmin && (
        <button className={btnSecondaryCls} disabled={pending} onClick={() => run(addEscalationNote)}>
          Add note
        </button>
      )}
    </div>
  );
}

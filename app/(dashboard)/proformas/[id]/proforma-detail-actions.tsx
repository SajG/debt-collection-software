"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Download, Mail, FileCheck2 } from "lucide-react";
import type { ProformaStatus } from "@prisma/client";
import { btnPrimaryCls, btnSecondaryCls } from "../../_components/ui";
import {
  transitionProformaAction,
  convertProformaAction,
  emailProformaPdfAction,
} from "../actions";

export function ProformaDetailActions({
  proformaId,
  status,
}: {
  proformaId: string;
  status: ProformaStatus;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error: string } | { ok: true } | never>, okText: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result) {
        setMessage({ kind: "error", text: result.error });
      } else {
        setMessage({ kind: "ok", text: okText });
        router.refresh();
      }
    });
  }

  const terminal = status === "CONVERTED" || status === "EXPIRED" || status === "CANCELLED";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "DRAFT" && (
          <>
            <Link href={`/proformas/${proformaId}/edit`} className={btnSecondaryCls}>
              Edit
            </Link>
            <button
              className={btnSecondaryCls}
              disabled={isPending}
              onClick={() =>
                run(() => transitionProformaAction(proformaId, "SENT"), "Marked as sent.")
              }
            >
              Mark as sent
            </button>
          </>
        )}
        {status === "SENT" && (
          <>
            <button
              className={btnPrimaryCls}
              disabled={isPending}
              onClick={() =>
                run(
                  () => transitionProformaAction(proformaId, "CONFIRMED"),
                  "Marked as confirmed."
                )
              }
            >
              <FileCheck2 size={16} /> Mark confirmed
            </button>
            <button
              className={btnSecondaryCls}
              disabled={isPending}
              onClick={() =>
                run(
                  () => transitionProformaAction(proformaId, "EXPIRED"),
                  "Marked as expired."
                )
              }
            >
              Mark expired
            </button>
          </>
        )}
        {status === "CONFIRMED" && (
          <button
            className={btnPrimaryCls}
            disabled={isPending}
            onClick={() =>
              run(() => convertProformaAction(proformaId), "Converted to invoice.")
            }
          >
            Convert to invoice
          </button>
        )}
        <a
          href={`/api/proformas/${proformaId}/pdf`}
          className={btnSecondaryCls}
          download
        >
          <Download size={16} /> Download PDF
        </a>
        {!terminal && (
          <button
            className={btnSecondaryCls}
            disabled={isPending}
            onClick={() =>
              run(() => emailProformaPdfAction(proformaId), "PDF emailed to the party.")
            }
          >
            <Mail size={16} /> Email PDF
          </button>
        )}
        {!terminal && (
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            disabled={isPending}
            onClick={() => {
              if (window.confirm("Cancel this proforma? This cannot be undone.")) {
                run(
                  () => transitionProformaAction(proformaId, "CANCELLED"),
                  "Proforma cancelled."
                );
              }
            }}
          >
            Cancel proforma
          </button>
        )}
        {isPending && <Loader2 size={16} className="mt-2 animate-spin text-muted-foreground" />}
      </div>
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-emerald-700"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import { formatDate, formatDateTime, formatINR } from "@/lib/format";
import { getPaymentDocumentSignedUrl } from "@/lib/storage";
import { PAYMENT_DOC_TYPE_LABELS } from "@/lib/payments/document-labels";
import {
  PageHeader,
  Card,
  LinkButton,
  btnSecondaryCls,
} from "../../_components/ui";
import { PaymentProofForm } from "./payment-proof-form";
import { PaymentRealtimeRefresh } from "./payment-realtime";

export const dynamic = "force-dynamic";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CHEQUE: "Cheque",
  NEFT: "NEFT",
  RTGS: "RTGS",
  UPI: "UPI",
  OTHER: "Other",
};

export default async function PaymentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();

  const payment = await db.payment.findUnique({
    where: { id: params.id },
    include: {
      party: { select: { id: true, name: true, assignedToId: true } },
      invoice: { select: { id: true, invoiceNumber: true } },
      recordedBy: { select: { ownerName: true } },
      documents: {
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { ownerName: true } } },
      },
    },
  });
  if (!payment || !canAccessParty(profile, payment.party)) notFound();

  const docsWithUrls = await Promise.all(
    payment.documents.map(async (doc) => ({
      ...doc,
      url: await getPaymentDocumentSignedUrl(doc.storagePath),
    }))
  );

  return (
    <div className="p-4 sm:p-8">
      <PaymentRealtimeRefresh paymentId={payment.id} />

      <div className="mb-4">
        <LinkButton href="/payments" variant="secondary">
          ← Payments
        </LinkButton>
      </div>

      <PageHeader
        title={formatINR(payment.amount)}
        subtitle={`${METHOD_LABELS[payment.method] ?? payment.method} · ${payment.party.name}`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Payment date
          </p>
          <p className="mt-1 font-semibold text-foreground">
            {formatDate(payment.paymentDate)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Reference
          </p>
          <p className="mt-1 font-medium text-foreground">
            {payment.reference || "—"}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Invoice
          </p>
          <p className="mt-1 font-medium">
            {payment.invoice ? (
              <Link
                href={`/invoices/${payment.invoice.id}`}
                className="text-primary hover:underline"
              >
                {payment.invoice.invoiceNumber}
              </Link>
            ) : (
              <span className="text-muted-foreground">On account</span>
            )}
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Upload payment proof">
          <p className="mb-4 text-xs text-muted-foreground">
            Snap the bank / UPI screen or the cheque. Stored securely — visible
            to accountant during bank reconciliation.
          </p>
          <PaymentProofForm paymentId={payment.id} />
        </Card>

        <Card title={`Proofs (${docsWithUrls.length})`}>
          {docsWithUrls.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No proofs uploaded yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {docsWithUrls.map((doc) => (
                <li
                  key={doc.id}
                  className="rounded-lg border border-border bg-muted/20 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">
                        {PAYMENT_DOC_TYPE_LABELS[doc.type]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(doc.createdAt)} · {doc.uploadedBy.ownerName}
                      </p>
                      {doc.notes && (
                        <p className="mt-1 text-sm text-foreground">
                          {doc.notes}
                        </p>
                      )}
                    </div>
                    {doc.url ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`${btnSecondaryCls} min-h-11`}
                      >
                        Open
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Unavailable
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

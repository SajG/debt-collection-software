import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile, canAccessParty } from "@/lib/authz";
import { formatINR, formatDate } from "@/lib/format";
import { PageHeader } from "../../../_components/ui";
import { PaymentMetaForm } from "./payment-meta-form";

export default async function EditPaymentPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();

  const payment = await db.payment.findUnique({
    where: { id: params.id },
    include: { party: { select: { assignedToId: true, name: true } } },
  });
  if (!payment || !canAccessParty(profile, payment.party)) notFound();

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title={`Edit payment — ${formatINR(payment.amount)}`}
        subtitle={`${payment.party.name} · ${formatDate(payment.paymentDate)}. Amount, date, and allocation are fixed once recorded; only method, reference, and notes can change.`}
      />
      <PaymentMetaForm
        paymentId={payment.id}
        initial={{
          method: payment.method,
          reference: payment.reference ?? "",
          notes: payment.notes ?? "",
        }}
      />
    </div>
  );
}

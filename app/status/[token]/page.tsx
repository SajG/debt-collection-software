import { db } from "@/lib/db";
import { verifyStatusToken } from "@/lib/status-link";
import { getOrderDocumentSignedUrl } from "@/lib/storage";
import { ORDER_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from "@/lib/orders/status";

// F4 — Customer-facing signed order-status page. No login. No cross-
// order navigation. No rates. No party outstanding. No other orders.
// Only: this one order's status, expected date, and any customer-
// facing documents (LR, INVOICE).
//
// Signature is timing-safe (see lib/status-link.ts). Expired tokens
// show a generic "link expired" page. Malformed tokens are treated
// the same as bad signatures so the page never leaks whether an
// orderId exists.

export const dynamic = "force-dynamic";
export const metadata = { title: "Order status — SynWorks" };

const CUSTOMER_VISIBLE_DOC_TYPES = new Set(["LORRY_RECEIPT", "INVOICE"]);

function fmt(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

function GenericError({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-xl font-semibold">Link unavailable</h1>
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </main>
  );
}

export default async function CustomerStatusPage({
  params,
}: {
  params: { token: string };
}) {
  const verified = verifyStatusToken(decodeURIComponent(params.token));
  if (!verified.ok) {
    // Same copy for bad sig / malformed / misconfigured — nothing to
    // leak. Expired gets its own message so the customer knows to ask
    // the salesperson for a fresh link.
    if (verified.reason === "expired") {
      return (
        <GenericError message="This link has expired. Please ask the salesperson for a fresh link." />
      );
    }
    return <GenericError message="This link is not valid." />;
  }

  const order = await db.salesOrder.findUnique({
    where: { id: verified.orderId },
    select: {
      orderNumber: true,
      currentStatus: true,
      quantity: true,
      quantityUnit: true,
      expectedDeliveryDate: true,
      deliveredAt: true,
      brand: true,
      product: { select: { name: true } },
      party: { select: { name: true } },
      newCustomerName: true,
      documents: {
        where: { type: { in: ["LORRY_RECEIPT", "INVOICE"] } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          storagePath: true,
          createdAt: true,
        },
      },
    },
  });
  if (!order) {
    return <GenericError message="Order not found." />;
  }

  // Sign each doc URL on the server so the customer never sees the
  // bucket path. 5-min TTL (SIGNED_URL_EXPIRY_SECONDS on lib/storage).
  const docsWithUrls = await Promise.all(
    order.documents.map(async (d) => ({
      ...d,
      url: await getOrderDocumentSignedUrl(d.storagePath),
    })),
  );

  const customerName = order.party?.name ?? order.newCustomerName ?? "—";

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-10">
      <div className="mb-8 rounded-2xl border border-border/70 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Order status
        </p>
        <h1 className="mt-1 font-mono text-2xl font-semibold text-foreground">
          {order.orderNumber}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          For {customerName}
        </p>

        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Status
            </dt>
            <dd className="mt-1 text-base font-semibold">
              {ORDER_STATUS_LABELS[order.currentStatus]}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Product
            </dt>
            <dd className="mt-1">
              {order.product?.name ?? "—"}
              {order.brand ? (
                <span className="text-muted-foreground"> · {order.brand}</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Quantity
            </dt>
            <dd className="mt-1 font-mono">
              {order.quantity.toString()} {order.quantityUnit}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Expected delivery
            </dt>
            <dd className="mt-1">{fmt(order.expectedDeliveryDate)}</dd>
          </div>
          {order.deliveredAt && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Delivered
              </dt>
              <dd className="mt-1 font-semibold text-emerald-700">
                {fmt(order.deliveredAt)}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="rounded-2xl border border-border/70 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Documents</h2>
        {docsWithUrls.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No documents attached yet. When the factory dispatches the
            order, the lorry receipt and invoice will appear here.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {docsWithUrls.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {DOCUMENT_TYPE_LABELS[d.type as keyof typeof DOCUMENT_TYPE_LABELS] ??
                      d.type}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(d.createdAt)}
                  </p>
                </div>
                {d.url ? (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    Open
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Not available
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        This page is read-only. Contact your salesperson for anything
        else.
      </p>
    </main>
  );
}

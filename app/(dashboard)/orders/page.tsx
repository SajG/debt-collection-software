import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireProfile, partyScopeWhere } from "@/lib/authz";
import { formatDate } from "@/lib/format";
import {
  PAGE_SIZES,
  parsePageParams,
  pageArgs,
  pageResult,
} from "@/lib/pagination";
import {
  PageHeader,
  LinkButton,
  Table,
  Th,
  Td,
  Badge,
  EmptyRow,
  Pagination,
  Field,
  inputCls,
  btnSecondaryCls,
} from "../_components/ui";
import { orderStatusTone } from "./order-status";

const STATUS_FILTERS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  {
    key: "open",
    label: "Open",
    statuses: [
      "ORDER_PLACED",
      "IN_PRODUCTION",
      "READY_TO_DISPATCH",
      "LR_GENERATED",
    ],
  },
  { key: "placed", label: "Placed", statuses: ["ORDER_PLACED"] },
  { key: "producing", label: "In production", statuses: ["IN_PRODUCTION"] },
  { key: "ready", label: "Ready / LR", statuses: ["READY_TO_DISPATCH", "LR_GENERATED"] },
  { key: "dispatched", label: "Dispatched", statuses: ["DISPATCHED"] },
  { key: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] },
  {
    key: "all",
    label: "All",
    statuses: [
      "ORDER_PLACED",
      "IN_PRODUCTION",
      "READY_TO_DISPATCH",
      "LR_GENERATED",
      "DISPATCHED",
      "CANCELLED",
    ],
  },
];

function parseDate(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: {
    filter?: string;
    salesperson?: string;
    from?: string;
    to?: string;
    cursor?: string;
    size?: string;
  };
}) {
  const profile = await requireProfile();
  const filter =
    STATUS_FILTERS.find((f) => f.key === searchParams.filter) ??
    STATUS_FILTERS[0];
  const page = parsePageParams(searchParams);

  const from = parseDate(searchParams.from);
  const to = parseDate(searchParams.to);
  // Inclusive end-of-day for the "to" filter — otherwise `to=2026-08-10`
  // would exclude orders placed later that same day.
  const toEnd = to ? new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1) : null;

  const salespersonFilter =
    profile.role === "STAFF"
      ? profile.id
      : searchParams.salesperson || null;

  const where: Prisma.SalesOrderWhereInput = {
    currentStatus: { in: filter.statuses },
    party: partyScopeWhere(profile),
    ...(salespersonFilter ? { salespersonId: salespersonFilter } : {}),
    ...(from || toEnd
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(toEnd ? { lte: toEnd } : {}),
          },
        }
      : {}),
  };

  const [fetched, salespeople] = await Promise.all([
    db.salesOrder.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        currentStatus: true,
        quantity: true,
        quantityUnit: true,
        expectedDeliveryDate: true,
        createdAt: true,
        party: { select: { id: true, name: true } },
        product: { select: { name: true, brand: true } },
        salesperson: { select: { id: true, ownerName: true } },
        linkedInvoiceId: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      ...pageArgs(page),
    }),
    profile.role !== "STAFF"
      ? db.profile.findMany({
          where: { role: { in: ["ADMIN", "STAFF"] } },
          select: { id: true, ownerName: true },
          orderBy: { ownerName: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const { rows: orders, hasNext, nextCursor } = pageResult(fetched, page);

  const now = new Date();

  const filtersHref = (overrides: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      filter: searchParams.filter,
      salesperson: searchParams.salesperson,
      from: searchParams.from,
      to: searchParams.to,
      size: searchParams.size,
      ...overrides,
    };
    const qs = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return qs ? `/orders?${qs}` : "/orders";
  };

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Sales orders"
        subtitle="Every booked order across the factory floor."
        action={
          profile.role !== "FACTORY" && (
            <LinkButton href="/orders/new">New order</LinkButton>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={filtersHref({ filter: f.key, cursor: undefined })}
            className={`rounded-full px-3 py-1 text-sm ${
              f.key === filter.key
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <form
        method="GET"
        action="/orders"
        className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5"
      >
        <input type="hidden" name="filter" value={filter.key} />
        {profile.role !== "STAFF" && (
          <Field label="Salesperson">
            <select
              name="salesperson"
              defaultValue={searchParams.salesperson ?? ""}
              className={inputCls}
            >
              <option value="">All</option>
              {salespeople.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ownerName}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="From">
          <input
            type="date"
            name="from"
            defaultValue={searchParams.from ?? ""}
            className={inputCls}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            name="to"
            defaultValue={searchParams.to ?? ""}
            className={inputCls}
          />
        </Field>
        <div className="flex items-end gap-2">
          <button type="submit" className={btnSecondaryCls}>
            Apply
          </button>
          <Link
            href={filtersHref({
              salesperson: undefined,
              from: undefined,
              to: undefined,
              cursor: undefined,
            })}
            className={btnSecondaryCls}
          >
            Clear
          </Link>
        </div>
      </form>

      <Table>
        <thead>
          <tr>
            <Th>Order #</Th>
            <Th>Party</Th>
            <Th>Product</Th>
            <Th align="right">Qty</Th>
            <Th>Salesperson</Th>
            <Th>Expected</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 ? (
            <EmptyRow colSpan={7} message="No orders in this view." />
          ) : (
            orders.map((o) => {
              const overdue =
                o.expectedDeliveryDate &&
                differenceInCalendarDays(o.expectedDeliveryDate, now) < 0 &&
                o.currentStatus !== "DISPATCHED" &&
                o.currentStatus !== "CANCELLED";
              return (
                <tr key={o.id} className="hover:bg-muted/30">
                  <Td>
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-medium hover:underline"
                    >
                      {o.orderNumber}
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/parties/${o.party.id}`}
                      className="hover:underline"
                    >
                      {o.party.name}
                    </Link>
                  </Td>
                  <Td>
                    {o.product.name}
                    {o.product.brand ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {o.product.brand}
                      </span>
                    ) : null}
                  </Td>
                  <Td align="right">
                    {o.quantity.toString()} {o.quantityUnit}
                  </Td>
                  <Td>{o.salesperson.ownerName}</Td>
                  <Td>
                    {o.expectedDeliveryDate
                      ? formatDate(o.expectedDeliveryDate)
                      : "—"}
                    {overdue && (
                      <span className="ml-2 text-xs text-red-600">overdue</span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={orderStatusTone(o.currentStatus)}>
                      {o.currentStatus.replace(/_/g, " ")}
                    </Badge>
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>

      <Pagination
        pathname="/orders"
        params={{
          filter: searchParams.filter,
          salesperson: searchParams.salesperson,
          from: searchParams.from,
          to: searchParams.to,
          size: searchParams.size,
        }}
        pageSize={page.size}
        pageSizes={PAGE_SIZES}
        hasNext={hasNext}
        nextCursor={nextCursor}
        onFirstPage={!page.cursor}
      />
    </div>
  );
}

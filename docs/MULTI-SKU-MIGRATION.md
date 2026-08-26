# Multi-SKU migration — deprecated-scalar reader checklist

## Background

Migration `20260824180000_add_sales_order_items` introduced `SalesOrderItem`.
Every SKU now lives on its own row; `SalesOrder` still carries the pre-split
scalar columns (`productId`, `brand`, `quantity`, `quantityUnit`, `packingType`,
`sizeKg`, `productRate`, `orderValue`) so nothing broke on day one. A trigger
keeps those scalars mirrored to line 1 and rolls `SUM(items.lineValue)` into
`orderValue`.

**These scalar columns are deprecated.** They will be dropped once every reader
below is migrated to `SalesOrder.items[]`. Dropping them earlier would break the
listed readers.

## RPC status

| RPC | Status | Notes |
| --- | --- | --- |
| `create_sales_order` (v1) | KEEP | Current mobile build calls this. Leave it wired to line-1-only until the mobile order wizard is updated. |
| `create_sales_order_v2` | NEW | Multi-line, `(p_header jsonb, p_items jsonb)`. Preserves every gate in v1 (auth, rate limit, party ownership, floor rate per-line, credit vs SUM, ADMIN self-approve). Migration `20260824181000_create_sales_order_v2`. |
| `_rollup_sales_order_from_items` | NEW (internal trigger) | Do not call directly. |

## Readers still using deprecated scalars

Each entry lists the file, the scalar it reads, and the migration action.

### Web console

- `app/(dashboard)/orders/page.tsx` — list view. **Migrated in this pass** to
  show first-line + "+N more" hint using `items[]`; still falls back to
  `order.product` when `items` is empty (shouldn't happen post-backfill).
- `app/(dashboard)/orders/[id]/page.tsx` — detail view. **Migrated in this
  pass** — full line-item table rendered from `items[]`. The old
  "Product/Quantity" cards were removed; Packing/Size/Rate were dropped from
  the "Order details" card (they now live in the table). No longer reads
  `order.product`, `order.brand`, `order.quantity`, `order.packingType`,
  `order.sizeKg`, `order.productRate`.
- `app/(dashboard)/production/page.tsx` — factory queue. **Migrated in this
  pass** — shows "+N more" and "N lines" for multi-line orders. Still shows
  `order.product.brand · name` for single-line orders (through the deprecated
  scalars) as a convenience. To fully migrate: read `items[0]`.
- `app/(dashboard)/production/[id]/page.tsx` — factory detail. **Migrated in
  this pass** — full line-item table. No longer references
  `order.quantity`/`order.product`/`order.packingType`/`order.sizeKg`/
  `order.productRate`.
- `app/(dashboard)/production/actions.ts` — the edit-order action still reads
  and writes `order.quantity`, `order.productRate`, `order.orderValue`
  directly (see the `editOrderAction` block). **NOT migrated.** Editing a
  multi-line order via this form silently only edits line 1 (via the trigger
  mirror) and re-derives `orderValue` from that line, clobbering the SUM. This
  is safe today because the form is single-line-only, but must be reworked
  into a per-line editor before the scalars are dropped.
- `app/(dashboard)/orders/[id]/edit-order-form.tsx` — same story: single-line
  form. **NOT migrated.**
- `app/(dashboard)/admin/approvals/page.tsx`, `admin/slipping/page.tsx`,
  `admin/new-customer-names/page.tsx`, `dashboard/page.tsx`,
  `production/planning/page.tsx` — read `salesOrder` rows via aggregations
  (`_sum: { orderValue: true }`) or group-bys. These are correct as long as
  `orderValue` = SUM(lineValue), which the rollup trigger guarantees. Safe.
- `app/status/[token]/page.tsx` — public status page still shows a single
  product/quantity summary from the deprecated scalars. **NOT migrated.**
  Multi-line orders will present as their line-1 SKU to the customer.

### Mobile app

- `mobile/src/lib/queries.ts` — `OrderListRow` and `OrderDetail` still describe
  a single product/quantity via the deprecated scalars. **NOT migrated.**
  Multi-line orders on mobile show line 1 with no indication there are more
  lines. Rework needed:
  - Extend the types to include `items: SalesOrderItem[]`.
  - Update the order wizard to submit through `create_sales_order_v2`.
  - Update order card + detail renderers to show line count / line list.
- `mobile/app/(factory)/orders/[id].tsx`, `mobile/app/(staff)/orders/[id].tsx`
  — read `data.product`, `data.quantity`, etc. **NOT migrated.**
- `mobile/app/(staff)/orders/new/*` — the whole wizard is single-line and
  calls `create_sales_order` (v1). **NOT migrated.**

### Tally connector

- `tools/tally-connector/src/` — does not currently read `SalesOrder`
  scalars (payment/receipt/party sync only). Safe. No action needed for the
  scalar drop.

### PDF routes

- `app/api/invoices/[id]/pdf` and `app/api/proformas/[id]/pdf` — build from
  `Invoice` and `ProformaInvoice` respectively, which have their own line-item
  models (`ProformaLineItem`; invoices carry a total). Neither reads
  `SalesOrder` scalars. Safe.

## Deprecation drop plan (future PR)

1. Migrate `production/actions.ts` and `orders/[id]/edit-order-form.tsx` to a
   per-line editor.
2. Migrate `app/status/[token]/page.tsx` to list every line.
3. Migrate the mobile order wizard to `create_sales_order_v2` and update
   `queries.ts`/renderers/`OrderCard` for `items[]`.
4. Grep for the field names below; any hit must be gone.
   ```
   SalesOrder\.productId | SalesOrder\.brand | SalesOrder\.quantity
   SalesOrder\.quantityUnit | SalesOrder\.packingType | SalesOrder\.sizeKg
   SalesOrder\.productRate | SalesOrder\.orderValue
   order\.product\. (except order.product.name if reintroduced via items[0])
   ```
5. Drop the trigger `trg_rollup_sales_order_items_iud` and its function.
6. Drop columns from `SalesOrder`. Delete the `product` relation.
7. Delete v1 `create_sales_order` (unused after mobile switchover).

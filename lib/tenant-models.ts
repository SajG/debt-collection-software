// SY22 — Prisma client model keys for every tenant-scoped table.
//
// Split out from lib/tenant.ts so the isolation Vitest can import
// the list without pulling next/navigation + the Supabase server
// client (which need a Next.js runtime and break `vitest run`).
//
// When adding a new business table with organizationId:
//   1. Add its Prisma-client model key (camelCase) here.
//   2. Confirm the SY21 ADD COLUMN loop and SY22 tenant-policy loop
//      both list it (the tests below assert that).

export const TENANT_MODELS = [
  "party",
  "invoice",
  "payment",
  "paymentDocument",
  "action",
  "proformaInvoice",
  "proformaLineItem",
  "creditNote",
  "syncLog",
  "message",
  "paymentLink",
  "accountingConnection",
  "product",
  "salesOrder",
  "salesOrderItem",
  "orderStatusEvent",
  "dispatchLot",
  "orderComment",
  "orderDocument",
  "stockItem",
  "staleOrderNotice",
  "escalation",
  "escalationEvent",
  "recommendation",
  "recoveryTarget",
  "userAuditLog",
  "notificationConfig",
  "businessSettings",
  "orgNumberSequence",
] as const;

export type TenantModel = (typeof TENANT_MODELS)[number];
export const TENANT_MODEL_SET = new Set<string>(TENANT_MODELS);

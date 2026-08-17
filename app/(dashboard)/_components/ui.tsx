import Link from "next/link";

// Shared styling + tiny layout primitives for dashboard pages.
// Server-safe: no hooks, usable from server and client components.

export const inputCls =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-60";

export const btnPrimaryCls =
  "inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity";

export const btnSecondaryCls =
  "inline-flex items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      className={variant === "primary" ? btnPrimaryCls : btnSecondaryCls}
    >
      {children}
    </Link>
  );
}

export type BadgeTone = "neutral" | "success" | "amber" | "danger" | "info";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  info: "bg-sky-50 text-sky-700",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({
  title,
  children,
  action,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-card p-6 shadow-sm${className ? ` ${className}` : ""}`}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && (
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-2.5 sm:px-4 sm:py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground ${align === "right" ? "text-right" : "text-left"} border-b border-border bg-muted/40`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`px-3 py-2.5 sm:px-4 sm:py-3 ${align === "right" ? "text-right" : "text-left"} border-b border-border/60 align-top`}
    >
      {children}
    </td>
  );
}

export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-12 text-center text-sm text-muted-foreground"
      >
        {message}
      </td>
    </tr>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Cursor-pagination footer for list pages. `params` carries filters (q,
 * filter, …) to preserve across page moves; page-size changes restart
 * from the first page.
 */
export function Pagination({
  pathname,
  params,
  pageSize,
  pageSizes,
  hasNext,
  nextCursor,
  onFirstPage,
}: {
  pathname: string;
  params: Record<string, string | undefined>;
  pageSize: number;
  pageSizes: readonly number[];
  hasNext: boolean;
  nextCursor: string | null;
  onFirstPage: boolean;
}) {
  const href = (overrides: Record<string, string | undefined>) => {
    const merged = { ...params, ...overrides };
    const qs = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return qs ? `${pathname}?${qs}` : pathname;
  };

  if (onFirstPage && !hasNext) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-xs">Rows per page:</span>
        {pageSizes.map((s) => (
          <Link
            key={s}
            href={href({ size: String(s), cursor: undefined })}
            className={
              s === pageSize
                ? "font-semibold text-foreground"
                : "hover:text-foreground"
            }
          >
            {s}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-3">
        {!onFirstPage && (
          <Link
            href={href({ cursor: undefined })}
            className="text-primary hover:underline"
          >
            ← First page
          </Link>
        )}
        {hasNext && nextCursor && (
          <Link
            href={href({ cursor: nextCursor })}
            className="text-primary hover:underline"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}

/** Suspense-fallback skeleton matching PageHeader + Table. */
export function PageSkeleton({
  rows = 8,
  cols = 5,
  statCards = 0,
}: {
  rows?: number;
  cols?: number;
  statCards?: number;
}) {
  return (
    <div className="p-4 sm:p-8 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-6">
        <div className="h-7 w-48 rounded bg-muted" />
        <div className="mt-2 h-4 w-72 rounded bg-muted/70" />
      </div>
      {statCards > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: statCards }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl border border-border bg-card" />
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="h-10 border-b border-border bg-muted/40" />
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="flex gap-4 border-b border-border/60 px-4 py-3.5"
          >
            {Array.from({ length: cols }).map((_, c) => (
              <div
                key={c}
                className="h-4 flex-1 rounded bg-muted/70"
                style={{ maxWidth: c === 0 ? 180 : 120 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "PAID":
    case "OPTED_IN":
    case "COMPLETED":
    case "DELIVERED":
    case "READ":
    case "SENT":
    case "DISPATCHED":
      return "success";
    case "OVERDUE":
    case "CRITICAL":
    case "HIGH":
    case "OPTED_OUT":
    case "FAILED":
    case "BLOCKED":
    case "DISPUTED":
    case "CANCELLED":
      return "danger";
    case "PARTIAL":
    case "MEDIUM":
    case "QUEUED":
    case "IN_PRODUCTION":
    case "READY_TO_DISPATCH":
    case "LR_GENERATED":
      return "amber";
    case "UNPAID":
    case "LOW":
    case "ORDER_PLACED":
      return "info";
    default:
      return "neutral";
  }
}

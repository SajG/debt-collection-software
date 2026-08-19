import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Card } from "../../_components/ui";
import { CreateUserForm } from "./create-user-form";
import { UserRowActions } from "./user-row-actions";

export const dynamic = "force-dynamic";

type SearchParams = { role?: string; status?: string };

const ROLES: Role[] = ["ADMIN", "STAFF", "FACTORY"];

function timeAgo(d: Date | null | undefined): string {
  if (!d) return "never";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export default async function UsersAdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") redirect("/dashboard");

  const roleFilter = ROLES.includes(searchParams.role as Role)
    ? (searchParams.role as Role)
    : null;
  const statusFilter =
    searchParams.status === "active"
      ? true
      : searchParams.status === "inactive"
        ? false
        : null;

  const profiles = await db.profile.findMany({
    where: {
      ...(roleFilter ? { role: roleFilter } : {}),
      ...(statusFilter !== null ? { isActive: statusFilter } : {}),
    },
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { ownerName: "asc" }],
    select: {
      id: true,
      ownerName: true,
      phone: true,
      role: true,
      isActive: true,
      deactivatedAt: true,
      createdAt: true,
      _count: { select: { salesOrders: true } },
    },
  });

  // Last-sign-in from Supabase Auth. Uses service-role admin API; per
  // 50-user list this is one round-trip.
  const supabase = createAdminClient();
  const { data: authList } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  const lastSignIn = new Map<string, Date | null>();
  for (const u of authList?.users ?? []) {
    lastSignIn.set(u.id, u.last_sign_in_at ? new Date(u.last_sign_in_at) : null);
  }

  const activeAdminCount = profiles.filter(
    (p) => p.role === "ADMIN" && p.isActive,
  ).length;

  // Only "is it wired?" — the shared secret itself is unreadable from
  // any authenticated JWT after migration
  // 20260821180000_security_hardening.
  const notifyStatus = await db.$queryRaw<{ ready: boolean }[]>`
    SELECT public.is_notification_config_ready() AS ready`;
  const notifyReady = notifyStatus[0]?.ready ?? false;

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Users"
        subtitle="Everyone who can sign in. Deactivation locks them out at the DB (RLS) and clears their push tokens. Data is never deleted."
      />

      <Card title="Add user" className="mb-6">
        <CreateUserForm />
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Filter:</span>
        <FilterLink label="All roles" href="/admin/users" active={!roleFilter} />
        {ROLES.map((r) => (
          <FilterLink
            key={r}
            label={r}
            href={`/admin/users?role=${r}`}
            active={roleFilter === r}
          />
        ))}
        <span className="mx-2 text-muted-foreground">·</span>
        <FilterLink
          label="Any status"
          href={roleFilter ? `/admin/users?role=${roleFilter}` : "/admin/users"}
          active={statusFilter === null}
        />
        <FilterLink
          label="Active"
          href={`/admin/users?status=active${roleFilter ? `&role=${roleFilter}` : ""}`}
          active={statusFilter === true}
        />
        <FilterLink
          label="Inactive"
          href={`/admin/users?status=inactive${roleFilter ? `&role=${roleFilter}` : ""}`}
          active={statusFilter === false}
        />
      </div>

      <Card title={`Users · ${profiles.length}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Phone</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Last login</th>
                <th className="py-2 pr-3 text-right">Orders</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr
                  key={p.id}
                  className={p.isActive ? "border-b" : "border-b bg-slate-50/60"}
                >
                  <td className="py-2 pr-3">
                    <div className="font-medium">{p.ownerName}</div>
                    {p.id === profile.id ? (
                      <div className="text-xs text-muted-foreground">
                        (you)
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 font-mono">+91 {p.phone ?? "—"}</td>
                  <td className="py-2 pr-3">{p.role}</td>
                  <td className="py-2 pr-3">
                    {p.isActive ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {timeAgo(lastSignIn.get(p.id) ?? null)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums">
                    {p._count.salesOrders}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {p.id === profile.id ? (
                      <span className="text-xs text-muted-foreground">
                        own account
                      </span>
                    ) : (
                      <UserRowActions
                        profile={{
                          id: p.id,
                          ownerName: p.ownerName,
                          role: p.role,
                          isActive: p.isActive,
                        }}
                      />
                    )}
                  </td>
                </tr>
              ))}
              {profiles.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">
                    No users match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        {activeAdminCount} active ADMIN{activeAdminCount === 1 ? "" : "s"}.
        Both the server actions and a BEFORE-UPDATE trigger on Profile
        refuse to leave the system without at least one — promote
        someone else before demoting or deactivating the last one.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Push-notification pipeline:{" "}
        {notifyReady ? (
          <span className="font-semibold text-emerald-700">configured</span>
        ) : (
          <span className="font-semibold text-red-700">not configured</span>
        )}
        . The shared secret is not readable from this UI by design —
        rotate via <code className="rounded bg-muted px-1 py-0.5">supabase secrets set NOTIFY_SHARED_SECRET</code>{" "}
        and then update the DB row with an equivalent value.
      </p>
    </div>
  );
}

function FilterLink({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <a
      href={href}
      className={
        active
          ? "rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
          : "rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted"
      }
    >
      {label}
    </a>
  );
}

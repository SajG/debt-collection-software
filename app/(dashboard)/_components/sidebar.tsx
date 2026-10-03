"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Phone,
  ClipboardList,
  ListOrdered,
  Upload,
  Settings,
  LogOut,
  Factory,
  PackageSearch,
  Truck,
  Target,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import type { Role } from "@prisma/client";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[]; // if set, only these roles see the link
};

type NavGroup = {
  id: "sell" | "get-paid" | "make" | "company";
  title: string;
  items: NavItem[];
};

// SY25 — sidebar regrouped into what people are trying to do:
//   Sell (Sales/Management)      → Orders, Customers
//   Get paid (Sales/Management)  → Outstanding, Follow-ups, Payments, Invoices
//   Make (Factory/Management)    → Production, Stock
//   Company (Management)         → Team, Products, Settings, Billing
// A whole group hides when the role has nothing in it, so a
// Sales-only user never sees the "Make" or "Company" headers.
// Tally-only surfaces (Reconciliation) drop out when the tenant
// hasn't enabled Tally — same filter as before.

const DASHBOARD_ITEM: NavItem = {
  href: "/dashboard",
  label: "Dashboard",
  icon: LayoutDashboard,
  roles: ["ADMIN", "STAFF"],
};

const GROUPS: NavGroup[] = [
  {
    id: "sell",
    title: "Sell",
    items: [
      { href: "/orders", label: "Orders", icon: Truck, roles: ["ADMIN", "STAFF"] },
      { href: "/parties", label: "Customers", icon: Users, roles: ["ADMIN", "STAFF"] },
      {
        href: "/proformas",
        label: "Proformas",
        icon: ClipboardList,
        roles: ["ADMIN", "STAFF"],
      },
    ],
  },
  {
    id: "get-paid",
    title: "Get paid",
    items: [
      {
        href: "/worklist",
        label: "Outstanding",
        icon: ListOrdered,
        roles: ["ADMIN", "STAFF"],
      },
      {
        href: "/actions",
        label: "Follow-ups",
        icon: Phone,
        roles: ["ADMIN", "STAFF"],
      },
      {
        href: "/payments",
        label: "Payments",
        icon: CreditCard,
        roles: ["ADMIN", "STAFF"],
      },
      {
        href: "/invoices",
        label: "Invoices",
        icon: FileText,
        roles: ["ADMIN", "STAFF"],
      },
      {
        href: "/recovery",
        label: "Recovery",
        icon: TrendingUp,
        roles: ["ADMIN", "STAFF"],
      },
      {
        href: "/escalations",
        label: "Escalations",
        icon: AlertTriangle,
        roles: ["ADMIN", "STAFF"],
      },
      {
        href: "/targets",
        label: "Targets",
        icon: Target,
        roles: ["ADMIN", "STAFF"],
      },
    ],
  },
  {
    id: "make",
    title: "Make",
    items: [
      { href: "/production", label: "Production", icon: Factory, roles: ["ADMIN", "FACTORY"] },
      {
        href: "/production/planning",
        label: "Planning",
        icon: Factory,
        roles: ["ADMIN", "FACTORY"],
      },
      {
        href: "/stock",
        label: "Stock",
        icon: PackageSearch,
        roles: ["ADMIN", "STAFF", "FACTORY"],
      },
      {
        href: "/admin/approvals",
        label: "Approvals",
        icon: ClipboardList,
        roles: ["ADMIN"],
      },
    ],
  },
  {
    id: "company",
    title: "Company",
    items: [
      { href: "/admin/users", label: "Team", icon: Users, roles: ["ADMIN"] },
      { href: "/admin/devices", label: "Devices", icon: PackageSearch, roles: ["ADMIN"] },
      { href: "/admin/products", label: "Products", icon: PackageSearch, roles: ["ADMIN"] },
      { href: "/admin/unassigned", label: "Unassigned", icon: PackageSearch, roles: ["ADMIN"] },
      {
        href: "/admin/new-customer-names",
        label: "New-customer names",
        icon: PackageSearch,
        roles: ["ADMIN"],
      },
      { href: "/admin/analytics", label: "Analytics", icon: TrendingUp, roles: ["ADMIN"] },
      {
        href: "/admin/reconciliation",
        label: "Reconciliation",
        icon: PackageSearch,
        roles: ["ADMIN"],
      },
      { href: "/admin/slipping", label: "Slipping", icon: AlertTriangle, roles: ["ADMIN"] },
      { href: "/import", label: "Import", icon: Upload, roles: ["ADMIN"] },
      { href: "/settings", label: "Settings", icon: Settings, roles: ["ADMIN"] },
      { href: "/settings/billing", label: "Billing", icon: CreditCard, roles: ["ADMIN"] },
      {
        href: "/settings/security",
        label: "Security",
        icon: Settings,
        roles: ["ADMIN", "STAFF", "FACTORY"],
      },
    ],
  },
];

const DARK = "#093D30";

import { CompanySwitcher, type SwitcherOrg } from "./company-switcher";

function NavLink({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const { href, label, icon: Icon } = item;
  const active =
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      className={[
        "flex items-center justify-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors mb-0.5 md:justify-start",
        active
          ? "bg-white/15 text-white"
          : "text-white/55 hover:bg-white/10 hover:text-white/85",
      ].join(" ")}
      title={label}
    >
      <Icon size={16} strokeWidth={1.75} />
      <span className="hidden md:inline">{label}</span>
    </Link>
  );
}

export function Sidebar({
  businessName,
  ownerName,
  role,
  tallyEnabled,
  activeOrg,
  memberships,
}: {
  businessName: string;
  ownerName: string;
  role: Role;
  tallyEnabled: boolean;
  activeOrg?: SwitcherOrg;
  memberships?: SwitcherOrg[];
}) {
  const pathname = usePathname();


  const initials = ownerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Hide Tally-only surfaces (reconciliation) when Tally is deferred.
  // The reconciliation page itself also short-circuits — this just
  // avoids a dead link in the nav.
  const TALLY_ONLY = new Set<string>(["/admin/reconciliation"]);
  const canSee = (item: NavItem) =>
    (!item.roles || item.roles.includes(role)) &&
    (tallyEnabled || !TALLY_ONLY.has(item.href));
  const dashboardVisible = canSee(DASHBOARD_ITEM);
  const visibleGroups = GROUPS
    .map((g) => ({ ...g, items: g.items.filter(canSee) }))
    .filter((g) => g.items.length > 0);

  return (
    // Icon-only rail below md so phone users keep their screen width.
    <aside
      className="flex h-screen w-14 shrink-0 flex-col md:w-56"
      style={{ backgroundColor: DARK }}
    >
      {/* Brand */}
      <div className="flex h-14 items-center justify-center border-b border-white/10 md:justify-start md:px-5">
        <span className="text-lg font-bold tracking-tight text-white font-display">
          <span className="md:hidden">P</span>
          <span className="hidden md:inline">Syncit</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5">
        {dashboardVisible && (
          <NavLink item={DASHBOARD_ITEM} pathname={pathname} />
        )}
        {visibleGroups.map((group) => (
          <div key={group.id} className="mt-3">
            <div className="mb-1 hidden px-3 text-[10px] font-semibold uppercase tracking-widest text-white/40 md:block">
              {group.title}
            </div>
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        ))}
      </nav>

      {/* User footer omitted-comment-anchor */}
      <div className="border-t border-white/10 p-2.5">
        <div className="flex flex-col items-center gap-2 rounded-md px-1 py-2.5 md:flex-row md:gap-3 md:px-3">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            title={`${ownerName} — ${businessName}`}
          >
            {initials}
          </div>
          <div className="hidden min-w-0 flex-1 md:block">
            <p className="truncate text-xs font-medium text-white/90">
              {ownerName}
            </p>
            {activeOrg && memberships && memberships.length > 1 ? (
              <div className="mt-1">
                <CompanySwitcher active={activeOrg} memberships={memberships} />
              </div>
            ) : (
              <p className="truncate text-xs text-white/50">{businessName}</p>
            )}
          </div>
          <form action="/auth/signout" method="post" className="shrink-0">
            <button
              type="submit"
              className="text-white/35 hover:text-white/75 transition-colors"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

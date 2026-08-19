"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
} from "lucide-react";
import type { Role } from "@prisma/client";
import { createClient } from "@/lib/supabase/client";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[]; // if set, only these roles see the link
};

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["ADMIN", "STAFF"],
  },
  {
    href: "/production",
    label: "Production",
    icon: Factory,
    roles: ["ADMIN", "FACTORY"],
  },
  {
    href: "/orders",
    label: "Orders",
    icon: Truck,
    roles: ["ADMIN", "STAFF"],
  },
  {
    href: "/stock",
    label: "Stock",
    icon: PackageSearch,
  },
  {
    href: "/worklist",
    label: "Worklist",
    icon: ListOrdered,
    roles: ["ADMIN", "STAFF"],
  },
  { href: "/parties", label: "Parties", icon: Users, roles: ["ADMIN", "STAFF"] },
  {
    href: "/invoices",
    label: "Invoices",
    icon: FileText,
    roles: ["ADMIN", "STAFF"],
  },
  {
    href: "/payments",
    label: "Payments",
    icon: CreditCard,
    roles: ["ADMIN", "STAFF"],
  },
  {
    href: "/actions",
    label: "Follow-ups",
    icon: Phone,
    roles: ["ADMIN", "STAFF"],
  },
  {
    href: "/proformas",
    label: "Proformas",
    icon: ClipboardList,
    roles: ["ADMIN", "STAFF"],
  },
  { href: "/import", label: "Import", icon: Upload, roles: ["ADMIN"] },
  {
    href: "/admin/products",
    label: "Products",
    icon: PackageSearch,
    roles: ["ADMIN"],
  },
  {
    href: "/admin/reconciliation",
    label: "Reconciliation",
    icon: PackageSearch,
    roles: ["ADMIN"],
  },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["ADMIN"] },
];

const DARK = "#093D30";

export function Sidebar({
  businessName,
  ownerName,
  role,
}: {
  businessName: string;
  ownerName: string;
  role: Role;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const initials = ownerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const visibleNav = NAV.filter(
    (item) => !item.roles || item.roles.includes(role)
  );

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
          <span className="hidden md:inline">PayTrack</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5">
        {visibleNav.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
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
        })}
      </nav>

      {/* User footer */}
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
            <p className="truncate text-xs text-white/50">{businessName}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="shrink-0 text-white/35 hover:text-white/75 transition-colors"
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

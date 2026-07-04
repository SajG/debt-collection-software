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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/worklist", label: "Worklist", icon: ListOrdered },
  { href: "/parties", label: "Parties", icon: Users },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/actions", label: "Follow-ups", icon: Phone },
  { href: "/proformas", label: "Proformas", icon: ClipboardList },
  { href: "/import", label: "Import", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
];

const DARK = "#093D30";

export function Sidebar({
  businessName,
  ownerName,
}: {
  businessName: string;
  ownerName: string;
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

  return (
    <aside
      className="flex h-screen w-56 shrink-0 flex-col"
      style={{ backgroundColor: DARK }}
    >
      {/* Brand */}
      <div className="flex h-14 items-center px-5 border-b border-white/10">
        <span className="text-lg font-bold tracking-tight text-white font-display">
          PayTrack
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={[
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors mb-0.5",
                active
                  ? "bg-white/15 text-white"
                  : "text-white/55 hover:bg-white/10 hover:text-white/85",
              ].join(" ")}
            >
              <Icon size={16} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-white/10 p-2.5">
        <div className="flex items-center gap-3 rounded-md px-3 py-2.5">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
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

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { AlertTriangle, Clock, IndianRupee, Users } from "lucide-react";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [settings, profile] = await Promise.all([
    db.businessSettings.findUnique({
      where: { profileId: user.id },
      select: { onboardingDone: true },
    }),
    db.profile.findUnique({
      where: { id: user.id },
      select: { ownerName: true },
    }),
  ]);

  if (!settings?.onboardingDone) redirect("/onboarding");

  const firstName = profile?.ownerName?.split(" ")[0] ?? "there";

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Good morning, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s your accounts receivable summary for today.
        </p>
      </div>

      {/* Stat cards — placeholder values until data layer is built */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-8">
        <StatCard
          label="Total outstanding"
          value="₹0"
          icon={IndianRupee}
          accent="primary"
        />
        <StatCard
          label="Overdue parties"
          value="0"
          icon={AlertTriangle}
          accent="danger"
        />
        <StatCard
          label="Due this week"
          value="₹0"
          icon={Clock}
          accent="amber"
        />
        <StatCard
          label="Active parties"
          value="0"
          icon={Users}
          accent="neutral"
        />
      </div>

      {/* Placeholder panels */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PlaceholderPanel title="Overdue invoices" />
        <PlaceholderPanel title="Today's follow-ups" />
      </div>
    </div>
  );
}

type Accent = "primary" | "danger" | "amber" | "neutral";

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  accent: Accent;
}) {
  const iconStyles: Record<Accent, string> = {
    primary: "bg-primary/10 text-primary",
    danger: "bg-destructive/10 text-destructive",
    amber: "bg-accent/10 text-accent",
    neutral: "bg-muted text-muted-foreground",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
        </div>
        <div className={`rounded-lg p-2 ${iconStyles[accent]}`}>
          <Icon size={18} strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}

function PlaceholderPanel({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground mb-4">{title}</h2>
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <p className="text-sm text-muted-foreground">
          Data will appear here once parties and invoices are added.
        </p>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireProfile } from "@/lib/authz";
import { PageHeader, Card } from "../../_components/ui";
import { DeviceRowActions } from "./device-row-actions";

export const dynamic = "force-dynamic";

function timeAgo(d: Date | null | undefined): string {
  if (!d) return "never";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default async function DevicesAdminPage() {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") redirect("/dashboard");

  // Include revoked so admins have a full audit view; the UI groups
  // active first, then revoked. No pagination — we expect <100 rows
  // in the lifetime of one distributor.
  const devices = await db.device.findMany({
    orderBy: [{ revokedAt: "asc" }, { lastSeenAt: "desc" }],
    include: {
      profile: {
        select: { id: true, ownerName: true, role: true, phone: true },
      },
      revokedBy: { select: { ownerName: true } },
    },
  });

  // Group by profile. Person with the most recently active device
  // floats up; revoked-only people sink.
  const byProfile = new Map<
    string,
    {
      profile: (typeof devices)[number]["profile"];
      active: typeof devices;
      revoked: typeof devices;
      lastActive: Date | null;
    }
  >();
  for (const d of devices) {
    const key = d.profile.id;
    let g = byProfile.get(key);
    if (!g) {
      g = {
        profile: d.profile,
        active: [],
        revoked: [],
        lastActive: null,
      };
      byProfile.set(key, g);
    }
    if (d.revokedAt) g.revoked.push(d);
    else {
      g.active.push(d);
      if (!g.lastActive || d.lastSeenAt > g.lastActive)
        g.lastActive = d.lastSeenAt;
    }
  }
  const groups = Array.from(byProfile.values()).sort((a, b) => {
    const av = a.lastActive?.getTime() ?? 0;
    const bv = b.lastActive?.getTime() ?? 0;
    return bv - av;
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader
        title="Devices"
        subtitle="Every enrolled device, grouped by user. Revoking a device signs the owner out on all their sessions immediately."
      />

      {groups.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            No devices have been enrolled yet. Issue an enrollment code from
            the Users page.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.profile.id}>
              <div className="mb-3 flex items-baseline justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    {g.profile.ownerName}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {g.profile.role} · {g.profile.phone ?? "no phone"}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {g.active.length} active · {g.revoked.length} revoked
                </p>
              </div>
              <ul className="divide-y divide-border">
                {g.active.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {d.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {d.platform}
                        {d.osVersion ? ` ${d.osVersion}` : ""}
                        {d.appVersion ? ` · app ${d.appVersion}` : ""} · last
                        seen {timeAgo(d.lastSeenAt)}
                      </p>
                    </div>
                    <DeviceRowActions
                      deviceId={d.id}
                      ownerName={g.profile.ownerName}
                      label={d.label}
                    />
                  </li>
                ))}
                {g.revoked.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between py-2 opacity-60"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground line-through">
                        {d.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Revoked {timeAgo(d.revokedAt)}
                        {d.revokedBy?.ownerName
                          ? ` by ${d.revokedBy.ownerName}`
                          : ""}
                      </p>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-red-700">
                      Revoked
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { requireProfile } from "@/lib/authz";
import { tenantDb } from "@/lib/tenant";
import { formatINR } from "@/lib/format";
import { istMonthKey, istMonthWindow, pace } from "@/lib/recovery/targets";
import { PageHeader } from "../_components/ui";
import { TargetForm } from "./target-form";

export const dynamic = "force-dynamic";

export default async function TargetsPage() {
  const profile = await requireProfile();
  const db = tenantDb(profile.organizationId);
  const isAdmin = profile.role === "ADMIN";
  const now = new Date();
  const monthKey = istMonthKey(now);
  const { start, end } = istMonthWindow(monthKey);

  const staff = isAdmin ? await db.profile.findMany() : [profile];
  const targets = await db.recoveryTarget.findMany({
    where: { month: monthKey, userId: { in: staff.map((s) => s.id) } },
  });

  const rows = await Promise.all(
    staff.map(async (s) => {
      const target = targets.find((t) => t.userId === s.id);
      const collected = await db.payment.aggregate({
        _sum: { amount: true },
        where: {
          paymentDate: { gte: start, lt: end },
          party: { assignedToId: s.id },
        },
      });
      const collectedNum = Number(collected._sum.amount ?? 0);
      const targetNum = target ? Number(target.targetAmount) : 0;
      return { staff: s, targetNum, collectedNum, pace: pace(targetNum, collectedNum, now) };
    })
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader title={`Recovery targets — ${monthKey.toISOString().slice(0, 7)}`} />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Staff</th>
            <th className="p-2">Target</th>
            <th className="p-2">Collected</th>
            <th className="p-2">Pace</th>
            <th className="p-2">Projection</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ staff: s, targetNum, collectedNum, pace: p }) => (
            <tr key={s.id} className="border-b">
              <td className="p-2">{s.ownerName}</td>
              <td className="p-2">{targetNum ? formatINR(targetNum) : "—"}</td>
              <td className="p-2">{formatINR(collectedNum)}</td>
              <td className="p-2">
                {targetNum
                  ? `${Math.round(p.actualPct * 100)}% (${p.onTrack ? "on track" : "behind"})`
                  : "—"}
              </td>
              <td className="p-2">{targetNum ? formatINR(p.projectedTotal) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isAdmin && (
        <TargetForm
          staff={staff.map((s) => ({ id: s.id, name: s.ownerName }))}
          month={monthKey.toISOString().slice(0, 7)}
        />
      )}
    </div>
  );
}

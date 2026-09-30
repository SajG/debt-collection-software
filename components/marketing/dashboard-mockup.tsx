import { mkt } from "./tokens";

// SY26 — the polished dashboard mockup used on the marketing hero.
// Kept intentionally static (no data fetching) so the marketing
// route is cache-safe and doesn't need a DB.

export function DashboardMockup() {
  const parties = [
    {
      name: "Mehta Trading Co.",
      amount: "2,45,000",
      badge: "38 days overdue",
      badgeColor: mkt.amber,
      badgeBg: mkt.amberLight,
    },
    {
      name: "Rajan Steels Pvt.",
      amount: "87,500",
      badge: "Promised 18 Oct",
      badgeColor: mkt.teal,
      badgeBg: mkt.tealLight,
    },
    {
      name: "Kapoor Brothers",
      amount: "3,12,000",
      badge: "52 days · Critical",
      badgeColor: mkt.fault,
      badgeBg: mkt.faultLight,
    },
    {
      name: "Gupta Hardware",
      amount: "64,200",
      badge: "Due in 3 days",
      badgeColor: mkt.ink2,
      badgeBg: "#F4F4F5",
    },
  ];

  return (
    <div
      className="pt-float rounded-2xl overflow-hidden border shadow-2xl"
      style={{ borderColor: mkt.border, backgroundColor: mkt.white }}
    >
      <div
        className="flex items-center gap-1.5 px-4 py-3"
        style={{ backgroundColor: mkt.teal }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: "rgba(255,255,255,0.25)" }}
          />
        ))}
        <span className="ml-auto text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>
          Syncit Dashboard
        </span>
      </div>

      <div className="px-5 pt-4 pb-4 border-b" style={{ borderColor: "#F0EDE7" }}>
        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: mkt.ink3 }}>
          Total Outstanding
        </div>
        <div
          className="font-mono font-bold text-[2rem] leading-none"
          style={{ color: mkt.ink, fontFamily: "var(--font-display)" }}
        >
          ₹14,32,500
        </div>
        <div className="text-xs mt-1" style={{ color: mkt.ink2 }}>
          23 customers · 47 invoices
        </div>
        <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#F0EDE7" }}>
          <div className="h-full rounded-full" style={{ width: "68%", backgroundColor: mkt.amber }} />
        </div>
        <div className="mt-1.5 text-[11px]" style={{ color: mkt.amber }}>
          68% overdue 30+ days
        </div>
      </div>

      <div className="grid grid-cols-3 border-b" style={{ borderColor: "#F0EDE7" }}>
        {[
          { label: "Overdue", value: "23", color: mkt.amber },
          { label: "Promised", value: "8", color: mkt.teal },
          { label: "Follow-up", value: "12", color: mkt.ink2 },
        ].map(({ label, value, color }, i) => (
          <div
            key={label}
            className="py-3 text-center"
            style={{ borderRight: i < 2 ? "1px solid #F0EDE7" : undefined }}
          >
            <div className="font-bold text-lg leading-none" style={{ color }}>
              {value}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: mkt.ink3 }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      <div>
        {parties.map(({ name, amount, badge, badgeColor, badgeBg }) => (
          <div
            key={name}
            className="flex items-center justify-between px-5 py-3 border-b"
            style={{ borderColor: "#F8F5F0" }}
          >
            <div>
              <div className="text-sm font-medium" style={{ color: mkt.ink }}>
                {name}
              </div>
              <span
                className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5"
                style={{ color: badgeColor, backgroundColor: badgeBg }}
              >
                {badge}
              </span>
            </div>
            <div className="text-sm font-semibold font-mono" style={{ color: mkt.ink }}>
              ₹{amount}
            </div>
          </div>
        ))}
      </div>

      <div
        className="px-5 py-2.5 flex items-center gap-2"
        style={{ backgroundColor: "#F8F5EF" }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ backgroundColor: mkt.teal }}
        />
        <span className="text-[11px]" style={{ color: mkt.ink2 }}>
          Synced with Tally · 2 hours ago
        </span>
      </div>
    </div>
  );
}

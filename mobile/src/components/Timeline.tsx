import { StyleSheet, Text, View } from "react-native";
import type { OrderStatus } from "@/lib/database.types";
import { statusStyle } from "@/lib/status-style";
import { STATUS_PIPELINE } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { theme } from "@/theme";
import { t } from "@/lib/i18n";

type Event = {
  id: string;
  status: OrderStatus;
  notes: string | null;
  createdAt: string;
  // updatedById present but ownerName null means "there was an
  // updater but the directory RPC couldn't resolve them" — surfaced
  // as "Unknown user" so an RLS regression is visible to a human.
  updatedById?: string | null;
  updatedBy: { ownerName: string | null } | null;
};

type Row =
  | { kind: "done"; status: OrderStatus; ev: Event; elapsedSincePrev: string | null }
  | { kind: "future"; status: OrderStatus };

function formatElapsed(fromIso: string, toIso: string): string | null {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  const ms = to - from;
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m after previous`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h after previous`;
  const day = Math.round(hr / 24);
  return `${day}d after previous`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

// Vertical delivery-tracker timeline. Every past event is drawn in its
// own colour with a timestamp and any factory note; every status the
// order hasn't reached yet is drawn grayed out so the salesperson can
// tell at a glance "there are 2 more steps to go".
export function Timeline({
  events,
  currentStatus,
  expectedDeliveryDate,
}: {
  events: Event[];
  currentStatus: OrderStatus;
  /** When set and past, and the order is not DISPATCHED/DELIVERED, an
   *  "Overdue by N days" chip is shown above the timeline so it's the
   *  first thing the salesperson sees when they open the order. */
  expectedDeliveryDate?: string | null;
}) {
  const rows: Row[] = [];

  // Past + present: real events in chronological order, each carrying
  // the elapsed time since the previous event so the salesperson can
  // see where the pipeline stalled.
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const prev = i > 0 ? events[i - 1] : null;
    rows.push({
      kind: "done",
      status: ev.status,
      ev,
      elapsedSincePrev: prev ? formatElapsed(prev.createdAt, ev.createdAt) : null,
    });
  }

  // Future: pipeline steps this order hasn't reached yet.
  if (currentStatus !== "CANCELLED" && currentStatus !== "REJECTED") {
    const seen = new Set(events.map((e) => e.status));
    for (const status of STATUS_PIPELINE) {
      if (!seen.has(status)) rows.push({ kind: "future", status });
    }
  }

  const overdueChip = (() => {
    if (!expectedDeliveryDate) return null;
    if (currentStatus === "DISPATCHED" || currentStatus === "DELIVERED") return null;
    if (currentStatus === "CANCELLED" || currentStatus === "REJECTED") return null;
    const due = new Date(expectedDeliveryDate);
    if (Number.isNaN(due.getTime())) return null;
    const days = daysBetween(due, new Date());
    if (days <= 0) return null;
    return `Overdue by ${days} day${days === 1 ? "" : "s"}`;
  })();

  return (
    <View style={styles.wrap}>
      {overdueChip ? (
        <View style={styles.overdueChip}>
          <Text style={styles.overdueChipText}>⚠ {overdueChip}</Text>
        </View>
      ) : null}
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1;
        return <TimelineRow key={i} row={row} isLast={isLast} />;
      })}
    </View>
  );
}

function TimelineRow({ row, isLast }: { row: Row; isLast: boolean }) {
  const color =
    row.kind === "done" ? statusStyle(row.status).fg : theme.colors.border;
  const bg =
    row.kind === "done" ? statusStyle(row.status).bg : "transparent";

  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View
          style={[
            styles.dot,
            {
              backgroundColor: row.kind === "done" ? color : "transparent",
              borderColor: color,
            },
          ]}
        />
        {!isLast && (
          <View
            style={[
              styles.line,
              { backgroundColor: row.kind === "done" ? color : theme.colors.border },
            ]}
          />
        )}
      </View>
      <View style={[styles.body, { backgroundColor: bg }]}>
        <Text
          style={[
            styles.status,
            row.kind === "future" && { color: theme.colors.textMuted },
          ]}
        >
          {t(`status.${row.status}` as `status.${OrderStatus}`)}
        </Text>
        {row.kind === "done" ? (
          <>
            <Text style={styles.meta}>
              {formatDateTime(row.ev.createdAt)}
              {row.ev.updatedById || row.ev.updatedBy
                ? ` · ${t("detail.byLine", { name: row.ev.updatedBy?.ownerName ?? "Unknown user" })}`
                : ""}
            </Text>
            {row.elapsedSincePrev ? (
              <Text style={styles.elapsed}>{row.elapsedSincePrev}</Text>
            ) : null}
            {row.ev.notes ? (
              <Text style={styles.notes}>{row.ev.notes}</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.meta}>{t("detail.futureStep")}</Text>
        )}
      </View>
    </View>
  );
}

const DOT = 20;

const styles = StyleSheet.create({
  wrap: {},
  row: {
    flexDirection: "row",
    gap: 12,
    minHeight: 64,
  },
  rail: {
    width: DOT,
    alignItems: "center",
    paddingTop: 6,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 3,
  },
  line: {
    flex: 1,
    width: 3,
    marginTop: 4,
    borderRadius: 2,
  },
  body: {
    flex: 1,
    padding: 12,
    borderRadius: theme.radius,
    marginBottom: 12,
    gap: 4,
  },
  status: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  meta: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  notes: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.text,
    marginTop: 4,
  },
  elapsed: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontStyle: "italic",
  },
  overdueChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.dangerBg,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    marginBottom: 12,
  },
  overdueChipText: {
    color: theme.colors.danger,
    fontWeight: "800",
    fontSize: 13,
  },
});

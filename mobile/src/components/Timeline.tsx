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
  updatedBy: { ownerName: string } | null;
};

type Row =
  | { kind: "done"; status: OrderStatus; ev: Event }
  | { kind: "future"; status: OrderStatus };

// Vertical delivery-tracker timeline. Every past event is drawn in its
// own colour with a timestamp and any factory note; every status the
// order hasn't reached yet is drawn grayed out so the salesperson can
// tell at a glance "there are 2 more steps to go".
export function Timeline({
  events,
  currentStatus,
}: {
  events: Event[];
  currentStatus: OrderStatus;
}) {
  const rows: Row[] = [];

  // Past + present: real events in order.
  for (const ev of events) rows.push({ kind: "done", status: ev.status, ev });

  // Future: anything in the pipeline the order hasn't reached yet.
  // Skip if the order is cancelled — cancellation is a terminal branch.
  if (currentStatus !== "CANCELLED") {
    const seen = new Set(events.map((e) => e.status));
    for (const status of STATUS_PIPELINE) {
      if (!seen.has(status)) rows.push({ kind: "future", status });
    }
  }

  return (
    <View style={styles.wrap}>
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
              {row.ev.updatedBy?.ownerName
                ? ` · ${t("detail.byLine", { name: row.ev.updatedBy.ownerName })}`
                : ""}
            </Text>
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
});

import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { statusStyle } from "@/lib/status-style";
import { supabase } from "@/lib/supabase";
import {
  postOrderComment,
  useOrderComments,
  type OrderCommentRow,
} from "@/lib/order-comment-queries";
import type { OrderStatus } from "@/lib/database.types";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// One chronological view — status events + comments interleaved.
// Replaces the standalone Timeline on order detail screens. Comments
// use their own accent so they read as conversation, not status.

type Event = {
  id: string;
  status: OrderStatus;
  notes: string | null;
  createdAt: string;
  updatedBy: { ownerName: string } | null;
};

type MergedItem =
  | { kind: "status"; at: string; ev: Event }
  | { kind: "comment"; at: string; c: OrderCommentRow };

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityFeed({
  orderId,
  events,
}: {
  orderId: string;
  events: Event[];
}) {
  const { data: comments, refetch } = useOrderComments(orderId);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Realtime — either side's INSERT into OrderComment repaints the
  // thread. Bounded to this specific order so we don't wake up on
  // other orders' comments.
  useEffect(() => {
    const channel = supabase
      .channel(`order-comments-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "OrderComment",
          filter: `salesOrderId=eq.${orderId}`,
        },
        () => void refetch(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, refetch]);

  const merged = useMemo<MergedItem[]>(() => {
    const list: MergedItem[] = [];
    for (const ev of events) list.push({ kind: "status", at: ev.createdAt, ev });
    for (const c of comments ?? [])
      list.push({ kind: "comment", at: c.createdAt, c });
    list.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
    return list;
  }, [events, comments]);

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    setPosting(true);
    const res = await postOrderComment({ orderId, body: trimmed });
    setPosting(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setBody("");
    await refetch();
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Activity</Text>
      <Text style={styles.subheading}>
        Status changes and comments in one thread. Append-only.
      </Text>

      <View style={styles.composer}>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Add a comment — 'Customer wants 20kg not 25kg'"
          placeholderTextColor={theme.colors.textMuted}
          multiline
          maxLength={4000}
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          onPress={submit}
          disabled={posting || body.trim().length === 0}
          style={({ pressed }) => [
            styles.postBtn,
            pressed && { opacity: 0.85 },
            (posting || body.trim().length === 0) && { opacity: 0.6 },
          ]}
          accessibilityRole="button"
        >
          {posting ? (
            <ActivityIndicator color={theme.colors.primaryOn} />
          ) : (
            <Text style={styles.postBtnText}>Post</Text>
          )}
        </Pressable>
      </View>

      {merged.length === 0 ? (
        <Text style={styles.empty}>No activity yet.</Text>
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {merged.map((item, i) =>
            item.kind === "status" ? (
              <StatusRow key={`s:${item.ev.id}:${i}`} ev={item.ev} />
            ) : (
              <CommentRow key={`c:${item.c.id}`} c={item.c} />
            ),
          )}
        </View>
      )}
    </View>
  );
}

function StatusRow({ ev }: { ev: Event }) {
  const s = statusStyle(ev.status);
  return (
    <View style={[styles.row, { borderLeftColor: s.fg }]}>
      <View style={[styles.badge, { backgroundColor: s.bg }]}>
        <Text style={[styles.badgeText, { color: s.fg }]}>
          {t(`status.${ev.status}` as `status.${OrderStatus}`)}
        </Text>
      </View>
      <Text style={styles.meta}>
        {formatWhen(ev.createdAt)}
        {ev.updatedBy ? ` · ${ev.updatedBy.ownerName}` : ""}
      </Text>
      {ev.notes ? <Text style={styles.body}>{ev.notes}</Text> : null}
    </View>
  );
}

function CommentRow({ c }: { c: OrderCommentRow }) {
  return (
    <View style={[styles.row, styles.commentRow]}>
      <View style={[styles.badge, styles.commentBadge]}>
        <Text style={[styles.badgeText, styles.commentBadgeText]}>
          Comment
        </Text>
      </View>
      <Text style={styles.meta}>
        {formatWhen(c.createdAt)}
        {c.author ? ` · ${c.author.ownerName} (${c.author.role})` : ""}
      </Text>
      <Text style={styles.body}>{c.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.md, marginTop: theme.spacing.md },
  heading: {
    fontSize: theme.type.heading,
    fontWeight: "700",
    color: theme.colors.text,
  },
  subheading: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  composer: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  input: {
    minHeight: 72,
    padding: theme.spacing.sm,
    fontSize: theme.type.body,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    textAlignVertical: "top",
  },
  error: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.danger,
  },
  postBtn: {
    alignSelf: "flex-end",
    minHeight: theme.tap,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  postBtnText: {
    color: theme.colors.primaryOn,
    fontSize: theme.type.button,
    fontWeight: "700",
  },
  empty: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    textAlign: "center",
    paddingVertical: theme.spacing.md,
  },
  row: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 4,
    backgroundColor: theme.colors.background,
    gap: 4,
  },
  commentRow: {
    borderLeftColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  commentBadge: { backgroundColor: "#FEF3C7" },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  commentBadgeText: { color: "#78350F" },
  meta: {
    fontSize: theme.type.bodySmall - 2,
    color: theme.colors.textMuted,
  },
  body: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    marginTop: 2,
  },
});

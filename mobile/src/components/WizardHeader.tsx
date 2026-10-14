import { useCallback } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Text } from "./Text";
import { theme } from "@/theme";
import { t } from "@/lib/i18n";
import { goBackOr, useHardwareBack } from "@/lib/back";
import { useWizard, type OrderDraft } from "@/lib/order-draft";

// 3-screen wizard: Customer & delivery → Items → Review. The header
// shows one dot per screen so the salesperson always knows how much
// is left. No linear-step counter — the item cart on screen 2 makes
// "step N of 12" meaningless.
//
// Leaving a half-filled order (Back on screen 1, the Home button, or
// Android back) asks "Discard this order?" with three answers: keep
// editing, save it for later (the draft stays and Orders shows
// "Resume order"), or discard.

const TOTAL = 3;
const ORDERS = "/(staff)/orders";

function hasContent(d: OrderDraft): boolean {
  return Boolean(
    d.partyId ||
      d.newCustomerName?.trim() ||
      d.dispatchLocation.trim() ||
      d.notes.trim() ||
      d.items.length > 0,
  );
}

export function WizardHeader({
  step,
  title,
  onBack,
}: {
  /** 1-indexed screen number (1..3). */
  step: number;
  title: string;
  onBack?: () => void;
}) {
  const { draft, discard } = useWizard();
  const dirty = hasContent(draft);

  const leave = useCallback(() => {
    const exit = () => {
      if (typeof router.canDismiss === "function" && router.canDismiss()) {
        router.dismissAll();
      }
      router.replace(ORDERS);
    };
    if (!dirty) {
      exit();
      return;
    }
    Alert.alert(
      t("confirm.discard.title"),
      t("wizard.leave.body"),
      [
        { text: t("wizard.leave.keep"), style: "cancel" },
        { text: t("wizard.leave.saveDraft"), onPress: exit },
        {
          text: t("confirm.discard.ok"),
          style: "destructive",
          onPress: () => {
            void discard().then(exit);
          },
        },
      ],
      { cancelable: true },
    );
  }, [dirty, discard]);

  const back = useCallback(() => {
    if (onBack) onBack();
    else if (step === 1) leave();
    else goBackOr(ORDERS);
  }, [onBack, step, leave]);

  // Android back: on screen 1 it would leave the wizard, so it gets the
  // same question. On screens 2–3 it pops one screen as usual.
  const intercept = useCallback(() => {
    if (step !== 1) return false;
    leave();
    return true;
  }, [step, leave]);
  useHardwareBack(ORDERS, intercept);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={back}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t("wizard.back")}
        >
          <Text style={styles.backGlyph}>‹</Text>
          <Text style={styles.backLabel}>{t("wizard.back")}</Text>
        </Pressable>
        <View
          style={styles.dots}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t("wizard.step", { n: step, total: TOTAL })}
        >
          {Array.from({ length: TOTAL }).map((_, i) => {
            const idx = i + 1;
            const active = idx === step;
            const done = idx < step;
            return (
              <View
                key={idx}
                style={[
                  styles.dot,
                  done && styles.dotDone,
                  active && styles.dotActive,
                ]}
              />
            );
          })}
        </View>
        <Pressable
          onPress={leave}
          hitSlop={12}
          style={styles.homeBtn}
          accessibilityRole="button"
          accessibilityLabel={t("wizard.leave.close")}
        >
          <Text style={styles.homeLabel}>{t("common.close")}</Text>
          <Text style={styles.homeGlyph}>✕</Text>
        </Pressable>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: theme.tap,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: theme.tap,
    minWidth: theme.tap,
    justifyContent: "center",
    paddingHorizontal: 8,
    marginLeft: -8,
  },
  backGlyph: { fontSize: 28, color: theme.colors.primary, lineHeight: 28 },
  backLabel: {
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  dots: { flexDirection: "row", gap: 8, alignItems: "center" },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
  },
  dotDone: { backgroundColor: theme.colors.primary, opacity: 0.55 },
  dotActive: { width: 22, backgroundColor: theme.colors.primary },
  homeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: theme.tap,
    minWidth: theme.tap,
    justifyContent: "center",
    paddingHorizontal: 8,
    marginRight: -8,
  },
  homeGlyph: { fontSize: 18, color: theme.colors.primary, fontWeight: "700" },
  homeLabel: {
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 4,
  },
});

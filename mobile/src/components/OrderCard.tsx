import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBadge } from "./StatusBadge";
import { theme } from "@/theme";
import type { OrderStatus, QuantityUnit } from "@/lib/database.types";
import { t } from "@/lib/i18n";

export type OrderCardProps = {
  partyName: string;
  productName: string;
  brand: string | null;
  quantity: string | number;
  quantityUnit: QuantityUnit;
  status: OrderStatus;
  orderNumber: string | null;
  pending?: boolean;
  /** Shown on the "All orders" admin view so an admin looking at the
   *  full list can tell whose order it is. Hidden on personal views. */
  salespersonName?: string | null;
  /** When set, a "☎ Call" pill appears next to the name and taps
   *  directly into the dialer. Factory's most common next action
   *  after reading an order is phoning the salesperson to query it —
   *  make that one tap. */
  salespersonPhone?: string | null;
  onPress?: () => void;
  /** Inline "↻ Repeat" pill in the footer. Renders only when supplied
   *  — home screen wires it up to clone the order into a fresh draft;
   *  the order-detail screen doesn't. */
  onRepeat?: () => void;
};

function dial(phone: string) {
  const uri = `tel:${phone.replace(/\s+/g, "")}`;
  void Linking.openURL(uri).catch(() =>
    Alert.alert("Could not open dialer", phone),
  );
}

export function OrderCard(props: OrderCardProps) {
  const disabled = !props.onPress || props.pending;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.card,
        props.pending && styles.pendingCard,
        pressed && !disabled && styles.pressed,
      ]}
      accessibilityRole={disabled ? "text" : "button"}
      accessibilityLabel={`${props.partyName}, ${props.productName}, ${props.quantity} ${props.quantityUnit}, ${props.status}`}
    >
      <View style={styles.headerRow}>
        <Text style={styles.party} numberOfLines={2}>
          {props.partyName}
        </Text>
        <StatusBadge status={props.status} size="md" />
      </View>

      <Text style={styles.product} numberOfLines={2}>
        {props.productName}
        {props.brand ? (
          <Text style={styles.brand}> · {props.brand}</Text>
        ) : null}
      </Text>

      {props.salespersonName ? (
        <View style={styles.salespersonRow}>
          <Text style={styles.salesperson} numberOfLines={1}>
            {t("home.placedBy", { name: props.salespersonName })}
          </Text>
          {props.salespersonPhone ? (
            <Pressable
              onPress={() => dial(props.salespersonPhone!)}
              hitSlop={10}
              style={({ pressed }) => [
                styles.callPill,
                pressed && { opacity: 0.75 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Call ${props.salespersonName}`}
            >
              <Text style={styles.callPillText}>☎ Call</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.quantity}>
          {props.quantity} {props.quantityUnit}
        </Text>
        <View style={styles.footerRight}>
          <Text style={styles.orderNo}>
            {props.pending ? t("home.pending") : (props.orderNumber ?? "")}
          </Text>
          {props.onRepeat ? (
            <Pressable
              onPress={props.onRepeat}
              hitSlop={10}
              style={({ pressed }) => [
                styles.repeatPill,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Repeat this order"
            >
              <Text style={styles.repeatPillText}>↻ Repeat</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    gap: 10,
  },
  pendingCard: {
    borderStyle: "dashed",
    backgroundColor: theme.colors.surface,
    borderColor: "#D97706",
  },
  pressed: { opacity: 0.85 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  party: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.text,
    lineHeight: 28,
  },
  product: {
    fontSize: theme.type.body,
    color: theme.colors.text,
  },
  brand: { color: theme.colors.textMuted, fontWeight: "600" },
  salesperson: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: "600",
    marginTop: -4,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  quantity: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  orderNo: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  repeatPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  repeatPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  salespersonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: -4,
  },
  callPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  callPillText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});

import { Pressable, StyleSheet, Text, View } from "react-native";
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
  onPress?: () => void;
};

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
        <Text style={styles.salesperson} numberOfLines={1}>
          {t("home.placedBy", { name: props.salespersonName })}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.quantity}>
          {props.quantity} {props.quantityUnit}
        </Text>
        <Text style={styles.orderNo}>
          {props.pending ? t("home.pending") : (props.orderNumber ?? "")}
        </Text>
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
});

import { Linking, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Text } from "./Text";
import { toast } from "./Toast";
import { useAuth } from "@/auth/AuthContext";
import { buildReminderText, openWhatsApp } from "@/lib/whatsapp";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// The four one-tap follow-up buttons shown under a customer on the
// Today tab and on the customer page: Call · WhatsApp · Promise ·
// Record payment. Wraps to two rows when the labels need the room
// (large font setting, long translations).

export type ActionCustomer = {
  id: string;
  name: string;
  phone: string | null;
  outstanding: number;
  daysOverdue: number;
  paymentLinkUrl?: string | null;
};

export function CustomerActions({
  customer,
  onPromise,
}: {
  customer: ActionCustomer;
  onPromise: () => void;
}) {
  const { profile } = useAuth();
  const hasPhone = !!customer.phone && customer.phone.replace(/\D/g, "").length >= 10;

  async function call() {
    if (!customer.phone) return;
    try {
      await Linking.openURL(`tel:${customer.phone.replace(/[^\d+]/g, "")}`);
    } catch {
      toast.error(t("common.couldNotOpenDialer"));
    }
  }

  function whatsapp() {
    if (!customer.phone) return;
    void openWhatsApp(
      customer.phone,
      buildReminderText({
        partyName: customer.name,
        amount: customer.outstanding,
        daysOverdue: customer.daysOverdue,
        paymentLinkUrl: customer.paymentLinkUrl,
        yourName: profile?.ownerName ?? null,
      }),
    );
  }

  function recordPayment() {
    router.push({
      pathname: "/(staff)/payments/new",
      params: { partyId: customer.id, partyName: customer.name },
    });
  }

  return (
    <View style={styles.row}>
      <ActionButton
        label={t("today.call")}
        a11y={t("today.callA11y", { name: customer.name })}
        onPress={call}
        disabled={!hasPhone}
        primary
      />
      <ActionButton
        label={t("today.whatsapp")}
        a11y={t("today.whatsappA11y", { name: customer.name })}
        onPress={whatsapp}
        disabled={!hasPhone}
      />
      <ActionButton
        label={t("today.promise")}
        a11y={t("today.promiseA11y", { name: customer.name })}
        onPress={onPromise}
      />
      <ActionButton
        label={t("today.payment")}
        a11y={t("today.paymentA11y", { name: customer.name })}
        onPress={recordPayment}
      />
      {!hasPhone ? <Text style={styles.noPhone}>{t("today.noPhone")}</Text> : null}
    </View>
  );
}

function ActionButton({
  label,
  a11y,
  onPress,
  disabled,
  primary,
}: {
  label: string;
  a11y: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        primary && styles.btnPrimary,
        disabled && styles.btnDisabled,
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  btn: {
    flexGrow: 1,
    flexBasis: "22%",
    minWidth: 76,
    minHeight: 48,
    paddingHorizontal: 8,
    borderRadius: theme.radius,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: theme.colors.primary },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 15, fontWeight: "700", color: theme.colors.primary },
  btnTextPrimary: { color: theme.colors.primaryOn },
  noPhone: {
    flexBasis: "100%",
    fontSize: 13,
    color: theme.colors.textMuted,
  },
});

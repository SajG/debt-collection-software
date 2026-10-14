import { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { PageHeader } from "@/components/PageHeader";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import { newId } from "@/lib/ids";
import { theme } from "@/theme";
import { t } from "@/lib/i18n";
import { toast } from "@/components/Toast";
import { goBackOr } from "@/lib/back";

// ADMIN-only in-field customer creation. Salespeople keep using the
// free-text newCustomerName path on the order wizard; an admin
// promotes those later via /admin/new-customer-names on the web.
export default function NewCustomerScreen() {
  const { profile, role } = useAuth();
  const isAdmin = role === "ADMIN";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [saving, setSaving] = useState(false);

  if (!profile) return null;
  if (!isAdmin) {
    return (
      <Screen>
        <PageHeader
          title={t("staffCustomersNew.addCustomer")}
          subtitle={t("staffCustomersNew.onlyAdminUsersCanCreate")}
        />
      </Screen>
    );
  }

  async function save() {
    if (!profile) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      Alert.alert(t("common.nameRequired"), t("common.enterTheCustomerName"));
      return;
    }
    setSaving(true);
    // Author is the admin themselves — assignment can be edited on the
    // web customer page. Keeps the mobile form to one screen.
    // Party has no DB-side DEFAULT for id/updatedAt (see prisma
    // schema uses @default(cuid()) which is client-resolved). Supply
    // them here — the previous `as any` cast was masking a runtime
    // NOT NULL violation.
    const now = new Date().toISOString();
    const payload = {
      id: newId("party"),
      name: trimmed,
      phone: phone.trim().replace(/\D/g, "").slice(-10) || null,
      gstNumber: gstNumber.trim() || null,
      city: city.trim() || null,
      address: address.trim() || null,
      creditLimit: creditLimit
        ? Number(creditLimit.replace(/[₹,\s]/g, ""))
        : null,
      assignedToId: profile.id,
      isActive: true,
      updatedAt: now,
    };
    const { error } = await supabase.from("Party").insert(payload);
    setSaving(false);
    if (error) {
      Alert.alert(t("common.couldNotSave"), error.message);
      return;
    }
    toast.success(t("staffCustomersNew.added", { trimmed }));
    goBackOr("/(staff)/customers");
  }

  return (
    <Screen padded={false}>
      <PageHeader
        title={t("staffCustomersNew.addCustomer")}
        subtitle={t("staffCustomersNew.onlyNameIsRequiredEverything")}
      />
      <ScrollView contentContainerStyle={styles.body}>
        <TextField
          label={t("staffCustomersNew.customerName")}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoCorrect={false}
        />
        <TextField
          label={t("staffCustomersNew.phone10Digits")}
          value={phone}
          onChangeText={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
          keyboardType="phone-pad"
        />
        <TextField
          label="GSTIN"
          value={gstNumber}
          onChangeText={(v) => setGstNumber(v.toUpperCase().slice(0, 15))}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <TextField
          label={t("staffCustomersNew.city")}
          value={city}
          onChangeText={setCity}
          autoCapitalize="words"
        />
        <TextField
          label={t("staffCustomersNew.address")}
          value={address}
          onChangeText={setAddress}
          multiline
          numberOfLines={3}
        />
        <TextField
          label={t("staffCustomersNew.creditLimit")}
          value={creditLimit}
          onChangeText={setCreditLimit}
          keyboardType="numeric"
        />

        <View style={styles.footer}>
          <Button
            label={saving ? t("common.saving") : t("staffCustomersNew.addCustomer")}
            loading={saving}
            onPress={save}
            disabled={saving || name.trim().length < 2}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg, gap: theme.spacing.md },
  footer: { marginTop: theme.spacing.md },
});

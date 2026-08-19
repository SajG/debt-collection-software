import { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { PageHeader } from "@/components/PageHeader";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import { theme } from "@/theme";

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
          title="Add customer"
          subtitle="Only ADMIN users can create a customer from the app. Salespeople should place the order with the free-text customer name — an admin promotes it later."
        />
      </Screen>
    );
  }

  async function save() {
    if (!profile) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      Alert.alert("Name required", "Enter the customer name.");
      return;
    }
    setSaving(true);
    // Author is the admin themselves — assignment can be edited on the
    // web customer page. Keeps the mobile form to one screen.
    const payload = {
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
    };
    const { error } = await (supabase as any).from("Party").insert(payload);
    setSaving(false);
    if (error) {
      Alert.alert("Could not save", error.message);
      return;
    }
    Alert.alert("Saved", `${trimmed} added.`, [
      { text: "OK", onPress: () => router.back() },
    ]);
  }

  return (
    <Screen padded={false}>
      <PageHeader
        title="Add customer"
        subtitle="Only name is required — everything else can be filled from the web later."
      />
      <ScrollView contentContainerStyle={styles.body}>
        <TextField
          label="Customer name *"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoCorrect={false}
        />
        <TextField
          label="Phone (10 digits)"
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
          label="City"
          value={city}
          onChangeText={setCity}
          autoCapitalize="words"
        />
        <TextField
          label="Address"
          value={address}
          onChangeText={setAddress}
          multiline
          numberOfLines={3}
        />
        <TextField
          label="Credit limit (₹)"
          value={creditLimit}
          onChangeText={setCreditLimit}
          keyboardType="numeric"
        />

        <View style={styles.footer}>
          <Button
            label={saving ? "Saving…" : "Add customer"}
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

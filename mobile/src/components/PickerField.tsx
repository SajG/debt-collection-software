import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/theme";

// Searchable dropdown for rich items (id + label + sublabel). Mirrors
// SelectField's trigger UI so brand/product/packing/size all read the
// same visually — the only difference is search is enabled here.

export type PickerItem = {
  value: string;
  label: string;
  sublabel?: string | null;
  searchText?: string;
};

export function PickerField({
  label,
  value,
  items,
  onChange,
  placeholder = "Choose…",
  searchable = false,
  searchPlaceholder = "Search…",
  recentValues,
}: {
  label: string;
  value: string | null;
  items: readonly PickerItem[];
  onChange: (v: string) => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Value ids surfaced in a "Recent" section on top of the list.
   *  Items not present in `items` are skipped. Order is preserved
   *  (caller decides — usually most-recent first). Hidden when the
   *  user is typing a search query so recents don't distract. */
  recentValues?: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const insets = useSafeAreaInsets();

  const current = items.find((i) => i.value === value) ?? null;
  const displayed = current ? current.label : placeholder;

  const filtered = useMemo(() => {
    if (!searchable) return items;
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) => {
      const hay =
        (i.searchText ?? `${i.label} ${i.sublabel ?? ""}`).toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q, searchable]);

  const recentItems = useMemo(() => {
    if (!recentValues || recentValues.length === 0) return [];
    if (q.trim()) return []; // hide recents while typing
    const byValue = new Map(items.map((i) => [i.value, i]));
    const seen = new Set<string>();
    const out: PickerItem[] = [];
    for (const v of recentValues) {
      const it = byValue.get(v);
      if (it && !seen.has(v)) {
        out.push(it);
        seen.add(v);
      }
      if (out.length >= 5) break;
    }
    return out;
  }, [recentValues, items, q]);

  return (
    <>
      <Pressable
        onPress={() => {
          setQ("");
          setOpen(true);
        }}
        style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder}. Opens picker.`}
      >
        <Text style={styles.triggerLabel}>{label}</Text>
        <View style={styles.triggerRow}>
          <Text
            style={[styles.triggerValue, !current && styles.triggerPlaceholder]}
            numberOfLines={1}
          >
            {displayed}
          </Text>
          <Text style={styles.chevron}>▾</Text>
        </View>
        {current?.sublabel ? (
          <Text style={styles.triggerSub} numberOfLines={1}>
            {current.sublabel}
          </Text>
        ) : null}
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <Pressable
              onPress={() => setOpen(false)}
              hitSlop={16}
              accessibilityRole="button"
              accessibilityLabel="Close picker"
            >
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          {searchable ? (
            <View style={styles.searchWrap}>
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder={searchPlaceholder}
                placeholderTextColor={theme.colors.textMuted}
                style={styles.search}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
            </View>
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={(i) => i.value}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              recentItems.length > 0 ? (
                <View>
                  <Text style={styles.sectionLabel}>Recent</Text>
                  {recentItems.map((item) => {
                    const active = item.value === value;
                    return (
                      <Pressable
                        key={`recent-${item.value}`}
                        onPress={() => {
                          onChange(item.value);
                          setOpen(false);
                        }}
                        style={({ pressed }) => [
                          styles.row,
                          active && styles.rowActive,
                          pressed && { opacity: 0.7 },
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.rowLabel,
                              active && styles.rowLabelActive,
                            ]}
                          >
                            {item.label}
                          </Text>
                          {item.sublabel ? (
                            <Text
                              style={[
                                styles.rowSub,
                                active && styles.rowSubActive,
                              ]}
                            >
                              {item.sublabel}
                            </Text>
                          ) : null}
                        </View>
                        {active ? <Text style={styles.check}>✓</Text> : null}
                      </Pressable>
                    );
                  })}
                  <View style={styles.divider} />
                  <Text style={styles.sectionLabel}>All</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const active = item.value === value;
              return (
                <Pressable
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    active && styles.rowActive,
                    pressed && { opacity: 0.7 },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.rowLabel,
                        active && styles.rowLabelActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {item.sublabel ? (
                      <Text
                        style={[
                          styles.rowSub,
                          active && styles.rowSubActive,
                        ]}
                      >
                        {item.sublabel}
                      </Text>
                    ) : null}
                  </View>
                  {active ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={
              <Text style={styles.empty}>No matches.</Text>
            }
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    minHeight: 60,
    justifyContent: "center",
  },
  triggerLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  triggerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  triggerValue: {
    flex: 1,
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.text,
  },
  triggerPlaceholder: {
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
  triggerSub: {
    marginTop: 2,
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  chevron: { fontSize: 14, color: theme.colors.textMuted },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "85%",
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sheetTitle: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  close: { fontSize: 20, color: theme.colors.textMuted, padding: 4 },
  searchWrap: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  search: {
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: theme.type.body,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    minHeight: 44,
  },
  row: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowActive: { backgroundColor: theme.colors.surface },
  rowLabel: {
    fontSize: theme.type.body,
    color: theme.colors.text,
  },
  rowLabelActive: { color: theme.colors.primary, fontWeight: "700" },
  rowSub: {
    marginTop: 2,
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  rowSubActive: { color: theme.colors.primary },
  check: { fontSize: 18, color: theme.colors.primary, fontWeight: "700" },
  sep: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: theme.spacing.md,
  },
  sectionLabel: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: 12,
    paddingBottom: 6,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
  },
  divider: {
    height: 8,
    backgroundColor: "transparent",
  },
  empty: {
    padding: theme.spacing.lg,
    textAlign: "center",
    color: theme.colors.textMuted,
    fontSize: theme.type.bodySmall,
  },
});

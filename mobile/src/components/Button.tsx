import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from "react-native";
import { theme } from "@/theme";

type Variant = "primary" | "secondary" | "danger";

type Props = Omit<PressableProps, "children" | "style"> & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
};

export function Button({
  label,
  variant = "primary",
  loading = false,
  fullWidth = true,
  disabled,
  ...rest
}: Props) {
  const s = styles(variant);
  return (
    <Pressable
      {...rest}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [
        s.button,
        fullWidth && { alignSelf: "stretch" },
        (disabled || loading) && s.disabled,
        pressed && s.pressed,
      ]}
      // hitSlop widens the effective tap area past the visual bounds so a
      // hurried tap near the edge still lands.
      hitSlop={8}
    >
      {loading ? (
        <ActivityIndicator color={s.label.color} />
      ) : (
        <View style={s.inner}>
          <Text style={s.label} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = (variant: Variant) => {
  const base = {
    minHeight: theme.tap,
    borderRadius: theme.radius,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
  };
  const map = {
    primary: {
      button: { ...base, backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
      label: { color: theme.colors.primaryOn, fontSize: theme.type.button, fontWeight: "700" as const },
    },
    secondary: {
      button: { ...base, backgroundColor: theme.colors.background, borderColor: theme.colors.border },
      label: { color: theme.colors.text, fontSize: theme.type.button, fontWeight: "600" as const },
    },
    danger: {
      button: { ...base, backgroundColor: theme.colors.dangerBg, borderColor: theme.colors.danger },
      label: { color: theme.colors.danger, fontSize: theme.type.button, fontWeight: "700" as const },
    },
  };
  return StyleSheet.create({
    ...map[variant],
    inner: { flexDirection: "row", alignItems: "center", gap: 8 },
    pressed: { opacity: 0.85 },
    disabled: { opacity: 0.5 },
  });
};

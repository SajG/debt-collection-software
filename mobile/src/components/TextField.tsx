import { forwardRef } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { theme } from "@/theme";

type Props = TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
};

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, hint, error, style, ...rest },
  ref,
) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        {...rest}
        placeholderTextColor={theme.colors.textMuted}
        style={[styles.input, error ? styles.inputError : null, style]}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: {
    fontSize: theme.type.bodySmall,
    fontWeight: "600",
    color: theme.colors.text,
  },
  input: {
    minHeight: theme.tap,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.type.body,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  inputError: { borderColor: theme.colors.danger },
  hint: { fontSize: 14, color: theme.colors.textMuted },
  error: { fontSize: 14, color: theme.colors.danger, fontWeight: "600" },
});

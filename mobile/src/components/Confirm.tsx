import { Alert } from "react-native";
import { t } from "@/lib/i18n";

/**
 * Thin wrapper around the OS confirmation dialog. Native Alert gives us
 * a real modal with OS-sized touch targets and screen-reader support —
 * better than any custom sheet for a low-tech user. Every destructive
 * action in the app should go through this so the confirm step is
 * consistent, per the brief.
 */
export function confirm(opts: {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}): void {
  Alert.alert(
    opts.title,
    opts.body,
    [
      { text: opts.cancelLabel ?? t("confirm.cancel"), style: "cancel" },
      {
        text: opts.confirmLabel ?? t("confirm.ok"),
        style: opts.destructive ? "destructive" : "default",
        onPress: opts.onConfirm,
      },
    ],
    { cancelable: true },
  );
}

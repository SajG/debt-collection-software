// Haptic feedback for the three actions that matter:
//   place order, status advance, document upload.
// Not on navigation, not on scroll — those turn into buzz-fatigue fast.
//
// Uses expo-haptics as an OPTIONAL dep. If it isn't installed the
// helpers no-op — feature parity that doesn't force an install.

type HapticsModule = {
  ImpactFeedbackStyle: { Light: "light"; Medium: "medium"; Heavy: "heavy" };
  NotificationFeedbackType: {
    Success: "success";
    Warning: "warning";
    Error: "error";
  };
  impactAsync: (style?: string) => Promise<void>;
  notificationAsync: (type?: string) => Promise<void>;
};

let cached: HapticsModule | null | "unavailable" = null;

function load(): HapticsModule | null {
  if (cached === "unavailable") return null;
  if (cached) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("expo-haptics") as HapticsModule;
    return cached;
  } catch {
    cached = "unavailable";
    return null;
  }
}

/** Light impact — successful place order / advance / upload. */
export function successHaptic(): void {
  const h = load();
  if (!h) return;
  void h.notificationAsync(h.NotificationFeedbackType.Success).catch(() => undefined);
}

/** Amber warning — offline queue absorbed an action. */
export function warningHaptic(): void {
  const h = load();
  if (!h) return;
  void h.notificationAsync(h.NotificationFeedbackType.Warning).catch(() => undefined);
}

/** Error — action failed and there's no queue fallback. */
export function errorHaptic(): void {
  const h = load();
  if (!h) return;
  void h.notificationAsync(h.NotificationFeedbackType.Error).catch(() => undefined);
}

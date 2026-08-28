import { useCallback, useState } from "react";
import { Alert } from "react-native";
import type { OrderStatus } from "./database.types";
import { submitStatusAdvance } from "./status-queue";
import { useConnectivity } from "./connectivity";
import { warningHaptic, successHaptic, errorHaptic } from "./haptics";
import { crumb, reportError } from "./observability";

// Optimistic status-advance wrapper.
//
// Callers keep a local `optimisticStatus` that overrides the row's
// currentStatus while the RPC is in flight. On success we clear it.
// On rollback (network shape) the queue takes over and the caller
// gets a warning haptic. On application-shape failure (bad
// transition, forbidden) we roll back locally, buzz an error, and
// alert the user with the server's reason.
//
// Toast note: React Native has no built-in toast. The team hasn't
// picked a lib, so we're using Alert for genuine failures where
// interaction is warranted. Once a toast primitive lands, replace
// the Alerts here — the API surface stays the same.

export function useOptimisticStatus(orderId: string, orderNumber: string) {
  const { online } = useConnectivity();
  const [pendingTarget, setPendingTarget] = useState<OrderStatus | null>(null);
  const [inFlight, setInFlight] = useState(false);

  const advance = useCallback(
    async (target: OrderStatus, note?: string | null): Promise<boolean> => {
      if (inFlight) return false;
      setPendingTarget(target);
      setInFlight(true);
      crumb("status", `advance ${target}`, { orderId });
      try {
        const res = await submitStatusAdvance({
          orderId,
          orderNumber,
          target,
          note: note ?? null,
          online,
        });
        if ("ok" in res) {
          successHaptic();
          return true;
        }
        if ("queued" in res) {
          // Retryable — keep the optimistic status in place; the
          // drainer will resolve it later.
          warningHaptic();
          return true;
        }
        // Hard app-shape error — rollback + explain.
        setPendingTarget(null);
        errorHaptic();
        Alert.alert("Couldn't update status", res.error);
        return false;
      } catch (e) {
        setPendingTarget(null);
        errorHaptic();
        reportError(e, { where: "useOptimisticStatus", orderId, target });
        Alert.alert("Couldn't update status", "Please try again.");
        return false;
      } finally {
        setInFlight(false);
      }
    },
    [orderId, orderNumber, online, inFlight],
  );

  const displayStatus = useCallback(
    (canonical: OrderStatus): OrderStatus => pendingTarget ?? canonical,
    [pendingTarget],
  );

  return {
    /** Current optimistic override; null when idle. */
    pendingTarget,
    inFlight,
    advance,
    /** Wrap the row's real status through this so the UI shows the
     *  optimistic value while the RPC is in flight. */
    displayStatus,
  };
}

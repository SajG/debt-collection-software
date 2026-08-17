import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useConnectivity } from "./connectivity";
import { drainOnce } from "./order-queue";

/**
 * Fires drainOnce() whenever we transition to online, or the app comes
 * back to the foreground while online. Also runs once on mount so a
 * fresh install with queued orders drains immediately if we boot online.
 */
export function useQueueDrainer(): void {
  const { online } = useConnectivity();
  const wasOnline = useRef(online);
  const draining = useRef(false);

  async function safeDrain() {
    if (draining.current) return;
    draining.current = true;
    try {
      await drainOnce();
    } finally {
      draining.current = false;
    }
  }

  useEffect(() => {
    if (online) void safeDrain();
    wasOnline.current = online;
  }, [online]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && wasOnline.current) void safeDrain();
    });
    return () => sub.remove();
  }, []);
}

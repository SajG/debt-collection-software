import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useConnectivity } from "./connectivity";
import { drainOnce } from "./order-queue";
import { drainDocsOnce } from "./order-doc-queue";
import { drainStatusOnce } from "./status-queue";

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
      // Status advances are cheap (one RPC) so run them BEFORE the
      // photo uploads so a factory tap made offline reaches the
      // salesperson via a push as soon as connectivity returns.
      await drainStatusOnce();
      // Doc uploads share the same connectivity trigger; run them
      // sequentially so we don't slam the phone's radio with a big
      // photo upload and an RPC call at the same time.
      await drainDocsOnce();
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

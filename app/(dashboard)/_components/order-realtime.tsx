"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to append-only audit tables for a sales order so factory and
 * salesperson views refresh without a manual reload when status or documents
 * change. Relies on Supabase Realtime + RLS (subscribers only receive rows
 * they can SELECT).
 */
export function OrderRealtimeRefresh({ orderId }: { orderId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => router.refresh();

    const channel = supabase
      .channel(`order-live-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "OrderStatusEvent",
          filter: `salesOrderId=eq.${orderId}`,
        },
        refresh
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "OrderDocument",
          filter: `salesOrderId=eq.${orderId}`,
        },
        refresh
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "SalesOrder",
          filter: `id=eq.${orderId}`,
        },
        refresh
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, router]);

  return null;
}

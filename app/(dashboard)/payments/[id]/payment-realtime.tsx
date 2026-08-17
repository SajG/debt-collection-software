"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Refreshes the payment detail view whenever a new PaymentDocument is
 * inserted for this payment. Same pattern as OrderRealtimeRefresh — RLS
 * ensures subscribers only get rows they can SELECT.
 */
export function PaymentRealtimeRefresh({ paymentId }: { paymentId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => router.refresh();

    const channel = supabase
      .channel(`payment-live-${paymentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "PaymentDocument",
          filter: `paymentId=eq.${paymentId}`,
        },
        refresh
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [paymentId, router]);

  return null;
}

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useLogisticsRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel("logistics-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pickup_orders" }, () => {
        qc.invalidateQueries({ queryKey: ["pickup-orders"] });
        qc.invalidateQueries({ queryKey: ["pickup-orders-count"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, () => {
        qc.invalidateQueries({ queryKey: ["drivers"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
}

export function usePickupCountRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel("pickup-count-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pickup_orders" }, () => {
        qc.invalidateQueries({ queryKey: ["pickup-orders-count"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
}

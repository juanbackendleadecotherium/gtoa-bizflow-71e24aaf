import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useWarehouseRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("warehouse-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "warehouse_movements" }, () => {
        qc.invalidateQueries({ queryKey: ["warehouse"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "warehouse_zones" }, () => {
        qc.invalidateQueries({ queryKey: ["warehouse"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "warehouses" }, () => {
        qc.invalidateQueries({ queryKey: ["warehouse"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "order_items" }, () => {
        qc.invalidateQueries({ queryKey: ["warehouse", "available-items"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}

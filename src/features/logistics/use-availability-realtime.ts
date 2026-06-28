import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAvailabilityRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel("logistics-availability-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "logistics_availability" }, () => {
        qc.invalidateQueries({ queryKey: ["logistics-availability"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
}

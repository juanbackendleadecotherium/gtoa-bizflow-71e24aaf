import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type PgFilter = { column: string; value: string | number } | string | undefined;

/**
 * Reusable Supabase Realtime subscription that invalidates the given
 * React Query keys whenever the target table changes.
 *
 * Usage:
 *   useRealtimeSync("orders", { column: "id", value: orderId }, [["order", orderId]]);
 *   useRealtimeSync("seller_tasks", undefined, [["my-tasks"], ["my-tasks-count"]]);
 */
export function useRealtimeSync(
  table: string,
  filter: PgFilter,
  queryKeysToInvalidate: QueryKey[],
) {
  const queryClient = useQueryClient();
  const filterStr =
    typeof filter === "string"
      ? filter
      : filter
        ? `${filter.column}=eq.${filter.value}`
        : undefined;
  const keysStr = JSON.stringify(queryKeysToInvalidate);

  useEffect(() => {
    const channelName = `rt-${table}-${filterStr ?? "all"}-${Math.random().toString(36).slice(2, 8)}`;
    const changes: Record<string, unknown> = { event: "*", schema: "public", table };
    if (filterStr) changes.filter = filterStr;

    const channel = supabase
      .channel(channelName)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, changes, () => {
        for (const key of JSON.parse(keysStr) as QueryKey[]) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filterStr, keysStr, queryClient]);
}

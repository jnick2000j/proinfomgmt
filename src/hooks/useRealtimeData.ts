import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type TableName = "programmes" | "projects" | "risks" | "issues" | "benefits" | "weekly_reports";

/**
 * Subscribe to realtime row changes for a table, scoped to a single organization.
 *
 * The channel topic embeds the organization id (e.g. `projects-changes:<org_id>`)
 * so the realtime RLS policy can verify the subscriber belongs to that org and
 * prevent cross-tenant data leakage.
 */
export function useRealtimeData<T extends { id: string; organization_id?: string }>(
  tableName: TableName,
  organizationId: string | null | undefined,
  initialData: T[] = []
) {
  const [data, setData] = useState<T[]>(initialData);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel(`${tableName}-changes:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: tableName,
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload: RealtimePostgresChangesPayload<T>) => {
          if (payload.eventType === "INSERT") {
            setData((prev) => [...prev, payload.new as T]);
          } else if (payload.eventType === "UPDATE") {
            setData((prev) =>
              prev.map((item) =>
                item.id === (payload.new as T).id ? (payload.new as T) : item
              )
            );
          } else if (payload.eventType === "DELETE") {
            setData((prev) =>
              prev.filter((item) => item.id !== (payload.old as T).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableName, organizationId]);

  return { data, setData };
}

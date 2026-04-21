import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, History, Ban, RotateCcw } from "lucide-react";

interface SuspensionEvent {
  id: string;
  event_type: string;
  status: string;
  created_at: string;
  user_email: string | null;
  organization_id: string | null;
  metadata: Record<string, any> | null;
  organization_name?: string | null;
}

interface Props {
  limit?: number;
  organizationId?: string;
}

export function SuspensionHistory({ limit = 50, organizationId }: Props) {
  const [events, setEvents] = useState<SuspensionEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from("auth_audit_log")
      .select("id, event_type, status, created_at, user_email, organization_id, metadata")
      .in("event_type", ["organization.suspended", "organization.reinstated"])
      .order("created_at", { ascending: false })
      .limit(limit);

    if (organizationId) query = query.eq("organization_id", organizationId);

    const { data, error } = await query;
    if (error) {
      console.error("Failed to load suspension history:", error);
      setEvents([]);
      setLoading(false);
      return;
    }

    const orgIds = Array.from(new Set((data || []).map((r) => r.organization_id).filter(Boolean))) as string[];
    let nameMap = new Map<string, string>();
    if (orgIds.length > 0) {
      const { data: orgs } = await supabase
        .from("organizations")
        .select("id, name")
        .in("id", orgIds);
      (orgs || []).forEach((o) => nameMap.set(o.id, o.name));
    }

    setEvents(
      (data || []).map((r) => ({
        ...r,
        metadata: (r.metadata as Record<string, any>) || null,
        organization_name: r.organization_id ? nameMap.get(r.organization_id) ?? null : null,
      })),
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, [organizationId, limit]);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold">Suspension history</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Action</TableHead>
            {!organizationId && <TableHead>Organization</TableHead>}
            <TableHead>Performed by</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Reason / notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={organizationId ? 5 : 6} className="text-center py-8">
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              </TableCell>
            </TableRow>
          ) : events.length === 0 ? (
            <TableRow>
              <TableCell colSpan={organizationId ? 5 : 6} className="text-center py-8 text-muted-foreground">
                No suspension events recorded.
              </TableCell>
            </TableRow>
          ) : (
            events.map((e) => {
              const isSuspend = e.event_type === "organization.suspended";
              return (
                <TableRow key={e.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {isSuspend ? (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                        <Ban className="h-3 w-3 mr-1" /> Suspended
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                        <RotateCcw className="h-3 w-3 mr-1" /> Reinstated
                      </Badge>
                    )}
                  </TableCell>
                  {!organizationId && (
                    <TableCell className="text-sm">{e.organization_name || "—"}</TableCell>
                  )}
                  <TableCell className="text-sm">{e.user_email || "system"}</TableCell>
                  <TableCell className="text-sm capitalize">
                    {e.metadata?.kind ? String(e.metadata.kind).replace(/_/g, " ") : "—"}
                  </TableCell>
                  <TableCell className="text-sm max-w-md">
                    <span className="line-clamp-2" title={e.metadata?.reason || ""}>
                      {e.metadata?.reason || "—"}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Workflow, ArrowRight, Plus, Activity, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AutomationModule } from "@/lib/automations";

interface AutomationsTabProps {
  module: AutomationModule;
  entityId?: string;
  entityType?: string;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3 w-3" />,
  running: <Loader2 className="h-3 w-3 animate-spin" />,
  awaiting_approval: <Clock className="h-3 w-3 text-warning" />,
  completed: <CheckCircle2 className="h-3 w-3 text-success" />,
  failed: <XCircle className="h-3 w-3 text-destructive" />,
  rejected: <XCircle className="h-3 w-3 text-destructive" />,
};

export function AutomationsTab({ module, entityId, entityType }: AutomationsTabProps) {
  const { currentOrganization } = useOrganization();

  const { data: workflows = [], refetch: refetchWf } = useQuery({
    queryKey: ["automation-workflows", currentOrganization?.id, module],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data } = await supabase
        .from("automation_workflows")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .eq("module", module)
        .order("priority", { ascending: true });
      return data ?? [];
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: runs = [] } = useQuery({
    queryKey: ["automation-runs", currentOrganization?.id, module, entityId],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      let q = supabase
        .from("automation_runs")
        .select("*, automation_workflows(name)")
        .eq("organization_id", currentOrganization.id)
        .eq("module", module)
        .order("created_at", { ascending: false })
        .limit(20);
      if (entityId) q = q.eq("entity_id", entityId);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!currentOrganization?.id,
  });

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("automation_workflows").update({ is_active: active }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(active ? "Workflow enabled" : "Workflow disabled");
      refetchWf();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Workflow className="h-5 w-5" /> Automations
          </h3>
          <p className="text-sm text-muted-foreground">
            AI-driven workflows triggered on this {module.replace("_", " ")}
            {entityId ? "" : " module"}.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to={`/admin/automations?module=${module}&new=1`}>
            <Plus className="h-4 w-4 mr-2" /> New Automation
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Workflows ({workflows.length})</h4>
            <Button asChild variant="ghost" size="sm">
              <Link to={`/admin/automations?module=${module}`}>
                Manage <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
          {workflows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No automations yet. <Link to={`/admin/automations?module=${module}&new=1`} className="text-primary hover:underline">Create one</Link>.
            </p>
          ) : (
            <div className="space-y-2">
              {workflows.map((w: any) => (
                <div key={w.id} className="flex items-center justify-between gap-2 p-2 rounded border bg-card">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{w.name}</span>
                      <Badge variant="outline" className="text-xs">{w.trigger_event.replace(/_/g, " ")}</Badge>
                    </div>
                    {w.description && (
                      <p className="text-xs text-muted-foreground truncate">{w.description}</p>
                    )}
                  </div>
                  <Switch checked={w.is_active} onCheckedChange={(v) => toggleActive(w.id, v)} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" /> Recent Runs ({runs.length})
            </h4>
          </div>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No runs yet.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {runs.map((r: any) => (
                <div key={r.id} className="flex items-start gap-2 p-2 text-sm border-l-2 border-muted pl-3">
                  <span className="mt-0.5">{STATUS_ICON[r.status] || <Clock className="h-3 w-3" />}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{r.automation_workflows?.name || "Workflow"}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.trigger_event.replace(/_/g, " ")} · step {r.current_step_index}/{r.step_count}
                    </p>
                    {r.error_message && (
                      <p className="text-xs text-destructive truncate">{r.error_message}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(r.created_at), "MMM d HH:mm")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

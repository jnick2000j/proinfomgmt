import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Trash2, Clock, CalendarClock } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

export function ScheduledReportsList() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["scheduled-reports", currentOrganization?.id],
    queryFn: async () => {
      let query = supabase
        .from("scheduled_reports")
        .select("*")
        .order("created_at", { ascending: false });

      if (currentOrganization?.id) {
        query = query.eq("organization_id", currentOrganization.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("scheduled_reports").update({ active }).eq("id", id);
    if (!error) queryClient.invalidateQueries({ queryKey: ["scheduled-reports"] });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("scheduled_reports").delete().eq("id", id);
    if (!error) {
      toast({ title: "Deleted", description: "Schedule removed." });
      queryClient.invalidateQueries({ queryKey: ["scheduled-reports"] });
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading schedules...</div>;
  }

  if (schedules.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <CalendarClock className="h-10 w-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">No scheduled reports yet.</p>
        <p className="text-xs mt-1">Click "Schedule Report" to set up automated delivery.</p>
      </div>
    );
  }

  const freqLabels: Record<string, string> = { daily: "Daily", weekly: "Weekly", biweekly: "Bi-Weekly", monthly: "Monthly" };
  const formatLabels: Record<string, string> = { pdf: "PDF", docx: "Word", xlsx: "Excel", csv: "CSV", txt: "Text", pptx: "PowerPoint" };

  return (
    <div className="space-y-3">
      {schedules.map((s) => (
        <Card key={s.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <CardTitle className="text-sm truncate flex items-center gap-2">
                  {s.title}
                  <Badge variant={s.active ? "default" : "secondary"} className="text-[10px]">
                    {s.active ? "Active" : "Paused"}
                  </Badge>
                </CardTitle>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {freqLabels[s.frequency] || s.frequency}
                  </span>
                  <span>Format: {formatLabels[s.format] || s.format}</span>
                  <span>{(s.recipients as string[]).length} recipient(s)</span>
                  {s.next_run_at && (
                    <span>Next: {new Date(s.next_run_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  checked={s.active}
                  onCheckedChange={(checked) => toggleActive(s.id, checked)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(s.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

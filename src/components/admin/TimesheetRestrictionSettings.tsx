import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useOrgAccessLevel } from "@/hooks/useOrgAccessLevel";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Clock } from "lucide-react";
import { toast } from "sonner";

/**
 * Org admin/owner setting: restrict time logging to tasks the user is
 * assigned to. When enabled, non-admins can only log time on tasks where
 * they are the assignee or appear in task_assignments.
 */
export function TimesheetRestrictionSettings() {
  const { currentOrganization } = useOrganization();
  const { accessLevel } = useOrgAccessLevel();
  const isAdmin = accessLevel === "admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restricted, setRestricted] = useState(false);

  useEffect(() => {
    if (!currentOrganization?.id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("organizations")
        .select("restrict_time_logging_to_assigned_tasks")
        .eq("id", currentOrganization.id)
        .maybeSingle();
      if (!error && data) {
        setRestricted(!!(data as any).restrict_time_logging_to_assigned_tasks);
      }
      setLoading(false);
    })();
  }, [currentOrganization?.id]);

  if (!isAdmin || !currentOrganization?.id) return null;

  const toggle = async (value: boolean) => {
    setSaving(true);
    const prev = restricted;
    setRestricted(value);
    const { error } = await supabase
      .from("organizations")
      .update({ restrict_time_logging_to_assigned_tasks: value } as any)
      .eq("id", currentOrganization.id);
    setSaving(false);
    if (error) {
      setRestricted(prev);
      toast.error(error.message ?? "Failed to update setting");
      return;
    }
    toast.success(
      value
        ? "Users can now only log time on tasks assigned to them"
        : "Users can log time on any task",
    );
  };

  return (
    <Card className="p-6 max-w-2xl">
      <div className="flex items-start gap-3 mb-4">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Clock className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Timesheet restrictions</h3>
          <p className="text-sm text-muted-foreground">
            Control which tasks users may log time against.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label>Restrict time logging to assigned tasks only</Label>
          <p className="text-sm text-muted-foreground">
            When on, members can only log time on tasks they're assigned to.
            Admins and managers are always allowed to log time on any task.
          </p>
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Switch checked={restricted} onCheckedChange={toggle} disabled={saving} />
        )}
      </div>
    </Card>
  );
}

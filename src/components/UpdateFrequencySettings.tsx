import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { Clock, Save } from "lucide-react";

interface UpdateFrequencySettingsProps {
  entityType: "programme" | "project" | "product" | "task";
  entityId: string;
  organizationId?: string | null;
}

export function UpdateFrequencySettings({
  entityType,
  entityId,
  organizationId,
}: UpdateFrequencySettingsProps) {
  const { user } = useAuth();
  const { isAdmin, canManage } = usePermissions();
  const queryClient = useQueryClient();

  const [frequency, setFrequency] = useState("weekly");
  const [customDays, setCustomDays] = useState(14);
  const [reminderHours, setReminderHours] = useState(24);
  const [isMandatory, setIsMandatory] = useState(false);

  const canEdit = isAdmin || canManage(entityType === "programme" ? "programmes" : entityType === "project" ? "projects" : entityType === "product" ? "products" : "work_packages");

  // Fetch org-level default
  const { data: orgDefault } = useQuery({
    queryKey: ["update-frequency-default", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from("update_frequency_settings")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("entity_type", "organisation")
        .is("entity_id", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Fetch entity-level override
  const { data: entitySetting } = useQuery({
    queryKey: ["update-frequency", entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("update_frequency_settings")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Initialize form with entity setting or org default
  useEffect(() => {
    const setting = entitySetting || orgDefault;
    if (setting) {
      setFrequency(setting.frequency);
      setCustomDays(setting.custom_interval_days || 14);
      setReminderHours(setting.reminder_hours_before || 24);
      setIsMandatory(setting.is_mandatory);
    }
  }, [entitySetting, orgDefault]);

  const saveSetting = useMutation({
    mutationFn: async () => {
      const payload = {
        organization_id: organizationId,
        entity_type: entityType,
        entity_id: entityId,
        frequency,
        custom_interval_days: frequency === "custom" ? customDays : null,
        reminder_hours_before: reminderHours,
        is_mandatory: isMandatory,
        created_by: user?.id,
      };

      if (entitySetting) {
        const { error } = await supabase
          .from("update_frequency_settings")
          .update(payload)
          .eq("id", entitySetting.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("update_frequency_settings")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["update-frequency", entityType, entityId] });
      toast({ title: "Saved", description: "Update frequency settings saved." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const effectiveSetting = entitySetting || orgDefault;
  const isUsingDefault = !entitySetting && !!orgDefault;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          Update Frequency
          {isUsingDefault && (
            <Badge variant="outline" className="text-xs">Org Default</Badge>
          )}
          {entitySetting && (
            <Badge variant="secondary" className="text-xs">Custom</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Mandatory Updates</Label>
          <Switch
            checked={isMandatory}
            onCheckedChange={setIsMandatory}
            disabled={!canEdit}
          />
        </div>

        <div className="space-y-2">
          <Label>Frequency</Label>
          <Select value={frequency} onValueChange={setFrequency} disabled={!canEdit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {frequency === "custom" && (
          <div className="space-y-2">
            <Label>Every X days</Label>
            <Input
              type="number"
              min={1}
              value={customDays}
              onChange={(e) => setCustomDays(parseInt(e.target.value) || 1)}
              disabled={!canEdit}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Reminder (hours before due)</Label>
          <Input
            type="number"
            min={1}
            value={reminderHours}
            onChange={(e) => setReminderHours(parseInt(e.target.value) || 1)}
            disabled={!canEdit}
          />
        </div>

        {canEdit && (
          <Button
            size="sm"
            className="w-full gap-2"
            onClick={() => saveSetting.mutate()}
            disabled={saveSetting.isPending}
          >
            <Save className="h-3 w-3" />
            {saveSetting.isPending ? "Saving..." : "Save Settings"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

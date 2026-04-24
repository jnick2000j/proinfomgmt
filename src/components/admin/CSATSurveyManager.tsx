import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, Smile, Star } from "lucide-react";

const TICKET_TYPES = [
  { value: "support", label: "Support" },
  { value: "incident", label: "Incident" },
  { value: "service_request", label: "Service Request" },
  { value: "question", label: "Question" },
  { value: "problem", label: "Problem" },
];

const PRIORITIES = ["low", "medium", "high", "urgent"];

const DEFAULTS = {
  enabled: false,
  intro_text: "How was your support experience?",
  rating_scale: 5,
  rating_label: "How satisfied were you with the support you received?",
  comment_label: "Tell us more about your experience (optional)",
  follow_up_label: "" as string,
  thank_you_message: "Thank you for your feedback!",
  send_delay_hours: 0,
  ticket_types: ["support", "incident", "service_request", "question", "problem"],
  min_priority: "" as string,
};

export function CSATSurveyManager() {
  const { currentOrganization } = useOrganization();
  const qc = useQueryClient();
  const [form, setForm] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);

  const { data: survey, isLoading } = useQuery({
    queryKey: ["csat-survey", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      const { data } = await supabase
        .from("csat_surveys")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: stats } = useQuery({
    queryKey: ["csat-stats", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      const { data } = await supabase
        .from("csat_responses")
        .select("rating, responded_at")
        .eq("organization_id", currentOrganization.id);
      const rows = data ?? [];
      const responded = rows.filter((r: any) => r.responded_at && r.rating);
      const sent = rows.length;
      const avg = responded.length
        ? responded.reduce((s: number, r: any) => s + r.rating, 0) / responded.length
        : 0;
      return { sent, responded: responded.length, avg };
    },
    enabled: !!currentOrganization?.id,
  });

  useEffect(() => {
    if (survey) {
      setForm({
        enabled: survey.enabled,
        intro_text: survey.intro_text,
        rating_scale: survey.rating_scale,
        rating_label: survey.rating_label,
        comment_label: survey.comment_label,
        follow_up_label: survey.follow_up_label ?? "",
        thank_you_message: survey.thank_you_message,
        send_delay_hours: survey.send_delay_hours,
        ticket_types: survey.ticket_types ?? [],
        min_priority: survey.min_priority ?? "",
      });
    }
  }, [survey]);

  const handleSave = async () => {
    if (!currentOrganization?.id) return;
    setSaving(true);
    const payload = {
      organization_id: currentOrganization.id,
      enabled: form.enabled,
      intro_text: form.intro_text,
      rating_scale: form.rating_scale,
      rating_label: form.rating_label,
      comment_label: form.comment_label,
      follow_up_label: form.follow_up_label || null,
      thank_you_message: form.thank_you_message,
      send_delay_hours: form.send_delay_hours,
      ticket_types: form.ticket_types,
      min_priority: form.min_priority || null,
    };
    const { error } = await supabase
      .from("csat_surveys")
      .upsert(payload, { onConflict: "organization_id" });
    setSaving(false);
    if (error) {
      toast.error("Save failed: " + error.message);
      return;
    }
    toast.success("CSAT survey saved");
    qc.invalidateQueries({ queryKey: ["csat-survey", currentOrganization.id] });
  };

  const toggleType = (t: string) => {
    setForm((f) => ({
      ...f,
      ticket_types: f.ticket_types.includes(t)
        ? f.ticket_types.filter((x) => x !== t)
        : [...f.ticket_types, t],
    }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Smile className="h-5 w-5" /> Customer Satisfaction (CSAT)
              </CardTitle>
              <CardDescription>
                Configure the satisfaction survey sent to reporters when their tickets are closed.
              </CardDescription>
            </div>
            {stats && (
              <div className="flex gap-3 text-sm">
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">Sent</p>
                  <p className="font-semibold">{stats.sent}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">Responded</p>
                  <p className="font-semibold">{stats.responded}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">Avg rating</p>
                  <p className="font-semibold flex items-center gap-1 justify-center">
                    {stats.avg ? stats.avg.toFixed(1) : "—"}
                    {stats.avg ? <Star className="h-3 w-3 fill-warning text-warning" /> : null}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-base">Enable CSAT surveys</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, a survey email is sent to the reporter after a ticket is closed.
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Rating scale</Label>
              <Select
                value={String(form.rating_scale)}
                onValueChange={(v) => setForm((f) => ({ ...f, rating_scale: parseInt(v) }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3-point (Bad / OK / Great)</SelectItem>
                  <SelectItem value="5">5-point (1–5 stars)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Send delay (hours after close)</Label>
              <Input
                type="number"
                min={0}
                max={168}
                value={form.send_delay_hours}
                onChange={(e) =>
                  setForm((f) => ({ ...f, send_delay_hours: parseInt(e.target.value || "0") }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Use 0 to send immediately. Max 168 (7 days). Reserved for future scheduling — sends on close today.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email intro</Label>
            <Textarea
              rows={2}
              value={form.intro_text}
              onChange={(e) => setForm((f) => ({ ...f, intro_text: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Rating question</Label>
            <Input
              value={form.rating_label}
              onChange={(e) => setForm((f) => ({ ...f, rating_label: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Comment prompt</Label>
            <Input
              value={form.comment_label}
              onChange={(e) => setForm((f) => ({ ...f, comment_label: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Follow-up question (optional)</Label>
            <Input
              placeholder='e.g. "How could we improve?"'
              value={form.follow_up_label}
              onChange={(e) => setForm((f) => ({ ...f, follow_up_label: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Thank-you message</Label>
            <Textarea
              rows={2}
              value={form.thank_you_message}
              onChange={(e) => setForm((f) => ({ ...f, thank_you_message: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Send for these ticket types</Label>
            <div className="flex flex-wrap gap-3">
              {TICKET_TYPES.map((t) => (
                <label key={t.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.ticket_types.includes(t.value)}
                    onCheckedChange={() => toggleType(t.value)}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Minimum priority (optional)</Label>
            <Select
              value={form.min_priority || "any"}
              onValueChange={(v) => setForm((f) => ({ ...f, min_priority: v === "any" ? "" : v }))}
            >
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any priority</SelectItem>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-2 border-t">
            <Button onClick={handleSave} disabled={saving || isLoading}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save survey"}
            </Button>
          </div>

          {form.enabled && (
            <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
              <Badge variant="outline">Preview</Badge>
              <p className="text-sm">{form.intro_text}</p>
              <p className="text-sm font-medium">{form.rating_label}</p>
              <div className="flex gap-2">
                {Array.from({ length: form.rating_scale }).map((_, i) => (
                  <Star key={i} className="h-6 w-6 text-muted-foreground" />
                ))}
              </div>
              {form.comment_label && (
                <p className="text-xs text-muted-foreground">{form.comment_label}</p>
              )}
              {form.follow_up_label && (
                <p className="text-xs text-muted-foreground">{form.follow_up_label}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

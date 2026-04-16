import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { reportTemplates } from "./ReportTemplates";
import { X } from "lucide-react";

interface ScheduleReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillQuery?: string;
  prefillTitle?: string;
  prefillTemplateKey?: string;
}

export function ScheduleReportDialog({
  open,
  onOpenChange,
  prefillQuery = "",
  prefillTitle = "",
  prefillTemplateKey,
}: ScheduleReportDialogProps) {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(prefillTitle);
  const [query, setQuery] = useState(prefillQuery);
  const [templateKey, setTemplateKey] = useState(prefillTemplateKey || "custom");
  const [frequency, setFrequency] = useState("weekly");
  const [format, setFormat] = useState("pdf");
  const [recipientInput, setRecipientInput] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const handleTemplateChange = (key: string) => {
    setTemplateKey(key);
    if (key !== "custom") {
      const tmpl = reportTemplates.find(t => t.key === key);
      if (tmpl) {
        setTitle(tmpl.title);
        setQuery(tmpl.query);
      }
    }
  };

  const addRecipient = () => {
    const email = recipientInput.trim();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !recipients.includes(email)) {
      setRecipients([...recipients, email]);
      setRecipientInput("");
    }
  };

  const removeRecipient = (email: string) => {
    setRecipients(recipients.filter(r => r !== email));
  };

  const handleSave = async () => {
    if (!title.trim() || !query.trim() || recipients.length === 0) {
      toast({ title: "Missing fields", description: "Please fill in title, query, and at least one recipient.", variant: "destructive" });
      return;
    }
    if (!user) return;

    setSaving(true);
    const { error } = await supabase.from("scheduled_reports").insert({
      title: title.trim(),
      query: query.trim(),
      template_key: templateKey === "custom" ? null : templateKey,
      frequency,
      format,
      recipients,
      organization_id: currentOrganization?.id || null,
      created_by: user.id,
      next_run_at: getNextRunDate(frequency),
    });

    if (error) {
      toast({ title: "Error", description: "Could not schedule report.", variant: "destructive" });
    } else {
      toast({ title: "Scheduled", description: `"${title}" will be generated ${frequency} and sent to ${recipients.length} recipient(s).` });
      queryClient.invalidateQueries({ queryKey: ["scheduled-reports"] });
      onOpenChange(false);
      resetForm();
    }
    setSaving(false);
  };

  const resetForm = () => {
    setTitle("");
    setQuery("");
    setTemplateKey("custom");
    setRecipients([]);
    setRecipientInput("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule Automated Report</DialogTitle>
          <DialogDescription>
            Configure a report to be generated and emailed automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Report Template</Label>
            <Select value={templateKey} onValueChange={handleTemplateChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom Query</SelectItem>
                {reportTemplates.map(t => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.title} ({t.category.toUpperCase()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Monthly Risk Report" />
          </div>

          <div className="space-y-2">
            <Label>Report Query / Instructions</Label>
            <Textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Describe what the report should include..."
              className="min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="docx">Word</SelectItem>
                  <SelectItem value="xlsx">Excel</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="txt">Text</SelectItem>
                  <SelectItem value="pptx">PowerPoint</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Recipients</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="email@company.com"
                value={recipientInput}
                onChange={e => setRecipientInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addRecipient(); } }}
              />
              <Button type="button" variant="outline" onClick={addRecipient}>Add</Button>
            </div>
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {recipients.map(email => (
                  <Badge key={email} variant="secondary" className="gap-1 pr-1">
                    {email}
                    <button onClick={() => removeRecipient(email)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Schedule Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getNextRunDate(frequency: string): string {
  const now = new Date();
  switch (frequency) {
    case "daily":
      now.setDate(now.getDate() + 1);
      now.setHours(8, 0, 0, 0);
      break;
    case "weekly":
      now.setDate(now.getDate() + (7 - now.getDay() + 1) % 7 || 7);
      now.setHours(8, 0, 0, 0);
      break;
    case "biweekly":
      now.setDate(now.getDate() + 14);
      now.setHours(8, 0, 0, 0);
      break;
    case "monthly":
      now.setMonth(now.getMonth() + 1, 1);
      now.setHours(8, 0, 0, 0);
      break;
  }
  return now.toISOString();
}

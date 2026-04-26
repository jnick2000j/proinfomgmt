import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, FileQuestion, ClipboardCheck, NotebookText, ListChecks, GitBranch, Mail, Trash2, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface ConstructionTabProps {
  projectId: string;
  organizationId: string;
}

const PHASE_OPTIONS = [
  { value: "pre_construction", label: "Pre-construction" },
  { value: "design", label: "Design" },
  { value: "procurement", label: "Procurement" },
  { value: "mobilization", label: "Mobilization" },
  { value: "construction", label: "Construction" },
  { value: "commissioning", label: "Commissioning" },
  { value: "closeout", label: "Closeout" },
  { value: "warranty", label: "Warranty" },
];

export function ConstructionTab({ projectId, organizationId }: ConstructionTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Construction Workspace</CardTitle>
        <CardDescription>
          Phase-driven registers — adding a lifecycle phase auto-seeds the matching RFI, submittal, daily log and punch list.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="phases" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="phases" className="gap-1"><GitBranch className="h-4 w-4" /> Lifecycle</TabsTrigger>
            <TabsTrigger value="rfis" className="gap-1"><FileQuestion className="h-4 w-4" /> RFIs</TabsTrigger>
            <TabsTrigger value="submittals" className="gap-1"><ClipboardCheck className="h-4 w-4" /> Submittals</TabsTrigger>
            <TabsTrigger value="daily" className="gap-1"><NotebookText className="h-4 w-4" /> Daily Logs</TabsTrigger>
            <TabsTrigger value="punch" className="gap-1"><ListChecks className="h-4 w-4" /> Punch List</TabsTrigger>
            <TabsTrigger value="report" className="gap-1"><Mail className="h-4 w-4" /> Weekly Report</TabsTrigger>
          </TabsList>

          <TabsContent value="phases">
            <PhasesPanel projectId={projectId} organizationId={organizationId} />
          </TabsContent>
          <TabsContent value="rfis">
            <RegisterPanel
              kind="rfi"
              projectId={projectId}
              organizationId={organizationId}
            />
          </TabsContent>
          <TabsContent value="submittals">
            <RegisterPanel
              kind="submittal"
              projectId={projectId}
              organizationId={organizationId}
            />
          </TabsContent>
          <TabsContent value="daily">
            <RegisterPanel
              kind="daily_log"
              projectId={projectId}
              organizationId={organizationId}
            />
          </TabsContent>
          <TabsContent value="punch">
            <RegisterPanel
              kind="punch"
              projectId={projectId}
              organizationId={organizationId}
            />
          </TabsContent>
          <TabsContent value="report">
            <ReportRecipientsPanel projectId={projectId} organizationId={organizationId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/* ---------- Lifecycle phases ---------- */

function PhasesPanel({ projectId, organizationId }: ConstructionTabProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [phase, setPhase] = useState("design");
  const [notes, setNotes] = useState("");

  const { data: phases = [], isLoading } = useQuery({
    queryKey: ["project-phases", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_lifecycle_phases")
        .select("*")
        .eq("project_id", projectId)
        .order("started_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("project_lifecycle_phases").insert({
        organization_id: organizationId,
        project_id: projectId,
        phase,
        notes: notes || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Phase added — register seed records created automatically");
      qc.invalidateQueries({ queryKey: ["project-phases", projectId] });
      qc.invalidateQueries({ queryKey: ["construction-register"] });
      setAdding(false); setNotes("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const complete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("project_lifecycle_phases")
        .update({ status: "complete", completed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-phases", projectId] }),
  });

  const usedPhases = new Set(phases.map((p: any) => p.phase));
  const available = PHASE_OPTIONS.filter((o) => !usedPhases.has(o.value));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Adding a lifecycle phase automatically seeds the relevant construction registers.
        </p>
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1" disabled={available.length === 0}>
              <Plus className="h-4 w-4" /> Add Phase
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add lifecycle phase</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Phase</Label>
                <Select value={phase} onValueChange={setPhase}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {available.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => add.mutate()} disabled={add.isPending}>Add phase</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {!isLoading && phases.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          No lifecycle phases yet. Add one to auto-create the matching registers.
        </Card>
      )}
      <div className="space-y-2">
        {phases.map((p: any) => (
          <Card key={p.id} className="p-3 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge variant={p.status === "complete" ? "secondary" : "default"}>{p.status}</Badge>
                <span className="font-medium capitalize">{p.phase.replace(/_/g, " ")}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Started {format(new Date(p.started_at), "MMM d, yyyy")}
                {p.completed_at ? ` · Completed ${format(new Date(p.completed_at), "MMM d, yyyy")}` : ""}
              </div>
              {p.notes && <p className="text-xs mt-1">{p.notes}</p>}
            </div>
            {p.status !== "complete" && (
              <Button size="sm" variant="outline" onClick={() => complete.mutate(p.id)}>
                Mark complete
              </Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------- Generic register panel ---------- */

type RegKind = "rfi" | "submittal" | "daily_log" | "punch";

const KIND_META: Record<RegKind, { table: string; emptyMsg: string; addLabel: string; ref: string }> = {
  rfi:        { table: "rfis",            emptyMsg: "No RFIs yet for this project.", addLabel: "Add RFI", ref: "rfi" },
  submittal:  { table: "submittals",      emptyMsg: "No submittals yet.",            addLabel: "Add Submittal", ref: "sub" },
  daily_log:  { table: "daily_logs",      emptyMsg: "No daily logs yet.",            addLabel: "New Daily Log", ref: "log" },
  punch:      { table: "punch_list_items", emptyMsg: "No punch list items yet.",     addLabel: "Add Item", ref: "pl"  },
};

function RegisterPanel({ kind, projectId, organizationId }: { kind: RegKind } & ConstructionTabProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const meta = KIND_META[kind];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["construction-register", kind, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(meta.table as any)
        .select("*")
        .eq("project_id", projectId)
        .order(kind === "daily_log" ? "log_date" : "created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const stamp = `${meta.ref.toUpperCase()}-${Date.now().toString().slice(-6)}`;
      const base: any = { organization_id: organizationId, project_id: projectId };
      let payload: any = base;
      if (kind === "rfi") {
        payload = {
          ...base,
          rfi_number: form.rfi_number || stamp,
          subject: form.subject,
          question: form.question,
          priority: form.priority || "medium",
          due_date: form.due_date || null,
          submitted_by: user?.id ?? null,
        };
      } else if (kind === "submittal") {
        payload = {
          ...base,
          submittal_number: form.submittal_number || stamp,
          title: form.title,
          spec_section: form.spec_section || null,
          description: form.description || null,
          due_date: form.due_date || null,
          submitted_by: user?.id ?? null,
        };
      } else if (kind === "daily_log") {
        payload = {
          ...base,
          log_date: form.log_date || new Date().toISOString().slice(0, 10),
          weather: form.weather || null,
          crew_count: Number(form.crew_count || 0),
          hours_worked: Number(form.hours_worked || 0),
          work_performed: form.work_performed || null,
          delays: form.delays || null,
          safety_incidents: form.safety_incidents || null,
          notes: form.notes || null,
          created_by: user?.id ?? null,
        };
      } else {
        payload = {
          ...base,
          item_number: form.item_number || stamp,
          description: form.description,
          location: form.location || null,
          trade: form.trade || null,
          priority: form.priority || "medium",
          due_date: form.due_date || null,
          identified_by: user?.id ?? null,
        };
      }
      const { error } = await supabase.from(meta.table as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["construction-register", kind, projectId] });
      setOpen(false); setForm({});
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> {meta.addLabel}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{meta.addLabel}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {kind === "rfi" && (
                <>
                  <div><Label>Subject</Label><Input value={form.subject || ""} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
                  <div><Label>Question</Label><Textarea rows={3} value={form.question || ""} onChange={(e) => setForm({ ...form, question: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Priority</Label>
                      <Select value={form.priority || "medium"} onValueChange={(v) => setForm({ ...form, priority: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Due Date</Label><Input type="date" value={form.due_date || ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
                  </div>
                </>
              )}
              {kind === "submittal" && (
                <>
                  <div><Label>Title</Label><Input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                  <div><Label>Spec Section</Label><Input value={form.spec_section || ""} onChange={(e) => setForm({ ...form, spec_section: e.target.value })} /></div>
                  <div><Label>Description</Label><Textarea rows={3} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                  <div><Label>Due Date</Label><Input type="date" value={form.due_date || ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
                </>
              )}
              {kind === "daily_log" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Date</Label><Input type="date" value={form.log_date || ""} onChange={(e) => setForm({ ...form, log_date: e.target.value })} /></div>
                    <div><Label>Weather</Label><Input value={form.weather || ""} onChange={(e) => setForm({ ...form, weather: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Crew</Label><Input type="number" value={form.crew_count || ""} onChange={(e) => setForm({ ...form, crew_count: e.target.value })} /></div>
                    <div><Label>Hours</Label><Input type="number" step="0.5" value={form.hours_worked || ""} onChange={(e) => setForm({ ...form, hours_worked: e.target.value })} /></div>
                  </div>
                  <div><Label>Work Performed</Label><Textarea rows={2} value={form.work_performed || ""} onChange={(e) => setForm({ ...form, work_performed: e.target.value })} /></div>
                  <div><Label>Delays</Label><Textarea rows={2} value={form.delays || ""} onChange={(e) => setForm({ ...form, delays: e.target.value })} /></div>
                  <div><Label>Safety Incidents</Label><Textarea rows={2} value={form.safety_incidents || ""} onChange={(e) => setForm({ ...form, safety_incidents: e.target.value })} /></div>
                </>
              )}
              {kind === "punch" && (
                <>
                  <div><Label>Description</Label><Textarea rows={2} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Location</Label><Input value={form.location || ""} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
                    <div><Label>Trade</Label><Input value={form.trade || ""} onChange={(e) => setForm({ ...form, trade: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Priority</Label>
                      <Select value={form.priority || "medium"} onValueChange={(v) => setForm({ ...form, priority: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Due Date</Label><Input type="date" value={form.due_date || ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && rows.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">{meta.emptyMsg}</Card>
      )}
      <div className="space-y-2">
        {rows.map((r: any) => (
          <Card key={r.id} className="p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  {kind === "rfi" && <span className="font-mono">{r.rfi_number}</span>}
                  {kind === "submittal" && <span className="font-mono">{r.submittal_number}</span>}
                  {kind === "punch" && <span className="font-mono">{r.item_number ?? "—"}</span>}
                  {kind === "daily_log" && <span className="font-mono">{r.log_date}</span>}
                  <Badge variant="outline">{r.status ?? "—"}</Badge>
                  {r.priority && <Badge variant="secondary">{r.priority}</Badge>}
                </div>
                <div className="font-medium text-sm">
                  {r.subject || r.title || r.description || r.work_performed || "Daily log"}
                </div>
                {(r.question || r.description || r.notes || r.delays) && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {r.question || r.description || r.notes || r.delays}
                  </p>
                )}
              </div>
              <div className="text-right text-xs text-muted-foreground shrink-0">
                {r.due_date && <div>Due {format(new Date(r.due_date), "MMM d")}</div>}
                <div>{r.created_at ? format(new Date(r.created_at), "MMM d, yyyy") : ""}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------- Weekly report recipients ---------- */

function ReportRecipientsPanel({ projectId, organizationId }: ConstructionTabProps) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [sending, setSending] = useState(false);

  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ["report-recipients", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_report_recipients")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: log = [] } = useQuery({
    queryKey: ["construction-report-log", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("construction_report_log")
        .select("*")
        .eq("project_id", projectId)
        .order("generated_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!email) throw new Error("Email required");
      const { error } = await supabase.from("project_report_recipients").insert({
        organization_id: organizationId,
        project_id: projectId,
        email: email.trim().toLowerCase(),
        display_name: name || null,
        role: role || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recipient added");
      setEmail(""); setName(""); setRole("");
      qc.invalidateQueries({ queryKey: ["report-recipients", projectId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_report_recipients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-recipients", projectId] }),
  });

  const sendNow = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("weekly-construction-report", {
        body: { project_id: projectId },
      });
      if (error) throw error;
      const result = (data as any)?.results?.[0];
      if (result?.status === "no_recipients") toast.warning("No recipients configured.");
      else if (result?.status === "sent") toast.success(`Sent to ${result.delivered} recipient(s).`);
      else if (result?.status === "partial") toast.warning(`Partial: ${result.delivered} sent, ${result.failed} failed.`);
      else if (result?.status === "failed") toast.error("Send failed — check email configuration.");
      else toast.success("Report dispatched.");
      qc.invalidateQueries({ queryKey: ["construction-report-log", projectId] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Stakeholders below receive an automated weekly progress digest covering RFIs, submittals, daily logs and the punch list.
        </p>
        <Button size="sm" variant="outline" className="gap-1" onClick={sendNow} disabled={sending}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send now
        </Button>
      </div>

      <Card className="p-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Input placeholder="Email *" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Role (Owner, GC...)" value={role} onChange={(e) => setRole(e.target.value)} />
          <Button onClick={() => add.mutate()} disabled={add.isPending || !email}>
            <Plus className="h-4 w-4 mr-1" /> Add recipient
          </Button>
        </div>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && recipients.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground text-sm">No recipients yet.</Card>
      )}
      <div className="space-y-2">
        {recipients.map((r: any) => (
          <Card key={r.id} className="p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium text-sm">{r.display_name || r.email}</div>
              <div className="text-xs text-muted-foreground">
                {r.email}{r.role ? ` · ${r.role}` : ""}
                {r.last_sent_at ? ` · Last sent ${format(new Date(r.last_sent_at), "MMM d, yyyy")}` : " · Not sent yet"}
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </Card>
        ))}
      </div>

      {log.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mt-6 mb-2">Recent reports</h4>
          <div className="space-y-1.5">
            {log.map((l: any) => (
              <div key={l.id} className="text-xs text-muted-foreground flex justify-between border rounded px-2 py-1.5">
                <span>{l.period_start} → {l.period_end}</span>
                <span>
                  <Badge variant={l.status === "sent" ? "default" : l.status === "no_recipients" ? "outline" : "destructive"}>{l.status}</Badge>
                  <span className="ml-2">{l.delivered_count}/{l.recipients_count} delivered</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

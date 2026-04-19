import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LifecycleStepper, Step } from "./LifecycleStepper";
import { Plus, Trash2, ArrowUpCircle, CheckCircle2, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  exceptionId: string;
  exceptionStatus: string;
  severity: string;
  organizationId: string | null;
}

interface LifecycleEvent {
  id: string;
  event_type: string;
  actor_id: string | null;
  notes: string | null;
  metadata: any;
  created_at: string;
}

interface Assessment {
  id: string;
  assessed_by: string | null;
  assessed_at: string;
  impact_summary: string | null;
  options_considered: any;
  recommendation: string | null;
  recommended_option: string | null;
  cost_estimate: number | null;
  time_estimate_days: number | null;
}

const STAGE_ORDER = ["raised", "assessed", "escalated", "resolved"];

export function ExceptionLifecyclePanel({
  exceptionId,
  exceptionStatus,
  severity,
  organizationId,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAssessment, setShowAssessment] = useState(false);
  const [showEscalate, setShowEscalate] = useState(false);
  const [showResolve, setShowResolve] = useState(false);
  const [assessForm, setAssessForm] = useState({
    impact_summary: "",
    recommendation: "",
    recommended_option: "",
    cost_estimate: "",
    time_estimate_days: "",
    options: [""] as string[],
  });
  const [escalateNotes, setEscalateNotes] = useState("");
  const [resolveNotes, setResolveNotes] = useState("");

  const { data: events = [] } = useQuery({
    queryKey: ["exception-events", exceptionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exception_lifecycle_events")
        .select("*")
        .eq("exception_id", exceptionId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as LifecycleEvent[];
    },
    enabled: !!exceptionId,
  });

  const { data: assessments = [] } = useQuery({
    queryKey: ["exception-assessments", exceptionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exception_assessments")
        .select("*")
        .eq("exception_id", exceptionId)
        .order("assessed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Assessment[];
    },
    enabled: !!exceptionId,
  });

  const logEvent = useMutation({
    mutationFn: async ({ event_type, notes, metadata }: { event_type: string; notes?: string; metadata?: any }) => {
      const { error } = await supabase.from("exception_lifecycle_events").insert({
        exception_id: exceptionId,
        event_type,
        actor_id: user?.id,
        notes: notes ?? null,
        metadata: metadata ?? {},
        organization_id: organizationId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exception-events", exceptionId] });
    },
  });

  const submitAssessment = useMutation({
    mutationFn: async () => {
      const { error: aErr } = await supabase.from("exception_assessments").insert({
        exception_id: exceptionId,
        assessed_by: user?.id,
        impact_summary: assessForm.impact_summary || null,
        recommendation: assessForm.recommendation || null,
        recommended_option: assessForm.recommended_option || null,
        cost_estimate: assessForm.cost_estimate ? parseFloat(assessForm.cost_estimate) : null,
        time_estimate_days: assessForm.time_estimate_days ? parseInt(assessForm.time_estimate_days) : null,
        options_considered: assessForm.options.filter((o) => o.trim()),
        organization_id: organizationId,
      });
      if (aErr) throw aErr;

      await supabase.from("exception_lifecycle_events").insert({
        exception_id: exceptionId,
        event_type: "assessed",
        actor_id: user?.id,
        notes: assessForm.recommendation || null,
        organization_id: organizationId,
      });

      await supabase.from("exceptions").update({ status: "under_review" }).eq("id", exceptionId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exception-assessments", exceptionId] });
      qc.invalidateQueries({ queryKey: ["exception-events", exceptionId] });
      qc.invalidateQueries({ queryKey: ["exceptions"] });
      setShowAssessment(false);
      toast.success("Assessment recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const escalate = useMutation({
    mutationFn: async () => {
      await supabase.from("exception_lifecycle_events").insert({
        exception_id: exceptionId,
        event_type: "escalated",
        actor_id: user?.id,
        notes: escalateNotes || null,
        metadata: { severity },
        organization_id: organizationId,
      });
      await supabase
        .from("exceptions")
        .update({
          status: "escalated",
          escalation_date: new Date().toISOString().split("T")[0],
          escalation_notes: escalateNotes || null,
        })
        .eq("id", exceptionId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exception-events", exceptionId] });
      qc.invalidateQueries({ queryKey: ["exceptions"] });
      setShowEscalate(false);
      setEscalateNotes("");
      toast.success("Exception escalated");
    },
  });

  const resolve = useMutation({
    mutationFn: async () => {
      await supabase.from("exception_lifecycle_events").insert({
        exception_id: exceptionId,
        event_type: "resolved",
        actor_id: user?.id,
        notes: resolveNotes || null,
        organization_id: organizationId,
      });
      await supabase
        .from("exceptions")
        .update({
          status: "resolved",
          resolution: resolveNotes || null,
          resolution_date: new Date().toISOString().split("T")[0],
          resolved_by: user?.id,
        })
        .eq("id", exceptionId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exception-events", exceptionId] });
      qc.invalidateQueries({ queryKey: ["exceptions"] });
      setShowResolve(false);
      setResolveNotes("");
      toast.success("Exception resolved");
    },
  });

  // Compute lifecycle steps
  const reachedStages = new Set<string>(["raised"]);
  events.forEach((e) => reachedStages.add(e.event_type));
  if (exceptionStatus === "resolved" || exceptionStatus === "closed") reachedStages.add("resolved");
  if (exceptionStatus === "escalated") reachedStages.add("escalated");
  if (exceptionStatus === "under_review" || assessments.length > 0) reachedStages.add("assessed");

  const currentIdx = STAGE_ORDER.findIndex((s) => {
    if (exceptionStatus === "resolved" || exceptionStatus === "closed") return s === "resolved";
    if (exceptionStatus === "escalated") return s === "escalated";
    if (exceptionStatus === "under_review" || assessments.length > 0) return s === "assessed";
    return s === "raised";
  });

  const steps: Step[] = STAGE_ORDER.map((key, i) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    status:
      i < currentIdx ? "complete" : i === currentIdx ? "current" : "pending",
  }));

  const isResolved = exceptionStatus === "resolved" || exceptionStatus === "closed";
  const recommendsEscalation = severity === "high" || severity === "critical";

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold mb-2">Lifecycle</h4>
        <LifecycleStepper steps={steps} />
        {recommendsEscalation && exceptionStatus !== "escalated" && !isResolved && (
          <p className="text-xs text-warning mt-2 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Severity {severity} — escalation recommended
          </p>
        )}
      </div>

      {/* Quick action buttons */}
      {!isResolved && (
        <div className="flex flex-wrap gap-2">
          {!showAssessment && assessments.length === 0 && (
            <Button size="sm" variant="outline" onClick={() => setShowAssessment(true)}>
              <FileText className="h-3.5 w-3.5 mr-1" />
              Record assessment
            </Button>
          )}
          {!showEscalate && exceptionStatus !== "escalated" && (
            <Button size="sm" variant="outline" onClick={() => setShowEscalate(true)}>
              <ArrowUpCircle className="h-3.5 w-3.5 mr-1" />
              Escalate
            </Button>
          )}
          {!showResolve && (
            <Button size="sm" variant="outline" onClick={() => setShowResolve(true)}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Resolve
            </Button>
          )}
        </div>
      )}

      {/* Assessment form */}
      {showAssessment && (
        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <h5 className="text-sm font-medium">New assessment</h5>
          <div>
            <Label className="text-xs">Impact summary</Label>
            <Textarea
              rows={2}
              value={assessForm.impact_summary}
              onChange={(e) => setAssessForm({ ...assessForm, impact_summary: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Options considered</Label>
            {assessForm.options.map((opt, i) => (
              <div key={i} className="flex gap-2 mb-1">
                <Input
                  value={opt}
                  placeholder={`Option ${i + 1}`}
                  onChange={(e) => {
                    const next = [...assessForm.options];
                    next[i] = e.target.value;
                    setAssessForm({ ...assessForm, options: next });
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setAssessForm({
                      ...assessForm,
                      options: assessForm.options.filter((_, idx) => idx !== i),
                    });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setAssessForm({ ...assessForm, options: [...assessForm.options, ""] })
              }
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add option
            </Button>
          </div>
          <div>
            <Label className="text-xs">Recommended option</Label>
            <Input
              value={assessForm.recommended_option}
              onChange={(e) =>
                setAssessForm({ ...assessForm, recommended_option: e.target.value })
              }
            />
          </div>
          <div>
            <Label className="text-xs">Recommendation</Label>
            <Textarea
              rows={2}
              value={assessForm.recommendation}
              onChange={(e) =>
                setAssessForm({ ...assessForm, recommendation: e.target.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Cost estimate</Label>
              <Input
                type="number"
                value={assessForm.cost_estimate}
                onChange={(e) =>
                  setAssessForm({ ...assessForm, cost_estimate: e.target.value })
                }
              />
            </div>
            <div>
              <Label className="text-xs">Time impact (days)</Label>
              <Input
                type="number"
                value={assessForm.time_estimate_days}
                onChange={(e) =>
                  setAssessForm({ ...assessForm, time_estimate_days: e.target.value })
                }
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => submitAssessment.mutate()}>Save assessment</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAssessment(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {showEscalate && (
        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <h5 className="text-sm font-medium">Escalate</h5>
          <Textarea
            rows={2}
            placeholder="Escalation rationale"
            value={escalateNotes}
            onChange={(e) => setEscalateNotes(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => escalate.mutate()}>Escalate</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowEscalate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {showResolve && (
        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <h5 className="text-sm font-medium">Resolve</h5>
          <Textarea
            rows={2}
            placeholder="Resolution summary (will also be saved on the exception)"
            value={resolveNotes}
            onChange={(e) => setResolveNotes(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => resolve.mutate()}>Mark resolved</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowResolve(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Assessments history */}
      {assessments.length > 0 && (
        <div>
          <h5 className="text-sm font-medium mb-2">Assessments</h5>
          <div className="space-y-2">
            {assessments.map((a) => (
              <div key={a.id} className="rounded-md border border-border bg-card p-3 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">
                    Assessed {format(new Date(a.assessed_at), "PP")}
                  </span>
                  {a.recommended_option && (
                    <Badge variant="outline" className="text-xs">
                      → {a.recommended_option}
                    </Badge>
                  )}
                </div>
                {a.impact_summary && <p className="mb-1"><strong>Impact:</strong> {a.impact_summary}</p>}
                {Array.isArray(a.options_considered) && a.options_considered.length > 0 && (
                  <div className="mb-1">
                    <strong>Options:</strong>
                    <ul className="list-disc ml-4">
                      {a.options_considered.map((o: string, i: number) => (
                        <li key={i}>{o}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {a.recommendation && (
                  <p className="mb-1"><strong>Recommendation:</strong> {a.recommendation}</p>
                )}
                {(a.cost_estimate != null || a.time_estimate_days != null) && (
                  <p className="text-muted-foreground">
                    {a.cost_estimate != null && <>Cost: {a.cost_estimate} </>}
                    {a.time_estimate_days != null && <>· Time: {a.time_estimate_days} days</>}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lifecycle event log */}
      {events.length > 0 && (
        <div>
          <h5 className="text-sm font-medium mb-2">Event log</h5>
          <div className="space-y-1">
            {events.map((e) => (
              <div key={e.id} className="text-xs flex items-start gap-2">
                <Badge variant="outline" className="text-xs uppercase">{e.event_type}</Badge>
                <div className="flex-1 min-w-0">
                  <span className="text-muted-foreground">
                    {format(new Date(e.created_at), "PPp")}
                  </span>
                  {e.notes && <p>{e.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

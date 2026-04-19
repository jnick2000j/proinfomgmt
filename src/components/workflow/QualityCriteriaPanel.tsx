import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, CheckCircle2, XCircle, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  workPackageId?: string;
  projectId?: string;
  programmeId?: string;
  productId?: string;
  organizationId: string | null;
}

interface Criterion {
  id: string;
  criterion: string;
  acceptance_test: string | null;
  tolerance: string | null;
  method: string | null;
  priority: string;
  status: string;
}

interface Review {
  id: string;
  quality_criteria_id: string;
  reviewer_id: string | null;
  reviewed_at: string;
  result: "pass" | "fail" | "conditional";
  findings: string | null;
  conditions: string | null;
}

const statusMeta: Record<string, { label: string; cls: string; icon: any }> = {
  defined: { label: "Defined", cls: "bg-muted text-muted-foreground", icon: Clock },
  in_review: { label: "In review", cls: "bg-primary/15 text-primary", icon: Clock },
  passed: { label: "Passed", cls: "bg-success/20 text-success", icon: CheckCircle2 },
  failed: { label: "Failed", cls: "bg-destructive/20 text-destructive", icon: XCircle },
  waived: { label: "Waived", cls: "bg-muted text-muted-foreground", icon: AlertTriangle },
};

export function QualityCriteriaPanel({
  workPackageId,
  projectId,
  programmeId,
  productId,
  organizationId,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [newC, setNewC] = useState({
    criterion: "",
    acceptance_test: "",
    tolerance: "",
    method: "",
    priority: "medium",
  });
  const [reviewForm, setReviewForm] = useState({ result: "pass", findings: "", conditions: "" });

  const queryKey = ["quality-criteria", workPackageId, projectId, programmeId, productId];

  const { data: criteria = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase.from("quality_criteria").select("*").order("created_at");
      if (workPackageId) q = q.eq("work_package_id", workPackageId);
      else if (projectId) q = q.eq("project_id", projectId);
      else if (programmeId) q = q.eq("programme_id", programmeId);
      else if (productId) q = q.eq("product_id", productId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Criterion[];
    },
    enabled: !!(workPackageId || projectId || programmeId || productId),
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["quality-reviews", criteria.map((c) => c.id).join(",")],
    queryFn: async () => {
      if (!criteria.length) return [];
      const { data, error } = await supabase
        .from("quality_reviews")
        .select("*")
        .in("quality_criteria_id", criteria.map((c) => c.id))
        .order("reviewed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Review[];
    },
    enabled: criteria.length > 0,
  });

  const addCriterion = useMutation({
    mutationFn: async () => {
      if (!newC.criterion.trim()) throw new Error("Criterion text required");
      const { error } = await supabase.from("quality_criteria").insert({
        work_package_id: workPackageId ?? null,
        project_id: projectId ?? null,
        programme_id: programmeId ?? null,
        product_id: productId ?? null,
        criterion: newC.criterion.trim(),
        acceptance_test: newC.acceptance_test || null,
        tolerance: newC.tolerance || null,
        method: newC.method || null,
        priority: newC.priority,
        organization_id: organizationId,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setAdding(false);
      setNewC({ criterion: "", acceptance_test: "", tolerance: "", method: "", priority: "medium" });
      toast.success("Criterion added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeCriterion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quality_criteria").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const submitReview = useMutation({
    mutationFn: async (criterionId: string) => {
      const newStatus =
        reviewForm.result === "pass"
          ? "passed"
          : reviewForm.result === "fail"
          ? "failed"
          : "in_review";
      const { error: rErr } = await supabase.from("quality_reviews").insert({
        quality_criteria_id: criterionId,
        reviewer_id: user?.id,
        result: reviewForm.result,
        findings: reviewForm.findings || null,
        conditions: reviewForm.conditions || null,
        organization_id: organizationId,
      });
      if (rErr) throw rErr;
      await supabase.from("quality_criteria").update({ status: newStatus }).eq("id", criterionId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["quality-reviews"] });
      setReviewingId(null);
      setReviewForm({ result: "pass", findings: "", conditions: "" });
      toast.success("Review recorded");
    },
  });

  const passed = criteria.filter((c) => c.status === "passed").length;
  const failed = criteria.filter((c) => c.status === "failed").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">Quality criteria</h4>
          <p className="text-xs text-muted-foreground">
            {criteria.length} defined · {passed} passed · {failed} failed
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {criteria.map((c) => {
          const Icon = statusMeta[c.status]?.icon ?? Clock;
          const cReviews = reviews.filter((r) => r.quality_criteria_id === c.id);
          return (
            <div key={c.id} className="rounded-md border border-border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{c.criterion}</span>
                    <Badge className={statusMeta[c.status]?.cls + " text-xs"}>
                      <Icon className="h-3 w-3 mr-1" />
                      {statusMeta[c.status]?.label ?? c.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs">{c.priority}</Badge>
                  </div>
                  {c.acceptance_test && <p className="text-xs mt-1"><strong>Test:</strong> {c.acceptance_test}</p>}
                  {(c.tolerance || c.method) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {c.tolerance && <>Tolerance: {c.tolerance} </>}
                      {c.method && <>· Method: {c.method}</>}
                    </p>
                  )}
                </div>
                <Button size="icon" variant="ghost" onClick={() => removeCriterion.mutate(c.id)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>

              {cReviews.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-border">
                  {cReviews.slice(0, 3).map((r) => (
                    <div key={r.id} className="text-xs">
                      <Badge
                        className={
                          r.result === "pass"
                            ? "bg-success/20 text-success text-xs mr-2"
                            : r.result === "fail"
                            ? "bg-destructive/20 text-destructive text-xs mr-2"
                            : "bg-warning/20 text-warning text-xs mr-2"
                        }
                      >
                        {r.result}
                      </Badge>
                      <span className="text-muted-foreground">{format(new Date(r.reviewed_at), "PPp")}</span>
                      {r.findings && <p className="ml-2">{r.findings}</p>}
                    </div>
                  ))}
                </div>
              )}

              {reviewingId === c.id ? (
                <div className="space-y-2 pt-2 border-t border-border">
                  <Select
                    value={reviewForm.result}
                    onValueChange={(v) => setReviewForm({ ...reviewForm, result: v })}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pass">Pass</SelectItem>
                      <SelectItem value="fail">Fail</SelectItem>
                      <SelectItem value="conditional">Conditional</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea
                    rows={2}
                    placeholder="Findings"
                    value={reviewForm.findings}
                    onChange={(e) => setReviewForm({ ...reviewForm, findings: e.target.value })}
                  />
                  {reviewForm.result === "conditional" && (
                    <Textarea
                      rows={2}
                      placeholder="Conditions"
                      value={reviewForm.conditions}
                      onChange={(e) => setReviewForm({ ...reviewForm, conditions: e.target.value })}
                    />
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => submitReview.mutate(c.id)}>Submit</Button>
                    <Button size="sm" variant="ghost" onClick={() => setReviewingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setReviewingId(c.id)}>
                  Add review
                </Button>
              )}
            </div>
          );
        })}

        {criteria.length === 0 && (
          <p className="text-xs text-muted-foreground italic px-1">No criteria defined yet.</p>
        )}
      </div>

      {adding ? (
        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <div>
            <Label className="text-xs">Criterion</Label>
            <Input
              value={newC.criterion}
              onChange={(e) => setNewC({ ...newC, criterion: e.target.value })}
              placeholder="e.g. All API endpoints return 200 within 500ms"
            />
          </div>
          <div>
            <Label className="text-xs">Acceptance test</Label>
            <Textarea
              rows={2}
              value={newC.acceptance_test}
              onChange={(e) => setNewC({ ...newC, acceptance_test: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Tolerance</Label>
              <Input value={newC.tolerance} onChange={(e) => setNewC({ ...newC, tolerance: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Method</Label>
              <Input value={newC.method} onChange={(e) => setNewC({ ...newC, method: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={newC.priority} onValueChange={(v) => setNewC({ ...newC, priority: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => addCriterion.mutate()}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add criterion
        </Button>
      )}
    </div>
  );
}

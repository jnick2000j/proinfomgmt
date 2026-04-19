import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  MinusCircle,
  Plus,
  Trash2,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  stageGateId: string;
  organizationId: string | null;
}

interface ApprovalRow {
  id: string;
  reviewer_id: string;
  reviewer_role: string | null;
  decision: "pending" | "approve" | "reject" | "abstain" | "conditional";
  comments: string | null;
  conditions: string | null;
  signed_at: string | null;
  is_required: boolean;
}

interface OrgUser {
  user_id: string;
  full_name: string | null;
  email: string;
}

const decisionMeta: Record<ApprovalRow["decision"], { label: string; icon: any; cls: string }> = {
  pending: { label: "Pending", icon: Clock, cls: "bg-muted text-muted-foreground" },
  approve: { label: "Approved", icon: CheckCircle2, cls: "bg-success/20 text-success" },
  reject: { label: "Rejected", icon: XCircle, cls: "bg-destructive/20 text-destructive" },
  abstain: { label: "Abstained", icon: MinusCircle, cls: "bg-muted text-muted-foreground" },
  conditional: { label: "Conditional", icon: AlertTriangle, cls: "bg-warning/20 text-warning" },
};

export function ApprovalMatrix({ stageGateId, organizationId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newReviewer, setNewReviewer] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newRequired, setNewRequired] = useState(true);
  const [decisionForms, setDecisionForms] = useState<Record<string, { decision: string; comments: string; conditions: string }>>({});

  const { data: approvals = [] } = useQuery({
    queryKey: ["gate-approvals", stageGateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_gate_approvals")
        .select("*")
        .eq("stage_gate_id", stageGateId);
      if (error) throw error;
      return (data ?? []) as ApprovalRow[];
    },
    enabled: !!stageGateId,
  });

  const { data: orgUsers = [] } = useQuery({
    queryKey: ["org-users", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("user_organization_access")
        .select("user_id, profiles!inner(full_name, email)")
        .eq("organization_id", organizationId);
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        user_id: row.user_id,
        full_name: row.profiles?.full_name,
        email: row.profiles?.email,
      })) as OrgUser[];
    },
    enabled: !!organizationId,
  });

  const addReviewer = useMutation({
    mutationFn: async () => {
      if (!newReviewer) throw new Error("Pick a reviewer");
      const { error } = await supabase.from("stage_gate_approvals").insert({
        stage_gate_id: stageGateId,
        reviewer_id: newReviewer,
        reviewer_role: newRole || null,
        is_required: newRequired,
        organization_id: organizationId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gate-approvals", stageGateId] });
      setAddOpen(false);
      setNewReviewer("");
      setNewRole("");
      setNewRequired(true);
      toast.success("Reviewer added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeReviewer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stage_gate_approvals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gate-approvals", stageGateId] }),
  });

  const submitDecision = useMutation({
    mutationFn: async ({ id, decision, comments, conditions }: { id: string; decision: string; comments: string; conditions: string }) => {
      const { error } = await supabase
        .from("stage_gate_approvals")
        .update({
          decision,
          comments: comments || null,
          conditions: conditions || null,
          signed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gate-approvals", stageGateId] });
      toast.success("Decision recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const userName = (uid: string) => {
    const u = orgUsers.find((o) => o.user_id === uid);
    return u?.full_name || u?.email || uid.slice(0, 8);
  };

  const requiredCount = approvals.filter((a) => a.is_required).length;
  const requiredApproved = approvals.filter(
    (a) => a.is_required && (a.decision === "approve" || a.decision === "conditional"),
  ).length;
  const anyRejected = approvals.some((a) => a.decision === "reject");
  const allRequiredSigned = requiredCount > 0 && requiredApproved === requiredCount && !anyRejected;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">Reviewer sign-off</h4>
          <p className="text-xs text-muted-foreground">
            {requiredCount > 0
              ? `${requiredApproved}/${requiredCount} required reviewers signed off`
              : "Add reviewers to start the approval process"}
          </p>
        </div>
        {allRequiredSigned && (
          <Badge className="bg-success/20 text-success">All required approvals received</Badge>
        )}
        {anyRejected && <Badge className="bg-destructive/20 text-destructive">Rejected</Badge>}
      </div>

      <div className="space-y-2">
        {approvals.map((a) => {
          const Icon = decisionMeta[a.decision].icon;
          const isMe = a.reviewer_id === user?.id;
          const form = decisionForms[a.id] ?? {
            decision: a.decision === "pending" ? "approve" : a.decision,
            comments: a.comments ?? "",
            conditions: a.conditions ?? "",
          };
          return (
            <div key={a.id} className="rounded-md border border-border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <UserCheck className="h-4 w-4 text-muted-foreground mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{userName(a.reviewer_id)}</span>
                      {a.reviewer_role && (
                        <span className="text-xs text-muted-foreground">· {a.reviewer_role}</span>
                      )}
                      {a.is_required && <Badge variant="outline" className="text-xs">Required</Badge>}
                      <Badge className={decisionMeta[a.decision].cls + " text-xs"}>
                        <Icon className="h-3 w-3 mr-1" />
                        {decisionMeta[a.decision].label}
                      </Badge>
                    </div>
                    {a.signed_at && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Signed {format(new Date(a.signed_at), "PPp")}
                      </p>
                    )}
                    {a.comments && <p className="text-xs mt-1">{a.comments}</p>}
                    {a.conditions && (
                      <p className="text-xs mt-1 text-warning">
                        <strong>Conditions:</strong> {a.conditions}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeReviewer.mutate(a.id)}
                  aria-label="Remove reviewer"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>

              {isMe && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground">Your decision</p>
                  <div className="flex gap-2">
                    <Select
                      value={form.decision}
                      onValueChange={(v) =>
                        setDecisionForms((p) => ({ ...p, [a.id]: { ...form, decision: v } }))
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="approve">Approve</SelectItem>
                        <SelectItem value="conditional">Conditional</SelectItem>
                        <SelectItem value="reject">Reject</SelectItem>
                        <SelectItem value="abstain">Abstain</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={() =>
                        submitDecision.mutate({
                          id: a.id,
                          decision: form.decision,
                          comments: form.comments,
                          conditions: form.conditions,
                        })
                      }
                    >
                      {a.signed_at ? "Update" : "Sign off"}
                    </Button>
                  </div>
                  <Textarea
                    rows={2}
                    placeholder="Comments"
                    value={form.comments}
                    onChange={(e) =>
                      setDecisionForms((p) => ({
                        ...p,
                        [a.id]: { ...form, comments: e.target.value },
                      }))
                    }
                  />
                  {form.decision === "conditional" && (
                    <Textarea
                      rows={2}
                      placeholder="Conditions that must be met"
                      value={form.conditions}
                      onChange={(e) =>
                        setDecisionForms((p) => ({
                          ...p,
                          [a.id]: { ...form, conditions: e.target.value },
                        }))
                      }
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}

        {approvals.length === 0 && (
          <p className="text-xs text-muted-foreground italic px-1">No reviewers assigned yet.</p>
        )}
      </div>

      {addOpen ? (
        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <div>
            <Label className="text-xs">Reviewer</Label>
            <Select value={newReviewer} onValueChange={setNewReviewer}>
              <SelectTrigger>
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {orgUsers.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.full_name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Role (optional)</Label>
            <Input
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              placeholder="e.g. Sponsor, Senior User"
            />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={newRequired}
              onChange={(e) => setNewRequired(e.target.checked)}
            />
            Required for approval
          </label>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => addReviewer.mutate()}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add reviewer
        </Button>
      )}
    </div>
  );
}

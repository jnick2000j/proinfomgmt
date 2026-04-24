import { supabase } from "@/integrations/supabase/client";

export type AutomationModule =
  | "project" | "programme" | "product"
  | "risk" | "issue" | "benefit" | "change" | "exception" | "lesson"
  | "task" | "milestone" | "stakeholder"
  | "quality" | "kb_article" | "helpdesk";

export type AutomationTriggerEvent =
  | "created" | "updated" | "deleted"
  | "status_changed" | "priority_changed" | "owner_changed" | "assigned"
  | "field_changed" | "due_date_approaching" | "overdue"
  | "approval_requested" | "comment_added" | "manual";

export const AUTOMATION_MODULES: { key: AutomationModule; label: string }[] = [
  { key: "project", label: "Projects" },
  { key: "programme", label: "Programmes" },
  { key: "product", label: "Products" },
  { key: "risk", label: "Risks" },
  { key: "issue", label: "Issues" },
  { key: "benefit", label: "Benefits" },
  { key: "change", label: "Change Management" },
  { key: "exception", label: "Exceptions" },
  { key: "lesson", label: "Lessons Learned" },
  { key: "task", label: "Tasks" },
  { key: "milestone", label: "Milestones" },
  { key: "stakeholder", label: "Stakeholders" },
  { key: "quality", label: "Quality" },
  { key: "kb_article", label: "Knowledgebase" },
  { key: "helpdesk", label: "Helpdesk" },
];

export const AUTOMATION_TRIGGERS: { key: AutomationTriggerEvent; label: string }[] = [
  { key: "created", label: "Item created" },
  { key: "updated", label: "Item updated" },
  { key: "status_changed", label: "Status changed" },
  { key: "priority_changed", label: "Priority changed" },
  { key: "owner_changed", label: "Owner changed" },
  { key: "assigned", label: "Assigned" },
  { key: "field_changed", label: "Field changed" },
  { key: "due_date_approaching", label: "Due date approaching" },
  { key: "overdue", label: "Overdue" },
  { key: "approval_requested", label: "Approval requested" },
  { key: "comment_added", label: "Comment / update added" },
  { key: "manual", label: "Manual trigger" },
];

export const AUTOMATION_STEP_TYPES: { key: string; label: string; group: string }[] = [
  { key: "condition", label: "Condition / branch", group: "Logic" },
  { key: "ai_analyze", label: "AI analyze", group: "AI" },
  { key: "ai_triage", label: "AI triage / categorize", group: "AI" },
  { key: "ai_summarize", label: "AI summarize", group: "AI" },
  { key: "ai_draft", label: "AI draft text", group: "AI" },
  { key: "ai_sentiment", label: "AI sentiment", group: "AI" },
  { key: "ai_score", label: "AI score / risk-rate", group: "AI" },
  { key: "ai_suggest", label: "AI suggest next steps", group: "AI" },
  { key: "set_field", label: "Update field", group: "Data" },
  { key: "assign", label: "Assign owner", group: "Data" },
  { key: "add_tag", label: "Add tag", group: "Data" },
  { key: "log_note", label: "Log note / update", group: "Data" },
  { key: "create_task", label: "Create task", group: "Data" },
  { key: "notify", label: "Notify users", group: "Comms" },
  { key: "send_email", label: "Send email", group: "Comms" },
  { key: "request_approval", label: "Request human approval", group: "Approval" },
];

export function dispatchAutomation(args: {
  organization_id: string;
  module: AutomationModule;
  trigger_event: AutomationTriggerEvent;
  entity_type?: string;
  entity_id?: string;
  payload?: Record<string, unknown>;
  triggered_by?: string;
}) {
  // Fire-and-forget; engine handles match + run
  supabase.functions
    .invoke("automation-runner/dispatch", { body: args })
    .catch((e) => console.warn("automation dispatch failed", e));
}

export async function decideApproval(approval_id: string, decision: "approved" | "rejected", comment?: string) {
  const { data, error } = await supabase.functions.invoke("automation-approve", {
    body: { approval_id, decision, comment },
  });
  if (error) throw error;
  return data;
}

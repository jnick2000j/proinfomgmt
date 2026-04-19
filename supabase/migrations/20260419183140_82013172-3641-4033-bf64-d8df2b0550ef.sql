-- Generic workflow approvals table (Approver / Verifier roles)
CREATE TABLE public.workflow_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('stage_gate','change_request','milestone','exception','quality_review')),
  entity_id UUID NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL,
  reviewer_role TEXT,
  approval_role TEXT NOT NULL DEFAULT 'approver' CHECK (approval_role IN ('approver','verifier')),
  is_required BOOLEAN NOT NULL DEFAULT true,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','approve','reject','abstain','conditional','verified','rejected_verification')),
  comments TEXT,
  conditions TEXT,
  signed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_approvals_entity ON public.workflow_approvals(entity_type, entity_id);
CREATE INDEX idx_workflow_approvals_org ON public.workflow_approvals(organization_id);
CREATE INDEX idx_workflow_approvals_reviewer ON public.workflow_approvals(reviewer_id);

ALTER TABLE public.workflow_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view workflow approvals"
  ON public.workflow_approvals FOR SELECT
  USING (organization_id IS NULL OR public.has_org_access(auth.uid(), organization_id, 'viewer'));

CREATE POLICY "Org editors insert workflow approvals"
  ON public.workflow_approvals FOR INSERT
  WITH CHECK (organization_id IS NULL OR public.has_org_access(auth.uid(), organization_id, 'editor'));

CREATE POLICY "Reviewer or editor updates workflow approvals"
  ON public.workflow_approvals FOR UPDATE
  USING (reviewer_id = auth.uid() OR public.has_org_access(auth.uid(), organization_id, 'editor'));

CREATE POLICY "Org editors delete workflow approvals"
  ON public.workflow_approvals FOR DELETE
  USING (organization_id IS NULL OR public.has_org_access(auth.uid(), organization_id, 'editor'));

CREATE TRIGGER trg_workflow_approvals_updated
  BEFORE UPDATE ON public.workflow_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Generic workflow evidence table
CREATE TABLE public.workflow_evidence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('stage_gate','change_request','milestone','exception','quality_review')),
  entity_id UUID NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  evidence_label TEXT NOT NULL,
  description TEXT,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  attested_by UUID,
  attested_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_evidence_entity ON public.workflow_evidence(entity_type, entity_id);
CREATE INDEX idx_workflow_evidence_org ON public.workflow_evidence(organization_id);

ALTER TABLE public.workflow_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view workflow evidence"
  ON public.workflow_evidence FOR SELECT
  USING (organization_id IS NULL OR public.has_org_access(auth.uid(), organization_id, 'viewer'));

CREATE POLICY "Org editors insert workflow evidence"
  ON public.workflow_evidence FOR INSERT
  WITH CHECK (organization_id IS NULL OR public.has_org_access(auth.uid(), organization_id, 'editor'));

CREATE POLICY "Org editors update workflow evidence"
  ON public.workflow_evidence FOR UPDATE
  USING (organization_id IS NULL OR public.has_org_access(auth.uid(), organization_id, 'editor'));

CREATE POLICY "Org editors delete workflow evidence"
  ON public.workflow_evidence FOR DELETE
  USING (organization_id IS NULL OR public.has_org_access(auth.uid(), organization_id, 'editor'));

-- Add approver / verifier columns where missing
ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS approver_id UUID,
  ADD COLUMN IF NOT EXISTS verifier_id UUID,
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending','submitted','approved','rejected','verified'));

ALTER TABLE public.change_requests
  ADD COLUMN IF NOT EXISTS approver_id UUID,
  ADD COLUMN IF NOT EXISTS verifier_id UUID;

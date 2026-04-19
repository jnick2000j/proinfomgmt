
-- =========================================================
-- Governance Reports
-- =========================================================
CREATE TABLE public.governance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN ('highlight', 'end_stage', 'programme_status')),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('programme', 'project')),
  scope_id UUID NOT NULL,
  title TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'published', 'archived')),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,  -- structured sections: summary, progress, risks, issues, next_period, etc.
  ai_model TEXT,
  ai_prompt_version TEXT,
  generated_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_governance_reports_org ON public.governance_reports(organization_id);
CREATE INDEX idx_governance_reports_scope ON public.governance_reports(scope_type, scope_id);
CREATE INDEX idx_governance_reports_status ON public.governance_reports(status);

ALTER TABLE public.governance_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view governance reports"
  ON public.governance_reports FOR SELECT
  USING (
    public.has_org_access(auth.uid(), organization_id, 'viewer')
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Org managers can create governance reports"
  ON public.governance_reports FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND (public.has_org_access(auth.uid(), organization_id, 'manager') OR public.is_admin(auth.uid()))
  );

CREATE POLICY "Org managers can update governance reports"
  ON public.governance_reports FOR UPDATE
  USING (
    public.has_org_access(auth.uid(), organization_id, 'manager')
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Org admins can delete governance reports"
  ON public.governance_reports FOR DELETE
  USING (
    public.has_org_access(auth.uid(), organization_id, 'admin')
    OR public.is_admin(auth.uid())
  );

CREATE TRIGGER governance_reports_updated_at
  BEFORE UPDATE ON public.governance_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Compliance Scores
-- =========================================================
CREATE TABLE public.compliance_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('programme', 'project', 'organization')),
  scope_id UUID NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  controls_score INTEGER NOT NULL DEFAULT 0 CHECK (controls_score BETWEEN 0 AND 100),
  cadence_score INTEGER NOT NULL DEFAULT 0 CHECK (cadence_score BETWEEN 0 AND 100),
  hygiene_score INTEGER NOT NULL DEFAULT 0 CHECK (hygiene_score BETWEEN 0 AND 100),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,  -- per-check pass/fail breakdown
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_scores_org ON public.compliance_scores(organization_id);
CREATE INDEX idx_compliance_scores_scope ON public.compliance_scores(scope_type, scope_id, computed_at DESC);

ALTER TABLE public.compliance_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view compliance scores"
  ON public.compliance_scores FOR SELECT
  USING (
    public.has_org_access(auth.uid(), organization_id, 'viewer')
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "System and admins can insert compliance scores"
  ON public.compliance_scores FOR INSERT
  WITH CHECK (
    public.has_org_access(auth.uid(), organization_id, 'manager')
    OR public.is_admin(auth.uid())
  );

-- =========================================================
-- Comms Packs
-- =========================================================
CREATE TABLE public.comms_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  governance_report_id UUID REFERENCES public.governance_reports(id) ON DELETE SET NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('programme', 'project')),
  scope_id UUID NOT NULL,
  title TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  email_html TEXT,
  email_subject TEXT,
  slack_markdown TEXT,
  pdf_summary TEXT,  -- markdown source for the 1-pager (rendered client-side)
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by UUID NOT NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comms_packs_org ON public.comms_packs(organization_id);
CREATE INDEX idx_comms_packs_scope ON public.comms_packs(scope_type, scope_id);
CREATE INDEX idx_comms_packs_report ON public.comms_packs(governance_report_id);

ALTER TABLE public.comms_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view comms packs"
  ON public.comms_packs FOR SELECT
  USING (
    public.has_org_access(auth.uid(), organization_id, 'viewer')
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Org managers create comms packs"
  ON public.comms_packs FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND (public.has_org_access(auth.uid(), organization_id, 'manager') OR public.is_admin(auth.uid()))
  );

CREATE POLICY "Org managers update comms packs"
  ON public.comms_packs FOR UPDATE
  USING (
    public.has_org_access(auth.uid(), organization_id, 'manager')
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Org admins delete comms packs"
  ON public.comms_packs FOR DELETE
  USING (
    public.has_org_access(auth.uid(), organization_id, 'admin')
    OR public.is_admin(auth.uid())
  );

CREATE TRIGGER comms_packs_updated_at
  BEFORE UPDATE ON public.comms_packs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Stakeholder Portal Access
-- =========================================================
CREATE TABLE public.stakeholder_portal_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('programme', 'project', 'organization')),
  scope_id UUID NOT NULL,
  granted_by UUID,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, scope_type, scope_id)
);

CREATE INDEX idx_stakeholder_portal_user ON public.stakeholder_portal_access(user_id);
CREATE INDEX idx_stakeholder_portal_org ON public.stakeholder_portal_access(organization_id);
CREATE INDEX idx_stakeholder_portal_scope ON public.stakeholder_portal_access(scope_type, scope_id);

ALTER TABLE public.stakeholder_portal_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stakeholders view their own access"
  ON public.stakeholder_portal_access FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Org admins view portal access for their org"
  ON public.stakeholder_portal_access FOR SELECT
  USING (
    public.has_org_access(auth.uid(), organization_id, 'admin')
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Org admins grant portal access"
  ON public.stakeholder_portal_access FOR INSERT
  WITH CHECK (
    public.has_org_access(auth.uid(), organization_id, 'admin')
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Org admins revoke portal access"
  ON public.stakeholder_portal_access FOR DELETE
  USING (
    public.has_org_access(auth.uid(), organization_id, 'admin')
    OR public.is_admin(auth.uid())
  );

-- Helper function: does this user have stakeholder portal access to this scope?
CREATE OR REPLACE FUNCTION public.has_stakeholder_access(_user_id UUID, _scope_type TEXT, _scope_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stakeholder_portal_access
    WHERE user_id = _user_id
      AND scope_type = _scope_type
      AND scope_id = _scope_id
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- Compliance score computation function
CREATE OR REPLACE FUNCTION public.compute_compliance_score(_scope_type TEXT, _scope_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _controls_score INTEGER := 0;
  _cadence_score INTEGER := 0;
  _hygiene_score INTEGER := 0;
  _composite INTEGER := 0;
  _details JSONB := '{}'::jsonb;
  _has_risks BOOLEAN;
  _has_issues BOOLEAN;
  _has_milestones BOOLEAN;
  _has_benefits BOOLEAN;
  _has_stakeholders BOOLEAN;
  _recent_updates INTEGER;
  _stale_risks INTEGER;
  _orphan_risks INTEGER;
  _stale_issues INTEGER;
  _orphan_issues INTEGER;
  _filter_col TEXT;
BEGIN
  -- Controls completeness: which registers are populated?
  IF _scope_type = 'programme' THEN
    _filter_col := 'programme_id';
  ELSIF _scope_type = 'project' THEN
    _filter_col := 'project_id';
  ELSE
    RETURN jsonb_build_object('error', 'unsupported scope');
  END IF;

  EXECUTE format('SELECT EXISTS(SELECT 1 FROM risks WHERE %I = $1)', _filter_col) USING _scope_id INTO _has_risks;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM issues WHERE %I = $1)', _filter_col) USING _scope_id INTO _has_issues;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM milestones WHERE %I = $1)', _filter_col) USING _scope_id INTO _has_milestones;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM benefits WHERE %I = $1)', _filter_col) USING _scope_id INTO _has_benefits;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM stakeholders WHERE %I = $1)', _filter_col) USING _scope_id INTO _has_stakeholders;

  _controls_score := (
    CASE WHEN _has_risks THEN 20 ELSE 0 END +
    CASE WHEN _has_issues THEN 20 ELSE 0 END +
    CASE WHEN _has_milestones THEN 20 ELSE 0 END +
    CASE WHEN _has_benefits THEN 20 ELSE 0 END +
    CASE WHEN _has_stakeholders THEN 20 ELSE 0 END
  );

  -- Update cadence: weekly updates in last 14 days
  SELECT COUNT(*) INTO _recent_updates
  FROM entity_updates
  WHERE entity_type = _scope_type
    AND entity_id = _scope_id
    AND created_at > now() - INTERVAL '14 days';

  _cadence_score := LEAST(100, _recent_updates * 50);  -- 2+ updates = 100

  -- Risk & issue hygiene: orphans (no owner) and stale items (>30 days no update)
  EXECUTE format('SELECT COUNT(*) FROM risks WHERE %I = $1 AND owner_id IS NULL AND status NOT IN (''closed'')', _filter_col)
    USING _scope_id INTO _orphan_risks;
  EXECUTE format('SELECT COUNT(*) FROM risks WHERE %I = $1 AND updated_at < now() - INTERVAL ''30 days'' AND status NOT IN (''closed'')', _filter_col)
    USING _scope_id INTO _stale_risks;
  EXECUTE format('SELECT COUNT(*) FROM issues WHERE %I = $1 AND owner_id IS NULL AND status NOT IN (''resolved'', ''closed'')', _filter_col)
    USING _scope_id INTO _orphan_issues;
  EXECUTE format('SELECT COUNT(*) FROM issues WHERE %I = $1 AND updated_at < now() - INTERVAL ''30 days'' AND status NOT IN (''resolved'', ''closed'')', _filter_col)
    USING _scope_id INTO _stale_issues;

  _hygiene_score := GREATEST(0, 100 - (_orphan_risks * 10) - (_stale_risks * 10) - (_orphan_issues * 10) - (_stale_issues * 10));

  -- Composite: 40% controls, 30% cadence, 30% hygiene
  _composite := ROUND((_controls_score * 0.4) + (_cadence_score * 0.3) + (_hygiene_score * 0.3));

  _details := jsonb_build_object(
    'controls', jsonb_build_object(
      'risks', _has_risks,
      'issues', _has_issues,
      'milestones', _has_milestones,
      'benefits', _has_benefits,
      'stakeholders', _has_stakeholders
    ),
    'cadence', jsonb_build_object('recent_updates_14d', _recent_updates),
    'hygiene', jsonb_build_object(
      'orphan_risks', _orphan_risks,
      'stale_risks', _stale_risks,
      'orphan_issues', _orphan_issues,
      'stale_issues', _stale_issues
    )
  );

  RETURN jsonb_build_object(
    'score', _composite,
    'controls_score', _controls_score,
    'cadence_score', _cadence_score,
    'hygiene_score', _hygiene_score,
    'details', _details
  );
END;
$$;

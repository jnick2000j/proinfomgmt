-- ============================================================
-- 6-MODULE ENTERPRISE BUILD-OUT
-- ============================================================

-- ---------- 1. STAGE GATES ----------
CREATE TABLE IF NOT EXISTS public.stage_gate_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_gate_id UUID NOT NULL REFERENCES public.stage_gates(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL,
  reviewer_role TEXT,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','approve','reject','abstain','conditional')),
  comments TEXT,
  conditions TEXT,
  signed_at TIMESTAMPTZ,
  is_required BOOLEAN NOT NULL DEFAULT true,
  organization_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stage_gate_id, reviewer_id)
);

CREATE TABLE IF NOT EXISTS public.approval_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_type TEXT NOT NULL CHECK (approval_type IN ('stage_gate','exception','quality_review')),
  approval_id UUID NOT NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  evidence_label TEXT NOT NULL,
  description TEXT,
  is_required BOOLEAN NOT NULL DEFAULT false,
  attested_by UUID,
  attested_at TIMESTAMPTZ,
  organization_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_evidence_lookup ON public.approval_evidence(approval_type, approval_id);
CREATE INDEX IF NOT EXISTS idx_stage_gate_approvals_gate ON public.stage_gate_approvals(stage_gate_id);

ALTER TABLE public.stage_gate_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view gate approvals" ON public.stage_gate_approvals FOR SELECT USING (organization_id IS NULL OR has_org_access(auth.uid(), organization_id) OR auth.uid() = reviewer_id OR is_admin(auth.uid()));
CREATE POLICY "Reviewers create gate approvals" ON public.stage_gate_approvals FOR INSERT WITH CHECK (organization_id IS NULL OR has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));
CREATE POLICY "Reviewers update own approvals" ON public.stage_gate_approvals FOR UPDATE USING (auth.uid() = reviewer_id OR has_org_access(auth.uid(), organization_id, 'manager') OR is_admin(auth.uid()));
CREATE POLICY "Managers delete gate approvals" ON public.stage_gate_approvals FOR DELETE USING (has_org_access(auth.uid(), organization_id, 'manager') OR is_admin(auth.uid()));

CREATE POLICY "Org members view approval evidence" ON public.approval_evidence FOR SELECT USING (organization_id IS NULL OR has_org_access(auth.uid(), organization_id) OR is_admin(auth.uid()));
CREATE POLICY "Editors create approval evidence" ON public.approval_evidence FOR INSERT WITH CHECK (auth.uid() = created_by AND (organization_id IS NULL OR has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid())));
CREATE POLICY "Editors update approval evidence" ON public.approval_evidence FOR UPDATE USING (auth.uid() = created_by OR has_org_access(auth.uid(), organization_id, 'manager') OR is_admin(auth.uid()));
CREATE POLICY "Editors delete approval evidence" ON public.approval_evidence FOR DELETE USING (auth.uid() = created_by OR has_org_access(auth.uid(), organization_id, 'manager') OR is_admin(auth.uid()));

CREATE TRIGGER trg_stage_gate_approvals_updated BEFORE UPDATE ON public.stage_gate_approvals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 2. EXCEPTION LIFECYCLE ----------
CREATE TABLE IF NOT EXISTS public.exception_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_id UUID NOT NULL REFERENCES public.exceptions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('raised','assessed','escalated','resolved','reopened','noted')),
  actor_id UUID,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  organization_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exception_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_id UUID NOT NULL REFERENCES public.exceptions(id) ON DELETE CASCADE,
  assessed_by UUID,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  impact_summary TEXT,
  options_considered JSONB DEFAULT '[]'::jsonb,
  recommendation TEXT,
  recommended_option TEXT,
  cost_estimate NUMERIC,
  time_estimate_days INTEGER,
  organization_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exc_lifecycle_exception ON public.exception_lifecycle_events(exception_id);
CREATE INDEX IF NOT EXISTS idx_exc_assessments_exception ON public.exception_assessments(exception_id);

ALTER TABLE public.exception_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exception_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org view exception events" ON public.exception_lifecycle_events FOR SELECT USING (organization_id IS NULL OR has_org_access(auth.uid(), organization_id) OR is_admin(auth.uid()));
CREATE POLICY "Org editors insert exception events" ON public.exception_lifecycle_events FOR INSERT WITH CHECK (organization_id IS NULL OR has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));

CREATE POLICY "Org view exception assessments" ON public.exception_assessments FOR SELECT USING (organization_id IS NULL OR has_org_access(auth.uid(), organization_id) OR is_admin(auth.uid()));
CREATE POLICY "Org editors create assessments" ON public.exception_assessments FOR INSERT WITH CHECK (organization_id IS NULL OR has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));
CREATE POLICY "Assessors update own assessments" ON public.exception_assessments FOR UPDATE USING (auth.uid() = assessed_by OR has_org_access(auth.uid(), organization_id, 'manager') OR is_admin(auth.uid()));
CREATE POLICY "Managers delete assessments" ON public.exception_assessments FOR DELETE USING (has_org_access(auth.uid(), organization_id, 'manager') OR is_admin(auth.uid()));

CREATE TRIGGER trg_exception_assessments_updated BEFORE UPDATE ON public.exception_assessments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 3. MSP PROGRAMME ----------
CREATE TABLE IF NOT EXISTS public.programme_blueprint (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID NOT NULL UNIQUE REFERENCES public.programmes(id) ON DELETE CASCADE,
  vision_statement TEXT,
  current_state TEXT,
  future_state TEXT,
  capability_gaps JSONB DEFAULT '[]'::jsonb,
  target_operating_model TEXT,
  transformation_flow TEXT,
  business_changes JSONB DEFAULT '[]'::jsonb,
  organization_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.programme_tranches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID NOT NULL REFERENCES public.programmes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sequence_number INTEGER NOT NULL DEFAULT 1,
  start_date DATE,
  end_date DATE,
  capabilities_delivered TEXT,
  benefits_realized TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','on_hold','cancelled')),
  organization_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.programme_success_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID NOT NULL UNIQUE REFERENCES public.programmes(id) ON DELETE CASCADE,
  success_criteria JSONB DEFAULT '[]'::jsonb,
  measurement_approach TEXT,
  review_cadence TEXT,
  governance_arrangements TEXT,
  benefit_links JSONB DEFAULT '[]'::jsonb,
  organization_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tranches_programme ON public.programme_tranches(programme_id, sequence_number);

ALTER TABLE public.programme_blueprint ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programme_tranches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programme_success_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org view blueprint" ON public.programme_blueprint FOR SELECT USING (organization_id IS NULL OR has_org_access(auth.uid(), organization_id) OR is_admin(auth.uid()));
CREATE POLICY "Editors manage blueprint" ON public.programme_blueprint FOR ALL USING (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid())) WITH CHECK (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));

CREATE POLICY "Org view tranches" ON public.programme_tranches FOR SELECT USING (organization_id IS NULL OR has_org_access(auth.uid(), organization_id) OR is_admin(auth.uid()));
CREATE POLICY "Editors manage tranches" ON public.programme_tranches FOR ALL USING (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid())) WITH CHECK (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));

CREATE POLICY "Org view success plan" ON public.programme_success_plan FOR SELECT USING (organization_id IS NULL OR has_org_access(auth.uid(), organization_id) OR is_admin(auth.uid()));
CREATE POLICY "Editors manage success plan" ON public.programme_success_plan FOR ALL USING (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid())) WITH CHECK (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));

CREATE TRIGGER trg_blueprint_updated BEFORE UPDATE ON public.programme_blueprint FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tranches_updated BEFORE UPDATE ON public.programme_tranches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_success_plan_updated BEFORE UPDATE ON public.programme_success_plan FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 4. BENEFITS REALISATION ----------
CREATE TABLE IF NOT EXISTS public.benefit_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benefit_id UUID NOT NULL UNIQUE REFERENCES public.benefits(id) ON DELETE CASCADE,
  profile_type TEXT NOT NULL DEFAULT 'quantitative' CHECK (profile_type IN ('quantitative','qualitative')),
  measurement_method TEXT,
  measurement_unit TEXT,
  baseline_value NUMERIC,
  target_value NUMERIC,
  baseline_date DATE,
  target_date DATE,
  trajectory JSONB DEFAULT '[]'::jsonb,
  dis_benefits TEXT,
  dependencies TEXT,
  realization_owner UUID,
  qualitative_rubric JSONB DEFAULT '[]'::jsonb,
  current_maturity_level TEXT,
  organization_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.benefit_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benefit_id UUID NOT NULL REFERENCES public.benefits(id) ON DELETE CASCADE,
  measurement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  actual_value NUMERIC,
  qualitative_status TEXT,
  notes TEXT,
  evidence_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  recorded_by UUID,
  organization_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_benefit_measurements_benefit ON public.benefit_measurements(benefit_id, measurement_date);

ALTER TABLE public.benefit_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefit_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org view benefit profiles" ON public.benefit_profiles FOR SELECT USING (organization_id IS NULL OR has_org_access(auth.uid(), organization_id) OR is_admin(auth.uid()));
CREATE POLICY "Editors manage benefit profiles" ON public.benefit_profiles FOR ALL USING (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid())) WITH CHECK (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));

CREATE POLICY "Org view benefit measurements" ON public.benefit_measurements FOR SELECT USING (organization_id IS NULL OR has_org_access(auth.uid(), organization_id) OR is_admin(auth.uid()));
CREATE POLICY "Editors create measurements" ON public.benefit_measurements FOR INSERT WITH CHECK (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));
CREATE POLICY "Recorders update measurements" ON public.benefit_measurements FOR UPDATE USING (auth.uid() = recorded_by OR has_org_access(auth.uid(), organization_id, 'manager') OR is_admin(auth.uid()));
CREATE POLICY "Managers delete measurements" ON public.benefit_measurements FOR DELETE USING (has_org_access(auth.uid(), organization_id, 'manager') OR is_admin(auth.uid()));

CREATE TRIGGER trg_benefit_profiles_updated BEFORE UPDATE ON public.benefit_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 5. QUALITY MANAGEMENT ----------
CREATE TABLE IF NOT EXISTS public.quality_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id UUID REFERENCES public.work_packages(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  programme_id UUID REFERENCES public.programmes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  criterion TEXT NOT NULL,
  acceptance_test TEXT,
  tolerance TEXT,
  method TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'defined' CHECK (status IN ('defined','in_review','passed','failed','waived')),
  organization_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quality_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_criteria_id UUID NOT NULL REFERENCES public.quality_criteria(id) ON DELETE CASCADE,
  reviewer_id UUID,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  result TEXT NOT NULL CHECK (result IN ('pass','fail','conditional')),
  findings TEXT,
  conditions TEXT,
  evidence_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  organization_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_criteria_wp ON public.quality_criteria(work_package_id);
CREATE INDEX IF NOT EXISTS idx_quality_reviews_criteria ON public.quality_reviews(quality_criteria_id);

ALTER TABLE public.quality_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org view quality criteria" ON public.quality_criteria FOR SELECT USING (organization_id IS NULL OR has_org_access(auth.uid(), organization_id) OR is_admin(auth.uid()));
CREATE POLICY "Editors manage quality criteria" ON public.quality_criteria FOR ALL USING (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid())) WITH CHECK (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));

CREATE POLICY "Org view quality reviews" ON public.quality_reviews FOR SELECT USING (organization_id IS NULL OR has_org_access(auth.uid(), organization_id) OR is_admin(auth.uid()));
CREATE POLICY "Editors create quality reviews" ON public.quality_reviews FOR INSERT WITH CHECK (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));
CREATE POLICY "Reviewers update reviews" ON public.quality_reviews FOR UPDATE USING (auth.uid() = reviewer_id OR has_org_access(auth.uid(), organization_id, 'manager') OR is_admin(auth.uid()));
CREATE POLICY "Managers delete quality reviews" ON public.quality_reviews FOR DELETE USING (has_org_access(auth.uid(), organization_id, 'manager') OR is_admin(auth.uid()));

CREATE TRIGGER trg_quality_criteria_updated BEFORE UPDATE ON public.quality_criteria FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 6. LESSONS LEARNED TAGS ----------
CREATE TABLE IF NOT EXISTS public.lesson_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  description TEXT,
  organization_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, tag_name)
);

CREATE TABLE IF NOT EXISTS public.lesson_tag_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.lessons_learned(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.lesson_tags(id) ON DELETE CASCADE,
  assigned_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.lesson_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.lessons_learned(id) ON DELETE CASCADE,
  applied_to_type TEXT NOT NULL CHECK (applied_to_type IN ('project','programme','product')),
  applied_to_id UUID NOT NULL,
  applied_by UUID,
  application_notes TEXT,
  outcome TEXT,
  organization_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_tag_assignments_lesson ON public.lesson_tag_assignments(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_tag_assignments_tag ON public.lesson_tag_assignments(tag_id);
CREATE INDEX IF NOT EXISTS idx_lesson_applications_lesson ON public.lesson_applications(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lessons_fts ON public.lessons_learned USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(what_happened,'') || ' ' || coalesce(recommendation,'')));

ALTER TABLE public.lesson_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org view lesson tags" ON public.lesson_tags FOR SELECT USING (organization_id IS NULL OR has_org_access(auth.uid(), organization_id) OR is_admin(auth.uid()));
CREATE POLICY "Editors manage lesson tags" ON public.lesson_tags FOR ALL USING (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid())) WITH CHECK (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));

CREATE POLICY "Org view lesson assignments" ON public.lesson_tag_assignments FOR SELECT USING (true);
CREATE POLICY "Authenticated assign lesson tags" ON public.lesson_tag_assignments FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated remove lesson tags" ON public.lesson_tag_assignments FOR DELETE TO authenticated USING (auth.uid() = assigned_by OR is_admin(auth.uid()));

CREATE POLICY "Org view lesson applications" ON public.lesson_applications FOR SELECT USING (organization_id IS NULL OR has_org_access(auth.uid(), organization_id) OR is_admin(auth.uid()));
CREATE POLICY "Editors create lesson applications" ON public.lesson_applications FOR INSERT WITH CHECK (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));
CREATE POLICY "Appliers update applications" ON public.lesson_applications FOR UPDATE USING (auth.uid() = applied_by OR has_org_access(auth.uid(), organization_id, 'manager') OR is_admin(auth.uid()));
CREATE POLICY "Managers delete applications" ON public.lesson_applications FOR DELETE USING (has_org_access(auth.uid(), organization_id, 'manager') OR is_admin(auth.uid()));
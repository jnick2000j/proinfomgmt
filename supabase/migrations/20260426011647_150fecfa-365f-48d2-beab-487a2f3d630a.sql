-- 1. Project lifecycle phases (drives auto-provisioning of construction registers)
CREATE TABLE public.project_lifecycle_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN (
    'pre_construction','design','procurement','mobilization',
    'construction','commissioning','closeout','warranty'
  )),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','complete','skipped')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, phase)
);

CREATE INDEX idx_project_phases_org ON public.project_lifecycle_phases(organization_id);
CREATE INDEX idx_project_phases_project ON public.project_lifecycle_phases(project_id);

ALTER TABLE public.project_lifecycle_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view project phases" ON public.project_lifecycle_phases
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.user_organization_access uoa
    WHERE uoa.user_id = auth.uid() AND uoa.organization_id = project_lifecycle_phases.organization_id
  ));

CREATE POLICY "Org members write project phases" ON public.project_lifecycle_phases
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_organization_access uoa
    WHERE uoa.user_id = auth.uid() AND uoa.organization_id = project_lifecycle_phases.organization_id
  ));

CREATE POLICY "Org members update project phases" ON public.project_lifecycle_phases
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_organization_access uoa
    WHERE uoa.user_id = auth.uid() AND uoa.organization_id = project_lifecycle_phases.organization_id
  ));

CREATE POLICY "Org admins delete project phases" ON public.project_lifecycle_phases
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_org_admin_of(auth.uid(), project_lifecycle_phases.organization_id));

CREATE TRIGGER trg_project_phases_updated
  BEFORE UPDATE ON public.project_lifecycle_phases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Auto-provision register seed records when a phase is added
CREATE OR REPLACE FUNCTION public.provision_construction_registers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_construction boolean;
BEGIN
  -- Only seed registers for organizations on the construction vertical
  SELECT (industry_vertical = 'construction')
    INTO _has_construction
    FROM public.organizations
   WHERE id = NEW.organization_id;

  IF NOT COALESCE(_has_construction, false) THEN
    RETURN NEW;
  END IF;

  -- Phase-specific seeding (idempotent: only seed if no rows yet for that project+phase)
  IF NEW.phase IN ('design','procurement','construction') THEN
    -- Seed an opening RFI placeholder
    IF NOT EXISTS (
      SELECT 1 FROM public.rfis
       WHERE project_id = NEW.project_id
         AND subject = 'Phase opened: ' || NEW.phase
    ) THEN
      INSERT INTO public.rfis (organization_id, project_id, rfi_number, subject, question, status, priority, submitted_by)
      VALUES (
        NEW.organization_id, NEW.project_id,
        'RFI-' || upper(substring(NEW.phase,1,3)) || '-' || to_char(now(),'YYYYMMDDHH24MISS'),
        'Phase opened: ' || NEW.phase,
        'Capture any open questions for the ' || NEW.phase || ' phase here. This RFI was opened automatically when the phase started.',
        'draft', 'low', NEW.created_by
      );
    END IF;
  END IF;

  IF NEW.phase IN ('procurement','construction','commissioning') THEN
    -- Seed a submittal placeholder
    IF NOT EXISTS (
      SELECT 1 FROM public.submittals
       WHERE project_id = NEW.project_id
         AND title = 'Phase opened: ' || NEW.phase
    ) THEN
      INSERT INTO public.submittals (organization_id, project_id, submittal_number, title, description, status, submitted_by)
      VALUES (
        NEW.organization_id, NEW.project_id,
        'SUB-' || upper(substring(NEW.phase,1,3)) || '-' || to_char(now(),'YYYYMMDDHH24MISS'),
        'Phase opened: ' || NEW.phase,
        'Track product data, shop drawings and samples required for the ' || NEW.phase || ' phase here.',
        'pending', NEW.created_by
      );
    END IF;
  END IF;

  IF NEW.phase IN ('mobilization','construction','commissioning') THEN
    -- Seed today's daily log if missing
    IF NOT EXISTS (
      SELECT 1 FROM public.daily_logs
       WHERE project_id = NEW.project_id
         AND log_date = CURRENT_DATE
    ) THEN
      INSERT INTO public.daily_logs (organization_id, project_id, log_date, work_performed, notes, created_by)
      VALUES (
        NEW.organization_id, NEW.project_id, CURRENT_DATE,
        'Phase started: ' || NEW.phase,
        'Daily log started automatically when the ' || NEW.phase || ' phase opened.',
        NEW.created_by
      );
    END IF;
  END IF;

  IF NEW.phase IN ('commissioning','closeout','warranty') THEN
    -- Seed a punch list opening item
    IF NOT EXISTS (
      SELECT 1 FROM public.punch_list_items
       WHERE project_id = NEW.project_id
         AND description = 'Phase opened: ' || NEW.phase
    ) THEN
      INSERT INTO public.punch_list_items (organization_id, project_id, item_number, description, status, priority, identified_by)
      VALUES (
        NEW.organization_id, NEW.project_id,
        'PL-' || upper(substring(NEW.phase,1,3)) || '-' || to_char(now(),'YYYYMMDDHH24MISS'),
        'Phase opened: ' || NEW.phase,
        'open', 'low', NEW.created_by
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_provision_construction_registers
  AFTER INSERT ON public.project_lifecycle_phases
  FOR EACH ROW EXECUTE FUNCTION public.provision_construction_registers();

-- 3. Weekly construction report recipients (per project)
CREATE TABLE public.project_report_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  role text,
  report_kind text NOT NULL DEFAULT 'weekly_construction_progress'
    CHECK (report_kind IN ('weekly_construction_progress')),
  frequency text NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('weekly','biweekly','monthly')),
  day_of_week smallint NOT NULL DEFAULT 1 CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun
  is_active boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, email, report_kind)
);

CREATE INDEX idx_report_recipients_org ON public.project_report_recipients(organization_id);
CREATE INDEX idx_report_recipients_project ON public.project_report_recipients(project_id);

ALTER TABLE public.project_report_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view report recipients" ON public.project_report_recipients
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.user_organization_access uoa
    WHERE uoa.user_id = auth.uid() AND uoa.organization_id = project_report_recipients.organization_id
  ));

CREATE POLICY "Org members manage report recipients" ON public.project_report_recipients
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_organization_access uoa
    WHERE uoa.user_id = auth.uid() AND uoa.organization_id = project_report_recipients.organization_id
  ));

CREATE POLICY "Org members update report recipients" ON public.project_report_recipients
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_organization_access uoa
    WHERE uoa.user_id = auth.uid() AND uoa.organization_id = project_report_recipients.organization_id
  ));

CREATE POLICY "Org admins delete report recipients" ON public.project_report_recipients
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_org_admin_of(auth.uid(), project_report_recipients.organization_id));

CREATE TRIGGER trg_report_recipients_updated
  BEFORE UPDATE ON public.project_report_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Log of generated weekly construction reports
CREATE TABLE public.construction_report_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  report_kind text NOT NULL DEFAULT 'weekly_construction_progress',
  period_start date NOT NULL,
  period_end date NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  recipients_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','partial','failed','no_recipients'))
);

CREATE INDEX idx_construction_report_log_project ON public.construction_report_log(project_id, generated_at DESC);
CREATE INDEX idx_construction_report_log_org ON public.construction_report_log(organization_id);

ALTER TABLE public.construction_report_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view construction report log" ON public.construction_report_log
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.user_organization_access uoa
    WHERE uoa.user_id = auth.uid() AND uoa.organization_id = construction_report_log.organization_id
  ));
-- Service role inserts (no insert policy for users)

-- 1. Add industry_vertical column to organizations
ALTER TABLE public.organizations
  ADD COLUMN industry_vertical text NOT NULL DEFAULT 'it_infrastructure';

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_industry_vertical_check
  CHECK (industry_vertical IN ('it_infrastructure', 'software_saas', 'construction', 'professional_services'));

CREATE INDEX idx_organizations_industry_vertical ON public.organizations(industry_vertical);

-- 2. Vertical registry
CREATE TABLE public.industry_verticals (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  icon text,
  enabled_modules text[] NOT NULL DEFAULT '{}',
  terminology_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_dashboards text[] NOT NULL DEFAULT '{}',
  ai_context_prompt text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.industry_verticals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view verticals"
  ON public.industry_verticals FOR SELECT
  TO authenticated
  USING (is_active = true OR public.is_admin(auth.uid()));

CREATE POLICY "Platform admins manage verticals"
  ON public.industry_verticals FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_industry_verticals_updated
  BEFORE UPDATE ON public.industry_verticals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the 4 verticals
INSERT INTO public.industry_verticals (id, name, description, icon, enabled_modules, terminology_overrides, default_dashboards, ai_context_prompt, sort_order)
VALUES
  ('it_infrastructure', 'IT & Infrastructure', 'Helpdesk, ITSM, Change Management and infrastructure projects',
    'Server',
    ARRAY['programmes','projects','tasks','helpdesk','change_management','itsm','risks','issues','reports','team','knowledgebase','automations'],
    '{"project":"Project","programme":"Programme","work_package":"Work Package","stakeholder":"Stakeholder"}'::jsonb,
    ARRAY['itsm_overview','helpdesk_sla','infrastructure_health'],
    'You are assisting an IT & Infrastructure team focused on ITSM, change management and uptime.',
    10),
  ('software_saas', 'Software & SaaS', 'Agile product delivery, sprints, roadmaps and feature management',
    'Code2',
    ARRAY['programmes','projects','products','features','sprints','tasks','backlog','risks','issues','reports','team','knowledgebase','helpdesk','automations'],
    '{"project":"Product","programme":"Product Line","work_package":"Epic","stakeholder":"Customer"}'::jsonb,
    ARRAY['sprint_velocity','roadmap','feature_pipeline'],
    'You are assisting a Software/SaaS product team focused on agile delivery, sprints and feature roadmaps.',
    20),
  ('construction', 'Construction & Engineering', 'Site management, RFIs, submittals, safety and punch lists',
    'HardHat',
    ARRAY['programmes','projects','tasks','rfis','submittals','daily_logs','punch_list','risks','issues','reports','team','knowledgebase','automations'],
    '{"project":"Project","programme":"Programme","work_package":"Work Package","stakeholder":"Stakeholder","task":"Activity"}'::jsonb,
    ARRAY['site_overview','rfi_status','safety_dashboard'],
    'You are assisting a Construction & Engineering team. Use industry terms like RFI, submittal, punch list, snag, site diary, contractor, owner.',
    30),
  ('professional_services', 'Professional Services', 'Client engagements, retainers, billable hours and deliverables',
    'Briefcase',
    ARRAY['programmes','projects','tasks','engagements','retainers','timesheets','risks','issues','reports','team','knowledgebase','helpdesk','automations'],
    '{"project":"Engagement","programme":"Account","work_package":"Deliverable","stakeholder":"Client"}'::jsonb,
    ARRAY['utilization','billable_hours','retainer_burn'],
    'You are assisting a Professional Services firm focused on client engagements, billable utilization and deliverables.',
    40);

-- 3. Construction tables
CREATE TABLE public.rfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  rfi_number text NOT NULL,
  subject text NOT NULL,
  question text NOT NULL,
  response text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('draft','open','answered','closed','void')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  submitted_by uuid,
  assigned_to uuid,
  due_date date,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.submittals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  submittal_number text NOT NULL,
  title text NOT NULL,
  spec_section text,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','approved','rejected','revise_resubmit')),
  submitted_by uuid,
  reviewer uuid,
  due_date date,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  weather text,
  crew_count integer DEFAULT 0,
  hours_worked numeric(10,2) DEFAULT 0,
  work_performed text,
  delays text,
  safety_incidents text,
  visitors text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.punch_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  item_number text,
  description text NOT NULL,
  location text,
  trade text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','complete','verified','void')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  assigned_to uuid,
  identified_by uuid,
  due_date date,
  completed_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Professional Services tables
CREATE TABLE public.client_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  engagement_code text NOT NULL,
  client_name text NOT NULL,
  engagement_type text NOT NULL DEFAULT 'time_and_materials' CHECK (engagement_type IN ('time_and_materials','fixed_price','retainer','milestone_based')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('proposed','active','on_hold','closed','cancelled')),
  start_date date,
  end_date date,
  contract_value numeric(14,2) DEFAULT 0,
  billed_to_date numeric(14,2) DEFAULT 0,
  account_manager uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.retainers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  engagement_id uuid REFERENCES public.client_engagements(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  hours_allocated numeric(10,2) NOT NULL DEFAULT 0,
  hours_consumed numeric(10,2) NOT NULL DEFAULT 0,
  monthly_value numeric(14,2) DEFAULT 0,
  rollover_allowed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','depleted','expired','closed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Indexes
CREATE INDEX idx_rfis_org ON public.rfis(organization_id);
CREATE INDEX idx_rfis_project ON public.rfis(project_id);
CREATE INDEX idx_submittals_org ON public.submittals(organization_id);
CREATE INDEX idx_submittals_project ON public.submittals(project_id);
CREATE INDEX idx_daily_logs_org ON public.daily_logs(organization_id);
CREATE INDEX idx_daily_logs_project_date ON public.daily_logs(project_id, log_date DESC);
CREATE INDEX idx_punch_list_org ON public.punch_list_items(organization_id);
CREATE INDEX idx_punch_list_project ON public.punch_list_items(project_id);
CREATE INDEX idx_engagements_org ON public.client_engagements(organization_id);
CREATE INDEX idx_retainers_org ON public.retainers(organization_id);
CREATE INDEX idx_retainers_engagement ON public.retainers(engagement_id);

-- 6. RLS
ALTER TABLE public.rfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submittals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punch_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retainers ENABLE ROW LEVEL SECURITY;

-- Generic helper: members can read/write within their org; managers/admins can delete
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['rfis','submittals','daily_logs','punch_list_items','client_engagements','retainers'])
  LOOP
    EXECUTE format($f$
      CREATE POLICY "Org members view %1$I" ON public.%1$I
        FOR SELECT TO authenticated
        USING (
          public.is_admin(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.user_organization_access uoa
            WHERE uoa.user_id = auth.uid() AND uoa.organization_id = %1$I.organization_id
          )
        );
    $f$, tbl);

    EXECUTE format($f$
      CREATE POLICY "Org members insert %1$I" ON public.%1$I
        FOR INSERT TO authenticated
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.user_organization_access uoa
            WHERE uoa.user_id = auth.uid() AND uoa.organization_id = %1$I.organization_id
          )
        );
    $f$, tbl);

    EXECUTE format($f$
      CREATE POLICY "Org members update %1$I" ON public.%1$I
        FOR UPDATE TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.user_organization_access uoa
            WHERE uoa.user_id = auth.uid() AND uoa.organization_id = %1$I.organization_id
          )
        );
    $f$, tbl);

    EXECUTE format($f$
      CREATE POLICY "Org admins delete %1$I" ON public.%1$I
        FOR DELETE TO authenticated
        USING (
          public.is_admin(auth.uid())
          OR public.is_org_admin_of(auth.uid(), %1$I.organization_id)
        );
    $f$, tbl);
  END LOOP;
END $$;

-- 7. Triggers for updated_at
CREATE TRIGGER trg_rfis_updated BEFORE UPDATE ON public.rfis FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_submittals_updated BEFORE UPDATE ON public.submittals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_daily_logs_updated BEFORE UPDATE ON public.daily_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_punch_list_updated BEFORE UPDATE ON public.punch_list_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_engagements_updated BEFORE UPDATE ON public.client_engagements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_retainers_updated BEFORE UPDATE ON public.retainers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
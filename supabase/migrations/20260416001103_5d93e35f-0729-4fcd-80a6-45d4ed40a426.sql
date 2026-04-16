
-- Update frequency settings (global defaults + per-entity overrides)
CREATE TABLE public.update_frequency_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL DEFAULT 'organisation',
  entity_id uuid,
  frequency text NOT NULL DEFAULT 'weekly',
  custom_interval_days integer,
  reminder_hours_before integer NOT NULL DEFAULT 24,
  is_mandatory boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(organization_id, entity_type, entity_id)
);

ALTER TABLE public.update_frequency_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org frequency settings"
  ON public.update_frequency_settings FOR SELECT
  USING (has_org_access(auth.uid(), organization_id) OR is_admin(auth.uid()));

CREATE POLICY "Editors can create frequency settings"
  ON public.update_frequency_settings FOR INSERT
  WITH CHECK (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));

CREATE POLICY "Editors can update frequency settings"
  ON public.update_frequency_settings FOR UPDATE
  USING (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));

CREATE POLICY "Admins can delete frequency settings"
  ON public.update_frequency_settings FOR DELETE
  USING (has_org_access(auth.uid(), organization_id, 'admin') OR is_admin(auth.uid()));

-- Multi-user entity assignments (programmes, projects, products)
CREATE TABLE public.entity_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text DEFAULT 'contributor',
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  assigned_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id, user_id)
);

ALTER TABLE public.entity_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org entity assignments"
  ON public.entity_assignments FOR SELECT
  USING (has_org_access(auth.uid(), organization_id) OR auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Editors can create entity assignments"
  ON public.entity_assignments FOR INSERT
  WITH CHECK (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));

CREATE POLICY "Editors can delete entity assignments"
  ON public.entity_assignments FOR DELETE
  USING (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));

-- Task assignments (multi-user)
CREATE TABLE public.task_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text DEFAULT 'assignee',
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  assigned_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id)
);

ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org task assignments"
  ON public.task_assignments FOR SELECT
  USING (has_org_access(auth.uid(), organization_id) OR auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Editors can create task assignments"
  ON public.task_assignments FOR INSERT
  WITH CHECK (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));

CREATE POLICY "Editors can delete task assignments"
  ON public.task_assignments FOR DELETE
  USING (has_org_access(auth.uid(), organization_id, 'editor') OR is_admin(auth.uid()));

-- Triggers for updated_at
CREATE TRIGGER update_frequency_settings_updated_at
  BEFORE UPDATE ON public.update_frequency_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

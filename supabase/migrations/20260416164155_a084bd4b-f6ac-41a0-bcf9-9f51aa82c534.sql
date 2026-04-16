
-- Create saved_reports table
CREATE TABLE public.saved_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  query TEXT NOT NULL,
  content TEXT NOT NULL,
  template_key TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved reports"
  ON public.saved_reports FOR SELECT
  USING (auth.uid() = created_by OR has_org_access(auth.uid(), organization_id) OR is_admin(auth.uid()));

CREATE POLICY "Users can create saved reports"
  ON public.saved_reports FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own saved reports"
  ON public.saved_reports FOR UPDATE
  USING (auth.uid() = created_by OR is_admin(auth.uid()));

CREATE POLICY "Users can delete own saved reports"
  ON public.saved_reports FOR DELETE
  USING (auth.uid() = created_by OR is_admin(auth.uid()));

CREATE TRIGGER update_saved_reports_updated_at
  BEFORE UPDATE ON public.saved_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create scheduled_reports table
CREATE TABLE public.scheduled_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  query TEXT NOT NULL,
  template_key TEXT,
  frequency TEXT NOT NULL DEFAULT 'weekly',
  recipients TEXT[] NOT NULL DEFAULT '{}',
  format TEXT NOT NULL DEFAULT 'pdf',
  active BOOLEAN NOT NULL DEFAULT true,
  next_run_at TIMESTAMP WITH TIME ZONE,
  last_run_at TIMESTAMP WITH TIME ZONE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scheduled reports"
  ON public.scheduled_reports FOR SELECT
  USING (auth.uid() = created_by OR has_org_access(auth.uid(), organization_id, 'admin') OR is_admin(auth.uid()));

CREATE POLICY "Users can create scheduled reports"
  ON public.scheduled_reports FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own scheduled reports"
  ON public.scheduled_reports FOR UPDATE
  USING (auth.uid() = created_by OR is_admin(auth.uid()));

CREATE POLICY "Users can delete own scheduled reports"
  ON public.scheduled_reports FOR DELETE
  USING (auth.uid() = created_by OR is_admin(auth.uid()));

CREATE TRIGGER update_scheduled_reports_updated_at
  BEFORE UPDATE ON public.scheduled_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

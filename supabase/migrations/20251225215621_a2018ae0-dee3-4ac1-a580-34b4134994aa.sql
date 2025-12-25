-- Create lessons_learned table following PRINCE2 standards
CREATE TABLE public.lessons_learned (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  lesson_type text NOT NULL DEFAULT 'recommendation',
  category text NOT NULL DEFAULT 'process',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'identified',
  
  -- PRINCE2 specific fields
  event_date date,
  project_stage text,
  what_happened text,
  root_cause text,
  recommendation text,
  action_taken text,
  outcome text,
  applicable_to text[],
  
  -- Relationships
  organization_id uuid REFERENCES public.organizations(id),
  programme_id uuid REFERENCES public.programmes(id),
  project_id uuid REFERENCES public.projects(id),
  
  -- Ownership
  identified_by uuid,
  owner_id uuid,
  created_by uuid,
  
  -- Timestamps
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lessons_learned ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Authenticated users can view lessons"
ON public.lessons_learned
FOR SELECT
USING (true);

CREATE POLICY "Users can create lessons"
ON public.lessons_learned
FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners can update lessons"
ON public.lessons_learned
FOR UPDATE
USING (auth.uid() = owner_id OR auth.uid() = created_by OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete lessons"
ON public.lessons_learned
FOR DELETE
USING (public.is_admin(auth.uid()));

-- Create updated_at trigger
CREATE TRIGGER update_lessons_learned_updated_at
BEFORE UPDATE ON public.lessons_learned
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better query performance
CREATE INDEX idx_lessons_learned_org ON public.lessons_learned(organization_id);
CREATE INDEX idx_lessons_learned_programme ON public.lessons_learned(programme_id);
CREATE INDEX idx_lessons_learned_project ON public.lessons_learned(project_id);
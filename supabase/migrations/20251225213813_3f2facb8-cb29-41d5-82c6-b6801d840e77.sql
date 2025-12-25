-- Create feature dependencies table for tracking relationships
CREATE TABLE public.feature_dependencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_id UUID NOT NULL REFERENCES public.product_features(id) ON DELETE CASCADE,
  depends_on_id UUID NOT NULL REFERENCES public.product_features(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'blocks',
  description TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(feature_id, depends_on_id),
  CONSTRAINT no_self_dependency CHECK (feature_id != depends_on_id)
);

-- Enable RLS
ALTER TABLE public.feature_dependencies ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view dependencies"
  ON public.feature_dependencies FOR SELECT
  USING (true);

CREATE POLICY "Users can create dependencies"
  ON public.feature_dependencies FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can update dependencies"
  ON public.feature_dependencies FOR UPDATE
  USING (auth.uid() = created_by OR is_admin(auth.uid()));

CREATE POLICY "Creators and admins can delete dependencies"
  ON public.feature_dependencies FOR DELETE
  USING (auth.uid() = created_by OR is_admin(auth.uid()));
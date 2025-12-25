-- Create user roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'programme_owner', 'project_manager', 'stakeholder');

-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT NOT NULL,
  full_name TEXT,
  role app_role NOT NULL DEFAULT 'stakeholder',
  department TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table for role management
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create programmes table
CREATE TABLE public.programmes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on-hold', 'completed', 'at-risk')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  start_date DATE,
  end_date DATE,
  sponsor TEXT,
  manager_id UUID REFERENCES auth.users(id),
  tranche TEXT,
  budget TEXT,
  benefits_target TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID REFERENCES public.programmes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  stage TEXT NOT NULL DEFAULT 'initiating' CHECK (stage IN ('initiating', 'planning', 'executing', 'closing', 'completed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  health TEXT NOT NULL DEFAULT 'green' CHECK (health IN ('green', 'amber', 'red')),
  methodology TEXT NOT NULL DEFAULT 'PRINCE2' CHECK (methodology IN ('PRINCE2', 'Agile', 'Hybrid')),
  manager_id UUID REFERENCES auth.users(id),
  start_date DATE,
  end_date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create risks table
CREATE TABLE public.risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID REFERENCES public.programmes(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  probability TEXT NOT NULL DEFAULT 'medium' CHECK (probability IN ('very-low', 'low', 'medium', 'high', 'very-high')),
  impact TEXT NOT NULL DEFAULT 'medium' CHECK (impact IN ('very-low', 'low', 'medium', 'high', 'very-high')),
  score INTEGER NOT NULL DEFAULT 9,
  owner_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'mitigating', 'closed', 'accepted')),
  response TEXT,
  date_identified DATE DEFAULT CURRENT_DATE,
  review_date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create issues table
CREATE TABLE public.issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID REFERENCES public.programmes(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'problem' CHECK (type IN ('problem', 'concern', 'change-request', 'off-specification')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'pending', 'resolved', 'closed')),
  owner_id UUID REFERENCES auth.users(id),
  date_raised DATE DEFAULT CURRENT_DATE,
  target_date DATE,
  resolution TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create benefits table
CREATE TABLE public.benefits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID REFERENCES public.programmes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'operational' CHECK (category IN ('financial', 'operational', 'strategic', 'compliance', 'customer')),
  type TEXT NOT NULL DEFAULT 'quantitative' CHECK (type IN ('quantitative', 'qualitative')),
  target_value TEXT,
  current_value TEXT,
  realization INTEGER NOT NULL DEFAULT 0 CHECK (realization >= 0 AND realization <= 100),
  owner_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'identified' CHECK (status IN ('identified', 'measuring', 'realized', 'sustaining')),
  start_date DATE,
  end_date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create stakeholders table
CREATE TABLE public.stakeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  role TEXT,
  organization TEXT,
  influence TEXT NOT NULL DEFAULT 'medium' CHECK (influence IN ('high', 'medium', 'low')),
  interest TEXT NOT NULL DEFAULT 'medium' CHECK (interest IN ('high', 'medium', 'low')),
  engagement TEXT NOT NULL DEFAULT 'neutral' CHECK (engagement IN ('champion', 'supporter', 'neutral', 'critic', 'blocker')),
  communication_frequency TEXT DEFAULT 'monthly' CHECK (communication_frequency IN ('weekly', 'bi-weekly', 'monthly', 'quarterly')),
  last_contact DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create programme_stakeholders junction table
CREATE TABLE public.programme_stakeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID REFERENCES public.programmes(id) ON DELETE CASCADE NOT NULL,
  stakeholder_id UUID REFERENCES public.stakeholders(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (programme_id, stakeholder_id)
);

-- Create weekly_reports table
CREATE TABLE public.weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID REFERENCES public.programmes(id) ON DELETE CASCADE NOT NULL,
  week_ending DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved')),
  overall_health TEXT NOT NULL DEFAULT 'green' CHECK (overall_health IN ('green', 'amber', 'red')),
  highlights TEXT[],
  risks_issues TEXT[],
  next_week TEXT[],
  submitted_by UUID REFERENCES auth.users(id),
  submitted_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create chat_messages table for AI assistant
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programme_stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'admin'
  )
$$;

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- User roles policies (admin only for management)
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Programmes policies
CREATE POLICY "Authenticated users can view programmes" ON public.programmes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create programmes" ON public.programmes FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Managers and admins can update programmes" ON public.programmes FOR UPDATE TO authenticated USING (auth.uid() = manager_id OR auth.uid() = created_by OR public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete programmes" ON public.programmes FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Projects policies
CREATE POLICY "Authenticated users can view projects" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Managers can update projects" ON public.projects FOR UPDATE TO authenticated USING (auth.uid() = manager_id OR auth.uid() = created_by OR public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete projects" ON public.projects FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Risks policies
CREATE POLICY "Authenticated users can view risks" ON public.risks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create risks" ON public.risks FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owners can update risks" ON public.risks FOR UPDATE TO authenticated USING (auth.uid() = owner_id OR auth.uid() = created_by OR public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete risks" ON public.risks FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Issues policies
CREATE POLICY "Authenticated users can view issues" ON public.issues FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create issues" ON public.issues FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owners can update issues" ON public.issues FOR UPDATE TO authenticated USING (auth.uid() = owner_id OR auth.uid() = created_by OR public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete issues" ON public.issues FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Benefits policies
CREATE POLICY "Authenticated users can view benefits" ON public.benefits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create benefits" ON public.benefits FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owners can update benefits" ON public.benefits FOR UPDATE TO authenticated USING (auth.uid() = owner_id OR auth.uid() = created_by OR public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete benefits" ON public.benefits FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Stakeholders policies
CREATE POLICY "Authenticated users can view stakeholders" ON public.stakeholders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create stakeholders" ON public.stakeholders FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update stakeholders" ON public.stakeholders FOR UPDATE TO authenticated USING (auth.uid() = created_by OR public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete stakeholders" ON public.stakeholders FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Programme stakeholders policies
CREATE POLICY "Authenticated users can view programme stakeholders" ON public.programme_stakeholders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage programme stakeholders" ON public.programme_stakeholders FOR ALL TO authenticated USING (true);

-- Weekly reports policies
CREATE POLICY "Authenticated users can view weekly reports" ON public.weekly_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create weekly reports" ON public.weekly_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = submitted_by);
CREATE POLICY "Users can update own reports" ON public.weekly_reports FOR UPDATE TO authenticated USING (auth.uid() = submitted_by OR public.is_admin(auth.uid()));

-- Chat messages policies
CREATE POLICY "Users can view own chat messages" ON public.chat_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own chat messages" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    'stakeholder'
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'stakeholder');
  
  RETURN NEW;
END;
$$;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Add update triggers to all tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_programmes_updated_at BEFORE UPDATE ON public.programmes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_risks_updated_at BEFORE UPDATE ON public.risks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_issues_updated_at BEFORE UPDATE ON public.issues FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_benefits_updated_at BEFORE UPDATE ON public.benefits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stakeholders_updated_at BEFORE UPDATE ON public.stakeholders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_weekly_reports_updated_at BEFORE UPDATE ON public.weekly_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.programmes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.risks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.issues;
ALTER PUBLICATION supabase_realtime ADD TABLE public.benefits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.weekly_reports;
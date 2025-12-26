-- 1. Add first_name and last_name columns to profiles (will migrate data from full_name)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name text;

-- Migrate existing full_name data to first_name/last_name
UPDATE public.profiles 
SET 
  first_name = TRIM(split_part(COALESCE(full_name, ''), ' ', 1)),
  last_name = TRIM(CASE 
    WHEN position(' ' in COALESCE(full_name, '')) > 0 
    THEN substring(COALESCE(full_name, '') from position(' ' in full_name) + 1)
    ELSE ''
  END)
WHERE first_name IS NULL OR last_name IS NULL;

-- 2. Create custom_roles table for dynamic RBAC
CREATE TABLE public.custom_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  permissions jsonb DEFAULT '[]'::jsonb,
  color text DEFAULT '#6b7280',
  icon text DEFAULT 'Users',
  is_system boolean DEFAULT false,
  can_manage_programmes boolean DEFAULT false,
  can_manage_projects boolean DEFAULT false,
  can_manage_products boolean DEFAULT false,
  can_manage_users boolean DEFAULT false,
  can_view_reports boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

-- RLS policies for custom_roles
CREATE POLICY "Everyone can view roles" ON public.custom_roles FOR SELECT USING (true);
CREATE POLICY "Admins can manage roles" ON public.custom_roles FOR ALL USING (is_admin(auth.uid()));

-- Insert default system roles
INSERT INTO public.custom_roles (name, description, color, icon, is_system, can_manage_programmes, can_manage_projects, can_manage_products, can_manage_users, can_view_reports) VALUES
('Administrator', 'Full system access with all permissions', '#2563eb', 'Crown', true, true, true, true, true, true),
('Programme Owner', 'Can manage assigned programmes and their projects', '#10b981', 'Briefcase', true, true, true, false, false, true),
('Project Manager', 'Can manage assigned projects', '#f59e0b', 'UserCog', true, false, true, false, false, true),
('Stakeholder', 'View-only access to assigned items', '#6b7280', 'Users', true, false, false, false, false, true);

-- 3. Create notifications table
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  read boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  link text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for notifications
CREATE POLICY "Users can view their own notifications" ON public.notifications 
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON public.notifications 
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications" ON public.notifications 
FOR INSERT WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_notifications_user_id ON public.notifications (user_id);
CREATE INDEX idx_notifications_read ON public.notifications (user_id, read);

-- Update trigger for updated_at on custom_roles
CREATE TRIGGER update_custom_roles_updated_at
BEFORE UPDATE ON public.custom_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
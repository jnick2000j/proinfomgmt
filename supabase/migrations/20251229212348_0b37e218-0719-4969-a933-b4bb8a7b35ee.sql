-- Allow anyone (including unauthenticated users) to read global branding for login page
CREATE POLICY "Anyone can view global branding" 
ON public.branding_settings 
FOR SELECT 
USING (organization_id IS NULL);
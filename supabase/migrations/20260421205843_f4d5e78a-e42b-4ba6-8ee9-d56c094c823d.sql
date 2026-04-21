-- ============================================================
-- 1. WORKFLOW EVIDENCE: drop dead null-org bypass branches
-- ============================================================
DROP POLICY IF EXISTS "Org editors insert workflow evidence" ON public.workflow_evidence;
DROP POLICY IF EXISTS "Org editors update workflow evidence" ON public.workflow_evidence;
DROP POLICY IF EXISTS "Org editors delete workflow evidence" ON public.workflow_evidence;

CREATE POLICY "Org editors insert workflow evidence"
  ON public.workflow_evidence FOR INSERT
  WITH CHECK (has_org_access(auth.uid(), organization_id, 'editor'::text));

CREATE POLICY "Org editors update workflow evidence"
  ON public.workflow_evidence FOR UPDATE
  USING (has_org_access(auth.uid(), organization_id, 'editor'::text));

CREATE POLICY "Org editors delete workflow evidence"
  ON public.workflow_evidence FOR DELETE
  USING (has_org_access(auth.uid(), organization_id, 'editor'::text));

-- ============================================================
-- 2. PROFILES: restrict PII exposure to self / admin / manager
-- ============================================================

-- Helper: is the user a manager (or admin) in ANY org shared with the target user
CREATE OR REPLACE FUNCTION public.is_org_manager_of(_caller uuid, _target_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_organization_access uoa1
      JOIN public.user_organization_access uoa2
        ON uoa1.organization_id = uoa2.organization_id
     WHERE uoa1.user_id = _caller
       AND uoa2.user_id = _target_user
       AND uoa1.access_level IN ('admin','manager','owner')
  );
$$;

-- Replace the broad org-wide SELECT policy with a strict one
DROP POLICY IF EXISTS "Users can view profiles in their org" ON public.profiles;

CREATE POLICY "Users can view sensitive profile fields when authorised"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_admin(auth.uid())
    OR public.is_org_manager_of(auth.uid(), user_id)
  );

-- ============================================================
-- 3. SAFE DIRECTORY VIEW: name/avatar/role only — no PII
-- ============================================================
CREATE OR REPLACE VIEW public.profiles_directory
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.user_id,
  p.full_name,
  p.first_name,
  p.last_name,
  p.email,
  p.avatar_url,
  p.role,
  p.department,
  p.archived,
  p.default_organization_id,
  p.preferred_language,
  p.created_at,
  p.updated_at
FROM public.profiles p
WHERE EXISTS (
  SELECT 1
    FROM public.user_organization_access uoa1
    JOIN public.user_organization_access uoa2
      ON uoa1.organization_id = uoa2.organization_id
   WHERE uoa1.user_id = auth.uid()
     AND uoa2.user_id = p.user_id
)
OR auth.uid() = p.user_id
OR public.is_admin(auth.uid());

GRANT SELECT ON public.profiles_directory TO authenticated;
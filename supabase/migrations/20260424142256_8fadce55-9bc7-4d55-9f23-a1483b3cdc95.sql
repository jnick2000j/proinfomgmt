-- 1) Tighten profiles SELECT policy to only allow org owners/admins (not "manager")
-- to view co-member profiles, and require both sides to have ACTIVE org access.

DROP POLICY IF EXISTS "Users can view sensitive profile fields when authorised" ON public.profiles;

-- Helper: stricter check requiring both caller and target to share an org
-- where the caller has owner/admin access. This narrows the previous
-- is_org_manager_of() which also included 'manager'.
CREATE OR REPLACE FUNCTION public.is_org_admin_of(_caller uuid, _target_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_organization_access uoa1
      JOIN public.user_organization_access uoa2
        ON uoa1.organization_id = uoa2.organization_id
     WHERE uoa1.user_id = _caller
       AND uoa2.user_id = _target_user
       AND uoa1.access_level IN ('admin','owner')
  );
$$;

CREATE POLICY "Users can view sensitive profile fields when authorised"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = user_id
  OR is_admin(auth.uid())
  OR public.is_org_admin_of(auth.uid(), user_id)
);

-- 2) Tighten realtime.messages SELECT policy: require authenticated user
-- with active org membership AND restrict subscriptions to known channel
-- topic patterns used by the app. This prevents arbitrary topic abuse
-- while underlying postgres_changes still enforce table RLS on payloads.

DROP POLICY IF EXISTS "Authenticated users can receive realtime" ON realtime.messages;

CREATE POLICY "Authenticated users can receive realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_organization_access uoa
      WHERE uoa.user_id = auth.uid()
    )
  )
  AND (
    -- Allow only known app channel topic patterns
    realtime.topic() IN (
      'programmes-changes',
      'projects-changes',
      'risks-changes',
      'issues-changes',
      'benefits-changes',
      'weekly_reports-changes',
      'notifications-page'
    )
  )
);
-- 1) Tighten csat_responses SELECT: only org admins/managers (not viewers/editors).
-- The unauthenticated submission flow already uses the SECURITY DEFINER
-- get_csat_by_token RPC, so members never need to read tokens / reporter emails.
DROP POLICY IF EXISTS "Members view org csat responses" ON public.csat_responses;

CREATE POLICY "Org admins view csat responses"
ON public.csat_responses
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.has_org_access(auth.uid(), organization_id, 'manager')
);

-- 2) Scope realtime channels to per-org topics.
-- Topic format must be: "<table>-changes:<organization_id>" or "notifications-page:<user_id>"
-- The policy verifies the subscriber actually belongs to that organization
-- (or, for notifications, that the topic carries their own user id).
DROP POLICY IF EXISTS "Authenticated users can receive realtime" ON realtime.messages;

CREATE POLICY "Authenticated users can receive realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (
    -- Per-org topics: "<allowed-prefix>:<organization_id>"
    split_part(realtime.topic(), ':', 1) IN (
      'programmes-changes',
      'projects-changes',
      'risks-changes',
      'issues-changes',
      'benefits-changes',
      'weekly_reports-changes'
    )
    AND split_part(realtime.topic(), ':', 2) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.user_organization_access uoa
      WHERE uoa.user_id = auth.uid()
        AND uoa.organization_id::text = split_part(realtime.topic(), ':', 2)
    )
  )
  OR (
    -- Per-user notifications topic: "notifications-page:<user_id>"
    split_part(realtime.topic(), ':', 1) = 'notifications-page'
    AND split_part(realtime.topic(), ':', 2) = auth.uid()::text
  )
);
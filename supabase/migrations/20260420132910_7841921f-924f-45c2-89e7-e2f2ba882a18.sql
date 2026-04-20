-- Fix 1: Remove the overly permissive duplicate SELECT policy on status_history.
-- A properly scoped "Users can view org status history" policy already exists.
DROP POLICY IF EXISTS "Users can view status history for their organization entities" ON public.status_history;

-- Fix 2: Restrict Realtime channel subscriptions to authenticated users with
-- organization access. Without RLS on realtime.messages, any authenticated user
-- could subscribe to any topic and receive cross-org row-change broadcasts.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Allow only authenticated users to receive broadcast/presence/postgres_changes
-- messages on topics matching tables they have organization access to.
-- Topic format used in the app: "<table>-changes" (see useRealtimeData.ts).
-- We restrict by requiring the user to have at least one organization access row.
DROP POLICY IF EXISTS "Authenticated users with org access can receive realtime" ON realtime.messages;
CREATE POLICY "Authenticated users with org access can receive realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_organization_access uoa
    WHERE uoa.user_id = auth.uid()
  )
  OR public.is_admin(auth.uid())
);
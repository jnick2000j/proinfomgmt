-- Block accepting invitations into suspended organizations.
-- Returns a JSONB error code so the UI can show the suspension message.
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _invite organization_invitations;
  _user_id uuid;
  _email text;
  _org organizations;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _user_id;

  SELECT * INTO _invite FROM organization_invitations
   WHERE token = _token AND status = 'pending' AND expires_at > now()
   LIMIT 1;

  IF _invite IS NULL THEN
    RAISE EXCEPTION 'Invitation not found, expired, or already used';
  END IF;

  IF lower(_invite.email) <> lower(_email) THEN
    RAISE EXCEPTION 'This invitation was sent to %, but you are signed in as %', _invite.email, _email;
  END IF;

  -- Block if the target organization is currently suspended.
  SELECT * INTO _org FROM public.organizations WHERE id = _invite.organization_id;
  IF _org.is_suspended THEN
    RAISE EXCEPTION 'Organization "%" is currently suspended (%). Contact a platform administrator to restore access before accepting this invitation.',
      _org.name,
      COALESCE(_org.suspension_kind, 'suspended');
  END IF;

  INSERT INTO user_organization_access (user_id, organization_id, access_level)
  VALUES (_user_id, _invite.organization_id, _invite.access_level)
  ON CONFLICT (user_id, organization_id) DO UPDATE SET access_level = EXCLUDED.access_level;

  UPDATE organization_invitations
     SET status = 'accepted', accepted_at = now()
   WHERE id = _invite.id;

  UPDATE profiles SET default_organization_id = _invite.organization_id
   WHERE user_id = _user_id AND default_organization_id IS NULL;

  RETURN jsonb_build_object('organization_id', _invite.organization_id);
END;
$function$;

-- Helper RPC: list org admins/owners for notifications (security definer so the suspending platform admin can read it).
CREATE OR REPLACE FUNCTION public.get_org_admin_emails(_org_id uuid)
RETURNS TABLE (user_id uuid, email text, full_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT p.user_id, p.email, p.full_name
    FROM public.user_organization_access uoa
    JOIN public.profiles p ON p.user_id = uoa.user_id
   WHERE uoa.organization_id = _org_id
     AND uoa.access_level IN ('admin','owner','manager')
     AND p.email IS NOT NULL
     AND COALESCE(p.archived, false) = false;
$$;

REVOKE ALL ON FUNCTION public.get_org_admin_emails(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_admin_emails(uuid) TO authenticated;
-- Skip writing to org_override_audit_log when the parent organization is being/has been deleted
-- (cascade-delete ordering can leave us trying to insert an audit row with no parent org).

CREATE OR REPLACE FUNCTION public.log_org_plan_override_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _email text;
  _before jsonb;
  _after jsonb;
  _org_id uuid;
BEGIN
  _org_id := COALESCE(NEW.organization_id, OLD.organization_id);

  -- If the parent org no longer exists (e.g. mid-cascade delete), skip auditing.
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _org_id) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF _actor IS NOT NULL THEN
    SELECT email INTO _email FROM public.profiles WHERE user_id = _actor LIMIT 1;
  END IF;

  IF TG_OP = 'INSERT' THEN
    _after := jsonb_build_object(
      'feature_key', NEW.feature_key,
      'override_value', NEW.override_value,
      'reason', NEW.reason,
      'effective_from', NEW.effective_from,
      'expires_at', NEW.expires_at
    );
    INSERT INTO public.org_override_audit_log
      (organization_id, change_kind, operation, feature_key, before_value, after_value, actor_user_id, actor_email, reason)
    VALUES (NEW.organization_id, 'feature_override', 'insert', NEW.feature_key, NULL, _after, _actor, _email, NEW.reason);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    _before := jsonb_build_object(
      'feature_key', OLD.feature_key,
      'override_value', OLD.override_value,
      'reason', OLD.reason,
      'effective_from', OLD.effective_from,
      'expires_at', OLD.expires_at
    );
    _after := jsonb_build_object(
      'feature_key', NEW.feature_key,
      'override_value', NEW.override_value,
      'reason', NEW.reason,
      'effective_from', NEW.effective_from,
      'expires_at', NEW.expires_at
    );
    IF _before IS DISTINCT FROM _after THEN
      INSERT INTO public.org_override_audit_log
        (organization_id, change_kind, operation, feature_key, before_value, after_value, actor_user_id, actor_email, reason)
      VALUES (NEW.organization_id, 'feature_override', 'update', NEW.feature_key, _before, _after, _actor, _email, NEW.reason);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _before := jsonb_build_object(
      'feature_key', OLD.feature_key,
      'override_value', OLD.override_value,
      'reason', OLD.reason,
      'effective_from', OLD.effective_from,
      'expires_at', OLD.expires_at
    );
    INSERT INTO public.org_override_audit_log
      (organization_id, change_kind, operation, feature_key, before_value, after_value, actor_user_id, actor_email, reason)
    VALUES (OLD.organization_id, 'feature_override', 'delete', OLD.feature_key, _before, NULL, _actor, _email, OLD.reason);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_org_subscription_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _email text;
  _before jsonb;
  _after jsonb;
  _org_id uuid;
BEGIN
  _org_id := COALESCE(NEW.organization_id, OLD.organization_id);

  -- Skip auditing if parent org is gone (cascade delete).
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _org_id) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF _actor IS NOT NULL THEN
    SELECT email INTO _email FROM public.profiles WHERE user_id = _actor LIMIT 1;
  END IF;

  IF TG_OP = 'INSERT' THEN
    _after := jsonb_build_object(
      'plan_id', NEW.plan_id,
      'status', NEW.status,
      'trial_ends_at', NEW.trial_ends_at,
      'current_period_start', NEW.current_period_start,
      'current_period_end', NEW.current_period_end
    );
    INSERT INTO public.org_override_audit_log
      (organization_id, change_kind, operation, before_value, after_value, actor_user_id, actor_email)
    VALUES (NEW.organization_id, 'plan_assignment', 'insert', NULL, _after, _actor, _email);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
       OR NEW.current_period_start IS DISTINCT FROM OLD.current_period_start
       OR NEW.current_period_end IS DISTINCT FROM OLD.current_period_end THEN
      _before := jsonb_build_object(
        'plan_id', OLD.plan_id,
        'status', OLD.status,
        'trial_ends_at', OLD.trial_ends_at,
        'current_period_start', OLD.current_period_start,
        'current_period_end', OLD.current_period_end
      );
      _after := jsonb_build_object(
        'plan_id', NEW.plan_id,
        'status', NEW.status,
        'trial_ends_at', NEW.trial_ends_at,
        'current_period_start', NEW.current_period_start,
        'current_period_end', NEW.current_period_end
      );
      INSERT INTO public.org_override_audit_log
        (organization_id, change_kind, operation, before_value, after_value, actor_user_id, actor_email)
      VALUES (NEW.organization_id, 'plan_assignment', 'update', _before, _after, _actor, _email);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    _before := jsonb_build_object(
      'plan_id', OLD.plan_id,
      'status', OLD.status,
      'trial_ends_at', OLD.trial_ends_at,
      'current_period_start', OLD.current_period_start,
      'current_period_end', OLD.current_period_end
    );
    INSERT INTO public.org_override_audit_log
      (organization_id, change_kind, operation, before_value, after_value, actor_user_id, actor_email)
    VALUES (OLD.organization_id, 'plan_assignment', 'delete', _before, NULL, _actor, _email);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;
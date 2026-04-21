-- =======================================================================
-- Phase 4 / On-Premises license-mode wiring
--
-- 1. consume_ai_credits + get_ai_credit_status now treat an active license
--    as unlimited unless the license explicitly sets ai_credits_monthly to a
--    positive cap. This means on-prem / PO-billed customers don't hit the
--    cloud-only Stripe-backed monthly cap.
--
-- 2. New helper get_deployment_mode(_org_id) returns 'on_prem' | 'cloud' so
--    the frontend can gate billing UIs without re-deriving from the
--    entitlements blob.
-- =======================================================================

-- get_deployment_mode -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_deployment_mode(_org_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT deployment_mode FROM public.organization_licenses
       WHERE organization_id = _org_id
         AND status = 'active'
         AND valid_from <= now()
         AND (valid_until IS NULL OR valid_until > now())
       ORDER BY issued_at DESC
       LIMIT 1),
    'cloud'
  );
$$;

-- consume_ai_credits ------------------------------------------------------
-- Adds: when an active license exists and ai_credits_monthly = -1 (or NULL),
-- treat as unlimited; otherwise the license cap REPLACES the plan cap.
CREATE OR REPLACE FUNCTION public.consume_ai_credits(
  _org_id uuid,
  _amount integer DEFAULT 1,
  _action_type text DEFAULT 'ai_call'::text,
  _model text DEFAULT NULL::text,
  _user_id uuid DEFAULT NULL::uuid,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _quota INTEGER;
  _period_start DATE := date_trunc('month', now() AT TIME ZONE 'utc')::date;
  _used INTEGER := 0;
  _purchased INTEGER := 0;
  _total_quota INTEGER;
  _new_used INTEGER;
  _allowed BOOLEAN := false;
  _lic public.organization_licenses;
BEGIN
  IF _org_id IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'quota', -1, 'used', 0, 'remaining', -1, 'unlimited', true);
  END IF;
  IF _amount IS NULL OR _amount < 1 THEN _amount := 1; END IF;

  -- 1. License path: an active license overrides plan-derived AI quota.
  SELECT * INTO _lic FROM public.organization_licenses
   WHERE organization_id = _org_id
     AND status = 'active'
     AND valid_from <= now()
     AND (valid_until IS NULL OR valid_until > now())
   ORDER BY issued_at DESC
   LIMIT 1;

  IF _lic.id IS NOT NULL THEN
    -- Treat NULL or -1 as unlimited
    IF _lic.ai_credits_monthly IS NULL OR _lic.ai_credits_monthly = -1 THEN
      INSERT INTO ai_credit_ledger (organization_id, user_id, period_start, amount, action_type, model, decision, metadata)
      VALUES (_org_id, _user_id, _period_start, _amount, _action_type, _model, 'allowed',
              _metadata || jsonb_build_object('source', 'license', 'license_id', _lic.id));
      RETURN jsonb_build_object('allowed', true, 'quota', -1, 'used', 0, 'remaining', -1,
                                'unlimited', true, 'source', 'license', 'period_start', _period_start);
    END IF;
    -- Otherwise the license sets a hard monthly cap.
    _quota := _lic.ai_credits_monthly;
  ELSE
    -- 2. Plan path
    SELECT COALESCE(NULLIF(public.get_org_feature_value(_org_id, 'limit_ai_credits_monthly')::text, 'null')::integer, 0)
      INTO _quota;

    IF _quota = -1 THEN
      INSERT INTO ai_credit_ledger (organization_id, user_id, period_start, amount, action_type, model, decision, metadata)
      VALUES (_org_id, _user_id, _period_start, _amount, _action_type, _model, 'allowed', _metadata);
      RETURN jsonb_build_object('allowed', true, 'quota', -1, 'used', 0, 'remaining', -1,
                                'unlimited', true, 'period_start', _period_start);
    END IF;
  END IF;

  INSERT INTO ai_credit_usage (organization_id, period_start, used, purchased)
  VALUES (_org_id, _period_start, 0, 0)
  ON CONFLICT (organization_id, period_start) DO NOTHING;

  SELECT used, purchased INTO _used, _purchased
    FROM ai_credit_usage
   WHERE organization_id = _org_id AND period_start = _period_start
   FOR UPDATE;

  _total_quota := _quota + COALESCE(_purchased, 0);

  IF _used + _amount <= _total_quota THEN
    UPDATE ai_credit_usage
       SET used = _used + _amount,
           last_action = _action_type,
           last_model  = _model,
           updated_at  = now()
     WHERE organization_id = _org_id AND period_start = _period_start
     RETURNING used INTO _new_used;
    _allowed := true;
  ELSE
    _new_used := _used;
    _allowed := false;
  END IF;

  INSERT INTO ai_credit_ledger (organization_id, user_id, period_start, amount, action_type, model, decision, metadata)
  VALUES (_org_id, _user_id, _period_start, _amount, _action_type, _model,
          CASE WHEN _allowed THEN 'allowed' ELSE 'blocked' END,
          _metadata || jsonb_build_object('source', CASE WHEN _lic.id IS NOT NULL THEN 'license' ELSE 'plan' END));

  RETURN jsonb_build_object(
    'allowed', _allowed,
    'quota', _quota,
    'purchased', COALESCE(_purchased, 0),
    'used', _new_used,
    'remaining', GREATEST(0, _total_quota - _new_used),
    'unlimited', false,
    'source', CASE WHEN _lic.id IS NOT NULL THEN 'license' ELSE 'plan' END,
    'period_start', _period_start
  );
END;
$$;

-- get_ai_credit_status ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ai_credit_status(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _quota INTEGER;
  _period_start DATE := date_trunc('month', now() AT TIME ZONE 'utc')::date;
  _period_end   DATE := (date_trunc('month', now() AT TIME ZONE 'utc') + interval '1 month')::date;
  _used INTEGER := 0;
  _purchased INTEGER := 0;
  _total_quota INTEGER;
  _lic public.organization_licenses;
  _source TEXT := 'plan';
BEGIN
  IF _org_id IS NULL THEN
    RETURN jsonb_build_object(
      'quota', 0, 'used', 0, 'remaining', 0,
      'unlimited', false, 'purchased', 0,
      'source', 'none',
      'period_start', _period_start,
      'period_end', _period_end
    );
  END IF;

  -- License overrides plan-derived AI quota.
  SELECT * INTO _lic FROM public.organization_licenses
   WHERE organization_id = _org_id
     AND status = 'active'
     AND valid_from <= now()
     AND (valid_until IS NULL OR valid_until > now())
   ORDER BY issued_at DESC
   LIMIT 1;

  IF _lic.id IS NOT NULL THEN
    _source := 'license';
    IF _lic.ai_credits_monthly IS NULL OR _lic.ai_credits_monthly = -1 THEN
      RETURN jsonb_build_object(
        'quota', -1, 'used', 0, 'remaining', -1,
        'unlimited', true, 'purchased', 0,
        'source', 'license',
        'license_id', _lic.id,
        'deployment_mode', _lic.deployment_mode,
        'period_start', _period_start, 'period_end', _period_end
      );
    END IF;
    _quota := _lic.ai_credits_monthly;
  ELSE
    SELECT COALESCE(NULLIF(public.get_org_feature_value(_org_id, 'limit_ai_credits_monthly')::text, 'null')::integer, 0)
      INTO _quota;
  END IF;

  SELECT COALESCE(used, 0), COALESCE(purchased, 0)
    INTO _used, _purchased
    FROM ai_credit_usage
   WHERE organization_id = _org_id
     AND period_start = _period_start;

  IF _quota = -1 THEN
    RETURN jsonb_build_object(
      'quota', -1, 'used', COALESCE(_used,0), 'remaining', -1,
      'unlimited', true, 'purchased', COALESCE(_purchased,0),
      'source', _source,
      'period_start', _period_start, 'period_end', _period_end
    );
  END IF;

  _total_quota := _quota + COALESCE(_purchased, 0);

  RETURN jsonb_build_object(
    'quota', _quota,
    'purchased', COALESCE(_purchased, 0),
    'used', COALESCE(_used, 0),
    'remaining', GREATEST(0, _total_quota - COALESCE(_used, 0)),
    'unlimited', false,
    'source', _source,
    'period_start', _period_start,
    'period_end', _period_end
  );
END;
$$;
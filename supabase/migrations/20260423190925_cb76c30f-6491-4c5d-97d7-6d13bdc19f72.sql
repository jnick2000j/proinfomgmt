-- 1. Extend subscription_plans
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS plan_kind text NOT NULL DEFAULT 'core',
  ADD COLUMN IF NOT EXISTS billing_model text NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS is_addon boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS target_audience text;

ALTER TABLE public.subscription_plans
  DROP CONSTRAINT IF EXISTS subscription_plans_plan_kind_check;
ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_plan_kind_check
  CHECK (plan_kind IN ('core', 'helpdesk', 'itsm', 'addon'));

ALTER TABLE public.subscription_plans
  DROP CONSTRAINT IF EXISTS subscription_plans_billing_model_check;
ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_billing_model_check
  CHECK (billing_model IN ('flat', 'per_seat'));

CREATE INDEX IF NOT EXISTS idx_subscription_plans_plan_kind
  ON public.subscription_plans(plan_kind)
  WHERE is_active = true AND is_archived = false;

-- 2. New numeric features in catalog
INSERT INTO public.plan_features (feature_key, name, description, category, feature_type, default_value, display_order, is_active)
VALUES
  ('helpdesk_max_agents', 'Max Helpdesk Agents', 'Maximum number of users who can be assigned the Helpdesk Agent role.', 'support', 'numeric', '1'::jsonb, 110, true),
  ('helpdesk_max_tickets_per_month', 'Helpdesk Monthly Ticket Cap', 'Maximum number of helpdesk tickets that can be created per month.', 'support', 'numeric', '100'::jsonb, 111, true),
  ('cm_max_approvers', 'Max Change Approvers', 'Maximum number of users who can be assigned a Change Management approver role.', 'governance', 'numeric', '5'::jsonb, 120, true)
ON CONFLICT (feature_key) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  feature_type = EXCLUDED.feature_type,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active;

-- 3. New table: organization_addon_subscriptions
CREATE TABLE IF NOT EXISTS public.organization_addon_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  addon_plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  stripe_subscription_id text UNIQUE,
  stripe_customer_id text,
  stripe_price_id text,
  billing_interval text,
  status text NOT NULL DEFAULT 'active',
  environment text NOT NULL DEFAULT 'sandbox',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  trial_ends_at timestamptz,
  canceled_at timestamptz,
  feature_keys text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_addon_subs_org ON public.organization_addon_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_addon_subs_stripe ON public.organization_addon_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_addon_subs_status ON public.organization_addon_subscriptions(organization_id, status) WHERE status IN ('active','trialing','past_due');

ALTER TABLE public.organization_addon_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view org addons" ON public.organization_addon_subscriptions;
CREATE POLICY "Members view org addons"
  ON public.organization_addon_subscriptions FOR SELECT
  USING (
    public.has_org_access(auth.uid(), organization_id, 'view')
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Org admins manage addons" ON public.organization_addon_subscriptions;
CREATE POLICY "Org admins manage addons"
  ON public.organization_addon_subscriptions FOR ALL
  USING (
    public.has_org_access(auth.uid(), organization_id, 'admin')
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    public.has_org_access(auth.uid(), organization_id, 'admin')
    OR public.is_admin(auth.uid())
  );

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_addon_subs_updated_at ON public.organization_addon_subscriptions;
CREATE TRIGGER trg_addon_subs_updated_at
  BEFORE UPDATE ON public.organization_addon_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Helper function: apply addon overrides for an active addon subscription
CREATE OR REPLACE FUNCTION public.apply_addon_feature_overrides(_addon_sub_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub record;
  _key text;
BEGIN
  SELECT * INTO _sub FROM public.organization_addon_subscriptions WHERE id = _addon_sub_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF _sub.status NOT IN ('active','trialing','past_due') THEN
    -- Subscription not active: remove overrides we previously installed
    DELETE FROM public.organization_plan_overrides
    WHERE organization_id = _sub.organization_id
      AND feature_key = ANY(_sub.feature_keys)
      AND reason = 'addon:' || _sub.id::text;
    RETURN;
  END IF;

  FOREACH _key IN ARRAY _sub.feature_keys LOOP
    INSERT INTO public.organization_plan_overrides
      (organization_id, feature_key, override_value, expires_at, reason)
    VALUES
      (_sub.organization_id, _key, 'true'::jsonb, _sub.current_period_end, 'addon:' || _sub.id::text)
    ON CONFLICT (organization_id, feature_key) DO UPDATE
      SET override_value = EXCLUDED.override_value,
          expires_at = EXCLUDED.expires_at,
          reason = EXCLUDED.reason,
          updated_at = now();
  END LOOP;
END;
$$;

-- 5. Trigger: keep overrides in sync with addon subscription lifecycle
CREATE OR REPLACE FUNCTION public.sync_addon_overrides_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.apply_addon_feature_overrides(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_addon_overrides ON public.organization_addon_subscriptions;
CREATE TRIGGER trg_sync_addon_overrides
  AFTER INSERT OR UPDATE OF status, feature_keys, current_period_end ON public.organization_addon_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_addon_overrides_trigger();

-- Allow product scope and product_status report type
ALTER TABLE public.governance_reports
  DROP CONSTRAINT IF EXISTS governance_reports_scope_type_check,
  DROP CONSTRAINT IF EXISTS governance_reports_report_type_check;

ALTER TABLE public.governance_reports
  ADD CONSTRAINT governance_reports_scope_type_check
    CHECK (scope_type = ANY (ARRAY['programme'::text, 'project'::text, 'product'::text])),
  ADD CONSTRAINT governance_reports_report_type_check
    CHECK (report_type = ANY (ARRAY['highlight'::text, 'end_stage'::text, 'programme_status'::text, 'product_status'::text]));

-- Allow product scope on compliance scores
ALTER TABLE public.compliance_scores
  DROP CONSTRAINT IF EXISTS compliance_scores_scope_type_check;

ALTER TABLE public.compliance_scores
  ADD CONSTRAINT compliance_scores_scope_type_check
    CHECK (scope_type = ANY (ARRAY['programme'::text, 'project'::text, 'product'::text, 'organization'::text]));

-- Update compliance score function to support products
CREATE OR REPLACE FUNCTION public.compute_compliance_score(_scope_type text, _scope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _controls_score INTEGER := 0;
  _cadence_score INTEGER := 0;
  _hygiene_score INTEGER := 0;
  _composite INTEGER := 0;
  _details JSONB := '{}'::jsonb;
  _has_risks BOOLEAN;
  _has_issues BOOLEAN;
  _has_milestones BOOLEAN;
  _has_benefits BOOLEAN;
  _has_stakeholders BOOLEAN;
  _recent_updates INTEGER;
  _stale_risks INTEGER;
  _orphan_risks INTEGER;
  _stale_issues INTEGER;
  _orphan_issues INTEGER;
  _filter_col TEXT;
BEGIN
  IF _scope_type = 'programme' THEN
    _filter_col := 'programme_id';
  ELSIF _scope_type = 'project' THEN
    _filter_col := 'project_id';
  ELSIF _scope_type = 'product' THEN
    _filter_col := 'product_id';
  ELSE
    RETURN jsonb_build_object('error', 'unsupported scope');
  END IF;

  EXECUTE format('SELECT EXISTS(SELECT 1 FROM risks WHERE %I = $1)', _filter_col) USING _scope_id INTO _has_risks;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM issues WHERE %I = $1)', _filter_col) USING _scope_id INTO _has_issues;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM milestones WHERE %I = $1)', _filter_col) USING _scope_id INTO _has_milestones;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM benefits WHERE %I = $1)', _filter_col) USING _scope_id INTO _has_benefits;

  -- Stakeholders table may not have product_id; guard safely
  BEGIN
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM stakeholders WHERE %I = $1)', _filter_col) USING _scope_id INTO _has_stakeholders;
  EXCEPTION WHEN undefined_column THEN
    _has_stakeholders := FALSE;
  END;

  _controls_score := (
    CASE WHEN _has_risks THEN 20 ELSE 0 END +
    CASE WHEN _has_issues THEN 20 ELSE 0 END +
    CASE WHEN _has_milestones THEN 20 ELSE 0 END +
    CASE WHEN _has_benefits THEN 20 ELSE 0 END +
    CASE WHEN _has_stakeholders THEN 20 ELSE 0 END
  );

  SELECT COUNT(*) INTO _recent_updates
  FROM entity_updates
  WHERE entity_type = _scope_type
    AND entity_id = _scope_id
    AND created_at > now() - INTERVAL '14 days';

  _cadence_score := LEAST(100, _recent_updates * 50);

  EXECUTE format('SELECT COUNT(*) FROM risks WHERE %I = $1 AND owner_id IS NULL AND status NOT IN (''closed'')', _filter_col)
    USING _scope_id INTO _orphan_risks;
  EXECUTE format('SELECT COUNT(*) FROM risks WHERE %I = $1 AND updated_at < now() - INTERVAL ''30 days'' AND status NOT IN (''closed'')', _filter_col)
    USING _scope_id INTO _stale_risks;
  EXECUTE format('SELECT COUNT(*) FROM issues WHERE %I = $1 AND owner_id IS NULL AND status NOT IN (''resolved'', ''closed'')', _filter_col)
    USING _scope_id INTO _orphan_issues;
  EXECUTE format('SELECT COUNT(*) FROM issues WHERE %I = $1 AND updated_at < now() - INTERVAL ''30 days'' AND status NOT IN (''resolved'', ''closed'')', _filter_col)
    USING _scope_id INTO _stale_issues;

  _hygiene_score := GREATEST(0, 100 - (_orphan_risks * 10) - (_stale_risks * 10) - (_orphan_issues * 10) - (_stale_issues * 10));

  _composite := ROUND((_controls_score * 0.4) + (_cadence_score * 0.3) + (_hygiene_score * 0.3));

  _details := jsonb_build_object(
    'controls', jsonb_build_object(
      'risks', _has_risks,
      'issues', _has_issues,
      'milestones', _has_milestones,
      'benefits', _has_benefits,
      'stakeholders', _has_stakeholders
    ),
    'cadence', jsonb_build_object('recent_updates_14d', _recent_updates),
    'hygiene', jsonb_build_object(
      'orphan_risks', _orphan_risks,
      'stale_risks', _stale_risks,
      'orphan_issues', _orphan_issues,
      'stale_issues', _stale_issues
    )
  );

  RETURN jsonb_build_object(
    'score', _composite,
    'controls_score', _controls_score,
    'cadence_score', _cadence_score,
    'hygiene_score', _hygiene_score,
    'details', _details
  );
END;
$function$;

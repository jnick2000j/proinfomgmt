
-- =============================================================
-- RBAC expansion — cover Phase 6 + all recent features.
-- =============================================================

-- 1. Add NEW permission modules (idempotent).
INSERT INTO public.permission_modules (module_key, label, category, description, sort_order) VALUES
  ('audit_log',         'Audit Log',           'Compliance',   'View and export the security/audit log; manage retention policy.',                330),
  ('compliance',        'Compliance & Residency','Compliance', 'Manage compliance rules, data-residency policy and attestations.',                340),
  ('comms_packs',       'Comms Packs',         'Reporting',    'Generate, edit and publish stakeholder communications packs.',                    350),
  ('governance_reports','Governance Reports',  'Reporting',    'Generate and review governance/PRINCE2 reports.',                                  360),
  ('scheduled_reports', 'Scheduled Reports',   'Reporting',    'Create and manage scheduled report deliveries.',                                   370),
  ('templates',         'Templates & Wizards', 'Productivity', 'Create and manage reusable templates and wizard flows.',                          380),
  ('notifications',     'Notifications',       'Productivity', 'Manage notification preferences and update reminders.',                            390),
  ('search',            'Ask the TaskMaster',  'Productivity', 'Use cross-org search and the TaskMaster assistant.',                              400),
  ('integrations',      'Integrations',        'Admin',        'Configure external integrations (MCP, API sync, webhooks).',                      410),
  ('plan_management',   'Plan Management',     'Platform',     'Edit subscription plans, plan features and per-org overrides (platform admin).',  420),
  ('platform_support',  'Platform Support',    'Platform',     'Triage and respond to cross-org platform support requests.',                      430),
  ('sso_management',    'SSO Management',      'Platform',     'Approve, configure and revoke organization SSO setups.',                          440),
  ('stakeholder_portal','Stakeholder Portal',  'Access',       'Manage stakeholder portal access grants for orgs/programmes/projects/products.',  450),
  ('ai_insights',       'AI Insights',         'AI',           'Run and review automated AI insights and risk-narrative generation.',             460),
  ('ai_credits',        'AI Credits',          'AI',           'View and manage organization AI credit allowance and ledger.',                    470)
ON CONFLICT (module_key) DO UPDATE SET
  label       = EXCLUDED.label,
  category    = EXCLUDED.category,
  description = EXCLUDED.description,
  sort_order  = EXCLUDED.sort_order;

-- 2. Add NEW top-level capability flags on custom_roles.
ALTER TABLE public.custom_roles
  ADD COLUMN IF NOT EXISTS can_view_audit_log     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_compliance  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_publish_comms      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_templates   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_integrations boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_platform    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_ai_insights   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_ai_credits  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_stakeholder_portal boolean NOT NULL DEFAULT false;

-- 3. Seed sensible defaults for the SYSTEM roles so existing customers
--    don't lose access on next login.
UPDATE public.custom_roles
   SET can_view_audit_log            = true,
       can_manage_compliance         = true,
       can_publish_comms             = true,
       can_manage_templates          = true,
       can_manage_integrations       = true,
       can_manage_platform           = true,
       can_view_ai_insights          = true,
       can_manage_ai_credits         = true,
       can_manage_stakeholder_portal = true
 WHERE name IN ('Administrator','admin');

UPDATE public.custom_roles
   SET can_view_audit_log            = true,
       can_manage_compliance         = false,
       can_publish_comms             = true,
       can_manage_templates          = true,
       can_manage_integrations       = false,
       can_view_ai_insights          = true,
       can_manage_stakeholder_portal = true
 WHERE name IN ('Manager','programme_manager','project_manager','manager','product_manager');

UPDATE public.custom_roles
   SET can_view_ai_insights          = true,
       can_publish_comms             = false
 WHERE name IN ('project_team_member','product_team_member','Team Member');

-- 4. Seed default module permissions for the new modules
--    (Administrator → full; Manager → view/create/edit/export where it makes sense; Stakeholder → view-only on their slice).
WITH admin_role AS (SELECT id FROM public.custom_roles WHERE name IN ('Administrator','admin') LIMIT 1)
INSERT INTO public.role_module_permissions
  (role_id, module_key, can_view, can_create, can_edit, can_delete, can_approve, can_export)
SELECT a.id, m.module_key, true, true, true, true, true, true
FROM admin_role a
CROSS JOIN (VALUES
  ('audit_log'),('compliance'),('comms_packs'),('governance_reports'),('scheduled_reports'),
  ('templates'),('notifications'),('search'),('integrations'),
  ('plan_management'),('platform_support'),('sso_management'),
  ('stakeholder_portal'),('ai_insights'),('ai_credits')
) AS m(module_key)
WHERE a.id IS NOT NULL
ON CONFLICT (role_id, module_key) DO NOTHING;

-- Manager-tier defaults
WITH mgr_roles AS (
  SELECT id FROM public.custom_roles
   WHERE name IN ('Manager','programme_manager','project_manager','manager','product_manager')
)
INSERT INTO public.role_module_permissions
  (role_id, module_key, can_view, can_create, can_edit, can_delete, can_approve, can_export)
SELECT r.id, m.module_key,
       true,                           -- view
       m.can_create,                   -- create
       m.can_edit,                     -- edit
       false,                          -- delete (kept admin-only)
       m.can_approve,                  -- approve
       true                            -- export
FROM mgr_roles r
CROSS JOIN (VALUES
  ('audit_log',          false, false, false),
  ('compliance',         false, false, false),
  ('comms_packs',        true,  true,  true ),
  ('governance_reports', true,  true,  true ),
  ('scheduled_reports',  true,  true,  false),
  ('templates',          true,  true,  false),
  ('notifications',      true,  true,  false),
  ('search',             true,  true,  false),
  ('stakeholder_portal', true,  true,  false),
  ('ai_insights',        true,  true,  true ),
  ('ai_credits',         false, false, false)
) AS m(module_key, can_create, can_edit, can_approve)
ON CONFLICT (role_id, module_key) DO NOTHING;

-- Team-member defaults — view + comment style modules only
WITH team_roles AS (
  SELECT id FROM public.custom_roles
   WHERE name IN ('project_team_member','product_team_member','Team Member')
)
INSERT INTO public.role_module_permissions
  (role_id, module_key, can_view, can_create, can_edit, can_delete, can_approve, can_export)
SELECT r.id, m.module_key, true, false, false, false, false, false
FROM team_roles r
CROSS JOIN (VALUES
  ('comms_packs'),('governance_reports'),('scheduled_reports'),
  ('templates'),('notifications'),('search'),('ai_insights')
) AS m(module_key)
ON CONFLICT (role_id, module_key) DO NOTHING;

-- Stakeholder defaults — view of comms/reports relevant to their scope
WITH sh_roles AS (
  SELECT id FROM public.custom_roles
   WHERE name IN ('org_stakeholder','programme_stakeholder','project_stakeholder','product_stakeholder','stakeholder','Stakeholder')
)
INSERT INTO public.role_module_permissions
  (role_id, module_key, can_view, can_create, can_edit, can_delete, can_approve, can_export)
SELECT r.id, m.module_key, true, false, false, false, false, false
FROM sh_roles r
CROSS JOIN (VALUES
  ('comms_packs'),('governance_reports'),('notifications'),('search')
) AS m(module_key)
ON CONFLICT (role_id, module_key) DO NOTHING;

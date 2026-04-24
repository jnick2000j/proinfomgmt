-- DESTRUCTIVE: Wipe all transactional data; keep only justin@cascadepackaging.com
DO $$
DECLARE
  _keep_user uuid;
BEGIN
  SELECT id INTO _keep_user FROM auth.users WHERE lower(email) = 'justin@cascadepackaging.com' LIMIT 1;
  IF _keep_user IS NULL THEN
    RAISE EXCEPTION 'Keeper user not found';
  END IF;

  -- Truncate all transactional tables (CASCADE handles FK chains)
  TRUNCATE TABLE
    public.ai_advisor_messages,
    public.ai_advisor_conversations,
    public.ai_agent_actions,
    public.ai_audit_log,
    public.ai_credit_ledger,
    public.ai_credit_purchases,
    public.ai_credit_usage,
    public.ai_insights,
    public.ai_summaries,
    public.approval_evidence,
    public.auth_audit_log,
    public.automation_step_executions,
    public.automation_approvals,
    public.automation_runs,
    public.automation_workflows,
    public.benefit_measurements,
    public.benefit_profiles,
    public.benefits,
    public.branding_settings,
    public.business_requirements,
    public.change_management_activity,
    public.change_management_approvals,
    public.change_management_requests,
    public.change_notification_settings,
    public.change_requests,
    public.chat_messages,
    public.comms_packs,
    public.compliance_attestations,
    public.compliance_rule_configs,
    public.compliance_scores,
    public.csat_responses,
    public.csat_surveys,
    public.custom_roles,
    public.documents,
    public.domain_verifications,
    public.entity_assignments,
    public.entity_updates,
    public.exception_assessments,
    public.exception_lifecycle_events,
    public.exceptions,
    public.feature_dependencies,
    public.governance_reports,
    public.helpdesk_email_log,
    public.helpdesk_notifications,
    public.helpdesk_sla_policies,
    public.helpdesk_ticket_activity,
    public.helpdesk_ticket_catalog_items,
    public.helpdesk_ticket_comments,
    public.helpdesk_tickets,
    public.helpdesk_workflow_step_executions,
    public.helpdesk_workflow_approvals,
    public.helpdesk_workflow_runs,
    public.helpdesk_workflows,
    public.issues,
    public.kb_article_chunks,
    public.kb_attachments,
    public.kb_search_log,
    public.kb_articles,
    public.lesson_applications,
    public.lesson_tag_assignments,
    public.lesson_tags,
    public.lessons_learned,
    public.milestone_history,
    public.milestones,
    public.notifications,
    public.org_mfa_policies,
    public.org_session_policies,
    public.organization_addon_subscriptions,
    public.organization_invitations,
    public.organization_licenses,
    public.organization_plan_overrides,
    public.organization_subscriptions,
    public.product_features,
    public.products,
    public.programme_blueprint,
    public.programme_definitions,
    public.programme_stakeholders,
    public.programme_success_plan,
    public.programme_tranches,
    public.programmes,
    public.projects,
    public.quality_criteria,
    public.quality_records,
    public.quality_reviews,
    public.reference_sequences,
    public.residency_audit_log,
    public.risks,
    public.role_field_permissions,
    public.role_module_permissions,
    public.saved_reports,
    public.scheduled_reports,
    public.scim_group_role_mappings,
    public.scim_tokens,
    public.scim_user_sync_state,
    public.siem_export_log,
    public.siem_exporters,
    public.sprints,
    public.sso_configurations,
    public.sso_jit_provisioning_log,
    public.stage_gate_approvals,
    public.stage_gates,
    public.stakeholder_portal_access,
    public.stakeholders,
    public.status_history,
    public.success_plans,
    public.support_ticket_messages,
    public.support_tickets,
    public.task_assignments,
    public.tasks,
    public.technical_requirements,
    public.timesheet_entries,
    public.timesheets,
    public.tranches,
    public.update_frequency_settings,
    public.user_mfa_factors,
    public.user_mfa_recovery_codes,
    public.user_organization_access,
    public.user_organization_roles,
    public.user_product_access,
    public.user_programme_access,
    public.user_project_access,
    public.user_sessions,
    public.weekly_reports,
    public.work_packages,
    public.workflow_approval_comments,
    public.workflow_approvals,
    public.workflow_evidence,
    public.workflow_notifiers,
    public.organizations
  RESTART IDENTITY CASCADE;

  -- Org-scoped retention policies (keep global row where organization_id IS NULL)
  DELETE FROM public.audit_log_retention_policies WHERE organization_id IS NOT NULL;

  -- Org-scoped AI provider settings (keep global)
  DELETE FROM public.ai_provider_settings WHERE scope = 'organization';

  -- Reset profile to keeper only
  DELETE FROM public.profiles WHERE user_id <> _keep_user;
  UPDATE public.profiles SET default_organization_id = NULL WHERE user_id = _keep_user;

  -- Reset roles to keeper as admin only
  DELETE FROM public.user_roles WHERE user_id <> _keep_user;
  INSERT INTO public.user_roles (user_id, role) VALUES (_keep_user, 'admin')
    ON CONFLICT DO NOTHING;

  -- Delete other auth users
  DELETE FROM auth.users WHERE id <> _keep_user;
END $$;
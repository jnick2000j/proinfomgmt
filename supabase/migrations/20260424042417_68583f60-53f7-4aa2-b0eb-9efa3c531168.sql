ALTER TABLE public.change_notification_settings
  ADD COLUMN IF NOT EXISTS require_comment_on_status_scheduled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_comment_on_status_in_progress boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_comment_on_status_implemented boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_comment_on_status_closed boolean NOT NULL DEFAULT false;
ALTER TABLE public.change_notification_settings
  ADD COLUMN IF NOT EXISTS require_comment_on_progress boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_comment_on_test boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_comment_on_implementation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_comment_on_comment boolean NOT NULL DEFAULT false;
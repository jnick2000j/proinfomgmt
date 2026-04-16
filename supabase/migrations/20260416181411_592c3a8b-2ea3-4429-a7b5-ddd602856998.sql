ALTER TABLE public.branding_settings
  ADD COLUMN IF NOT EXISTS show_hero_title boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_hero_description boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_welcome_message boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_login_cta boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_footer boolean NOT NULL DEFAULT true;
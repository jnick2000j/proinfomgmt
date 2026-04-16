
ALTER TABLE public.branding_settings
  ADD COLUMN IF NOT EXISTS feature_3_label text,
  ADD COLUMN IF NOT EXISTS feature_3_text text,
  ADD COLUMN IF NOT EXISTS feature_4_label text,
  ADD COLUMN IF NOT EXISTS feature_4_text text,
  ADD COLUMN IF NOT EXISTS login_bg_image_url text,
  ADD COLUMN IF NOT EXISTS login_bg_pattern text DEFAULT 'circles',
  ADD COLUMN IF NOT EXISTS login_layout text DEFAULT 'split',
  ADD COLUMN IF NOT EXISTS show_features boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS login_button_text text,
  ADD COLUMN IF NOT EXISTS login_cta_text text,
  ADD COLUMN IF NOT EXISTS right_panel_bg_color text;

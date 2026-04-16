ALTER TABLE public.branding_settings
ADD COLUMN IF NOT EXISTS hero_text_color text,
ADD COLUMN IF NOT EXISTS form_text_color text,
ADD COLUMN IF NOT EXISTS app_name_color text,
ADD COLUMN IF NOT EXISTS tagline_color text;
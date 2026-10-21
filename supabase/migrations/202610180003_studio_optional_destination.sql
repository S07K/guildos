-- Canvas projects do not require a landing-page CTA destination.
-- Retain existing destinations for historical landing-page previews.
alter table public.studio_projects alter column cta_url drop not null;

-- Add new value to variant_source enum for compiled rulesets
alter type public.variant_source add value if not exists 'compiled';

-- Create enum for variant_source if it does not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'variant_source') THEN
    CREATE TYPE public.variant_source AS ENUM ('builtin', 'generated');
  END IF;
END
$$;

-- Create table chess_variants
CREATE TABLE IF NOT EXISTS public.chess_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  rules TEXT NOT NULL,
  difficulty TEXT NULL,
  prompt TEXT NULL,
  source public.variant_source NOT NULL DEFAULT 'generated',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  display_order INTEGER NULL,
  rule_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create table chess_variant_prompts
CREATE TABLE IF NOT EXISTS public.chess_variant_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES public.chess_variants(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  difficulty TEXT NULL,
  rules TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.chess_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chess_variant_prompts ENABLE ROW LEVEL SECURITY;

-- Open policies (adjust later as needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chess_variants' AND policyname='Anyone can view chess_variants'
  ) THEN
    CREATE POLICY "Anyone can view chess_variants" ON public.chess_variants FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chess_variants' AND policyname='Anyone can insert chess_variants'
  ) THEN
    CREATE POLICY "Anyone can insert chess_variants" ON public.chess_variants FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chess_variants' AND policyname='Anyone can update chess_variants'
  ) THEN
    CREATE POLICY "Anyone can update chess_variants" ON public.chess_variants FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chess_variants' AND policyname='Anyone can delete chess_variants'
  ) THEN
    CREATE POLICY "Anyone can delete chess_variants" ON public.chess_variants FOR DELETE USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chess_variant_prompts' AND policyname='Anyone can view chess_variant_prompts'
  ) THEN
    CREATE POLICY "Anyone can view chess_variant_prompts" ON public.chess_variant_prompts FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chess_variant_prompts' AND policyname='Anyone can insert chess_variant_prompts'
  ) THEN
    CREATE POLICY "Anyone can insert chess_variant_prompts" ON public.chess_variant_prompts FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chess_variant_prompts' AND policyname='Anyone can update chess_variant_prompts'
  ) THEN
    CREATE POLICY "Anyone can update chess_variant_prompts" ON public.chess_variant_prompts FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chess_variant_prompts' AND policyname='Anyone can delete chess_variant_prompts'
  ) THEN
    CREATE POLICY "Anyone can delete chess_variant_prompts" ON public.chess_variant_prompts FOR DELETE USING (true);
  END IF;
END
$$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_chess_variants_created_at ON public.chess_variants(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chess_variants_display_order ON public.chess_variants(display_order ASC NULLS LAST);

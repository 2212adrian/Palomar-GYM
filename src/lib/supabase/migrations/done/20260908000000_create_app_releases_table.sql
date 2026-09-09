-- ==============================================================================
-- Migration: 20260908000000_create_app_releases_table.sql
-- Description: Store platform releases separated by environment (dev vs prod)
-- ==============================================================================

-- 1. Create table if it doesn't already exist
CREATE TABLE IF NOT EXISTS public.app_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL DEFAULT 'android',
  environment TEXT NOT NULL DEFAULT 'production',
  version TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT 'palomar-gym.apk',
  download_url TEXT NOT NULL DEFAULT 'https://paste-your-download-link-here.com',
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  release_notes TEXT DEFAULT '',
  storage_host TEXT DEFAULT 'Catbox CDN',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Retroactively add missing columns if upgrading an existing table
ALTER TABLE public.app_releases 
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS file_name TEXT NOT NULL DEFAULT 'palomar-gym.apk',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;

-- 3. Add check constraints for allowed values
ALTER TABLE public.app_releases 
  DROP CONSTRAINT IF EXISTS app_releases_environment_check,
  DROP CONSTRAINT IF EXISTS app_releases_platform_check;

ALTER TABLE public.app_releases 
  ADD CONSTRAINT app_releases_environment_check 
    CHECK (environment IN ('development', 'production')),
  ADD CONSTRAINT app_releases_platform_check 
    CHECK (platform IN ('android', 'windows', 'ios'));

-- 4. Clean up existing duplicate rows (keeps ONLY the newest release per platform + environment)
DELETE FROM public.app_releases
WHERE id NOT IN (
  SELECT DISTINCT ON (platform, environment) id
  FROM public.app_releases
  ORDER BY platform, environment, created_at DESC
);

-- 5. Add UNIQUE constraint to enforce exactly ONE row per platform & environment (Enables UPSERT)
ALTER TABLE public.app_releases 
  DROP CONSTRAINT IF EXISTS app_releases_platform_environment_key;

ALTER TABLE public.app_releases 
  ADD CONSTRAINT app_releases_platform_environment_key 
  UNIQUE (platform, environment);

-- 6. Index for high-performance terminal version checks
CREATE INDEX IF NOT EXISTS idx_app_releases_lookup 
  ON public.app_releases (platform, environment, is_active);

-- 7. Configure Row Level Security (RLS)
ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

-- Allow public read access so any app/terminal can fetch its latest version info
DROP POLICY IF EXISTS "Allow public read access to app_releases" ON public.app_releases;
CREATE POLICY "Allow public read access to app_releases"
  ON public.app_releases
  FOR SELECT
  USING (true);

-- Allow service role full access to insert, update, or upsert releases
DROP POLICY IF EXISTS "Allow service role full access to app_releases" ON public.app_releases;
CREATE POLICY "Allow service role full access to app_releases"
  ON public.app_releases
  FOR ALL
  USING (auth.role() = 'service_role');
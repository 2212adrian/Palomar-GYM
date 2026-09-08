-- =============================================================================
-- Migration: 20260908000000_create_app_releases_table.sql
-- Description: Creates app_releases table storing external hosting URLs 
--              (GitHub Releases CDN, Cloudflare Pages, etc.) without using 
--              Supabase Storage buckets.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.app_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version TEXT NOT NULL,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL, -- Stores direct external URL (e.g. https://github.com/.../release.apk)
    download_url TEXT,
    file_size_bytes BIGINT DEFAULT 0,
    release_notes TEXT,
    platform TEXT NOT NULL DEFAULT 'android', -- 'android', 'ios', 'windows'
    hosting_provider TEXT DEFAULT 'github_releases',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

-- Allow all users (both anonymous and authenticated) to check for updates
DROP POLICY IF EXISTS "Allow public to read app releases" ON public.app_releases;
CREATE POLICY "Allow public to read app releases" 
ON public.app_releases 
FOR SELECT 
TO public
USING (true);

-- Allow admins to insert and manage releases
DROP POLICY IF EXISTS "Allow admins to manage app releases" ON public.app_releases;
CREATE POLICY "Allow admins to manage app releases" 
ON public.app_releases 
FOR ALL 
TO authenticated 
USING (
  (auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
  OR
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
  )
)
WITH CHECK (
  (auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
  OR
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
  )
);

-- Seed initial GitHub Releases external hosting record
INSERT INTO public.app_releases (
    version,
    file_name,
    storage_path,
    download_url,
    file_size_bytes,
    release_notes,
    platform,
    hosting_provider,
    is_active
) VALUES (
    '0.25.0',
    'WolfPalomarGym-v0.25.0.apk',
    'https://github.com/adrianangeles2212/palomar-gym/releases/download/v0.25.0/WolfPalomarGym-v0.25.0.apk',
    'https://github.com/adrianangeles2212/palomar-gym/releases/download/v0.25.0/WolfPalomarGym-v0.25.0.apk',
    44851200,
    'Physical membership card NFC/Barcode scanning, turnstile sync, offline check-in enhancements, and external hosting update service.',
    'android',
    'github_releases',
    true
) ON CONFLICT DO NOTHING;

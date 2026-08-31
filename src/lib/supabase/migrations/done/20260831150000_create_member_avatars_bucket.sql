-- Migration: Create Member Avatars Storage Bucket & Policies
-- File: 20260831150000_create_member_avatars_bucket.sql

BEGIN;

-- ============================================================================
-- 1. CREATE 'member-avatars' STORAGE BUCKET
-- ============================================================================

-- Create the public 'member-avatars' storage bucket for member profile photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'member-avatars', 
    'member-avatars', 
    true, 
    65536, -- 64 KB (65,536 bytes) strictly enforced
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 65536,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Ensure image_url column is present in public.members
ALTER TABLE public.members 
  ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

-- ============================================================================
-- 2. STORAGE ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Clean up existing policies for member-avatars
DROP POLICY IF EXISTS "Allow public read access to member-avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload member-avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update member-avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete member-avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload to member-avatars" ON storage.objects;

-- A. PUBLIC READ ACCESS: Anyone can view member avatars (or authenticated sessions)
CREATE POLICY "Allow public read access to member-avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'member-avatars');

-- B. AUTHENTICATED INSERT ACCESS: Authenticated staff / admins can upload member photos
CREATE POLICY "Allow authenticated users to upload member-avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'member-avatars');

-- C. AUTHENTICATED UPDATE ACCESS: Authenticated staff / admins can update photos
CREATE POLICY "Allow authenticated users to update member-avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'member-avatars')
WITH CHECK (bucket_id = 'member-avatars');

-- D. AUTHENTICATED DELETE ACCESS: Authenticated staff / admins can delete photos
CREATE POLICY "Allow authenticated users to delete member-avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'member-avatars');

-- E. OPTIONAL PUBLIC FALLBACK (Allows online kiosk / registration queue uploads)
CREATE POLICY "Allow public upload to member-avatars"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'member-avatars');

COMMIT;

-- Force PostgREST & Storage schema cache reload
NOTIFY pgrst, 'reload schema';

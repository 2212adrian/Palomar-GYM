BEGIN;

-- 1. UPDATE 'member-avatars' BUCKET LIMIT TO 2MB (2,097,152 bytes) FOR 1024x1024 HD IMAGES
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'member-avatars', 
    'member-avatars', 
    true, 
    2097152, -- 2 MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 2. ENSURE 'image_url' COLUMN EXISTS ON MEMBERS TABLE
ALTER TABLE public.members 
  ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

-- 3. STORAGE POLICIES
DROP POLICY IF EXISTS "Allow public read access to member-avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload member-avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update member-avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete member-avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload to member-avatars" ON storage.objects;

CREATE POLICY "Allow public read access to member-avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'member-avatars');

CREATE POLICY "Allow authenticated users to upload member-avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'member-avatars');

CREATE POLICY "Allow authenticated users to update member-avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'member-avatars')
WITH CHECK (bucket_id = 'member-avatars');

CREATE POLICY "Allow authenticated users to delete member-avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'member-avatars');

CREATE POLICY "Allow public upload to member-avatars"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'member-avatars');

COMMIT;

-- Force PostgREST schema reload
NOTIFY pgrst, 'reload schema';
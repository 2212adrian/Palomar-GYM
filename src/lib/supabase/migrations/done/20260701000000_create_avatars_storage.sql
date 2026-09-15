-- 1. Create the 'avatars' storage bucket (Marked public as false so only authenticated sessions can read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Configure bucket rules (Max 8MB file size (8388608 bytes), limit allowed mime types)
UPDATE storage.buckets
SET file_size_limit = 8388608,
    allowed_mime_types = ARRAY[
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp'
    ]
WHERE id = 'avatars';

-- 3. Restrict select/read access to authenticated users only
DROP POLICY IF EXISTS "Allow public read access to avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated read access to avatars" ON storage.objects;
CREATE POLICY "Allow authenticated read access to avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

-- 4. Allow authenticated users to upload objects into their own user ID folder
DROP POLICY IF EXISTS "Allow authenticated users to upload their own avatar" ON storage.objects;
CREATE POLICY "Allow authenticated users to upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. Allow users to update their own avatar file (Requires select + update to support upsert)
DROP POLICY IF EXISTS "Allow authenticated users to update their own avatar" ON storage.objects;
CREATE POLICY "Allow authenticated users to update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 6. Allow users to delete their own avatar file
DROP POLICY IF EXISTS "Allow authenticated users to delete their own avatar" ON storage.objects;
CREATE POLICY "Allow authenticated users to delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);
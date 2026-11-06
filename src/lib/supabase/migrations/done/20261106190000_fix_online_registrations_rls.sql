BEGIN;

-- 1. Ensure public and anonymous roles have table-level permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.online_registrations TO anon;
GRANT ALL ON TABLE public.online_registrations TO authenticated;

-- 2. Enable RLS
ALTER TABLE public.online_registrations ENABLE ROW LEVEL SECURITY;

-- 3. Recreate the INSERT policy for public and anonymous users
DROP POLICY IF EXISTS "Allow anonymous users to submit online registrations" ON public.online_registrations;
CREATE POLICY "Allow anonymous users to submit online registrations" ON public.online_registrations
    FOR INSERT TO anon, authenticated WITH CHECK (true);

-- 4. Create SELECT policy for public users to read pending registrations
DROP POLICY IF EXISTS "Allow public to read active pending registrations" ON public.online_registrations;
CREATE POLICY "Allow public to read active pending registrations" ON public.online_registrations
    FOR SELECT TO anon, authenticated
    USING (status = 'Pending' AND is_archived = FALSE AND deleted_at IS NULL);

-- 5. Staff full access policy
DROP POLICY IF EXISTS "Allow authenticated staff to view & process registrations" ON public.online_registrations;
CREATE POLICY "Allow authenticated staff to view & process registrations" ON public.online_registrations
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
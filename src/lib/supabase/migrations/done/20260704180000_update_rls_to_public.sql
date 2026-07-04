-- Migration: Update Rates and Gym Profile SELECT Policies to Public
-- Description: Allows unauthenticated sessions on the login screen to fetch branding dynamically.
-- Timestamp: 20260704180000

-- 1. public.gym_profile SELECT policy updates
DROP POLICY IF EXISTS "Allow authenticated users to read gym profile" ON public.gym_profile;
DROP POLICY IF EXISTS "Allow public read access to gym profile" ON public.gym_profile;

CREATE POLICY "Allow public read access to gym profile" 
ON public.gym_profile 
FOR SELECT 
TO public -- Grants access to both anonymous (anon) and logged-in (authenticated) users
USING (true);

-- 2. public.rates_config SELECT policy updates
DROP POLICY IF EXISTS "Allow authenticated users to read rates" ON public.rates_config;
DROP POLICY IF EXISTS "Allow public read access to rates" ON public.rates_config;

CREATE POLICY "Allow public read access to rates" 
ON public.rates_config 
FOR SELECT 
TO public -- Grants access to both anonymous (anon) and logged-in (authenticated) users
USING (true);
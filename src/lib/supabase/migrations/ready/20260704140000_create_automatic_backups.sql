-- Migration: Automatic 7-Day Rotating Database Backup System
-- Timestamp: 20260704140000

-- 1. Create the table to store metadata and JSON backup payloads
CREATE TABLE IF NOT EXISTS public.database_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL UNIQUE,
    backup_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.database_backups ENABLE ROW LEVEL SECURITY;

-- Ensure only admin accounts can query/view database backups
CREATE POLICY "Allow admins to read backups" 
ON public.database_backups 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
  )
);

-- 2. Create the dynamic backup generator function
CREATE OR REPLACE FUNCTION public.generate_database_backup()
RETURNS void AS $$
DECLARE
    r RECORD;
    table_json JSONB;
    backup_payload JSONB := '{}'::jsonb;
    backup_filename TEXT;
BEGIN
    -- Loop through all user-defined public tables, ignoring system/metadata tables
    FOR r IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          -- Exclude the backup table itself to avoid recursion
          AND table_name != 'database_backups'
          -- Exclude PostGIS system tables if present
          AND table_name != 'spatial_ref_sys'
    LOOP
        BEGIN
            -- Dynamically fetch table contents as a JSON array
            EXECUTE format('SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM %I t', r.table_name) 
            INTO table_json;
            
            -- Store table data inside the master payload using the table name as the key
            backup_payload := jsonb_set(backup_payload, ARRAY[r.table_name], table_json, true);
        EXCEPTION WHEN OTHERS THEN
            -- Log warnings but do not halt the process if a single table has an lock/read issue
            RAISE WARNING 'Failed to backup table %: %', r.table_name, SQLERRM;
        END;
    END LOOP;

    -- Generate a clean filename indicating the creation date in Manila time
    backup_filename := 'backup_' || to_char(now() AT TIME ZONE 'Asia/Manila', 'YYYY_MM_DD_HH24MISS') || '.json';

    -- Insert the new backup
    INSERT INTO public.database_backups (filename, backup_data)
    VALUES (backup_filename, backup_payload);

    -- 3. Automatic 7-Day rotation (delete files older than 7 days)
    DELETE FROM public.database_backups 
    WHERE created_at < (now() - INTERVAL '7 days');

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Enable pg_cron extension if not already active
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 5. Schedule the job to run every 24 hours (daily at midnight Manila time)
SELECT cron.schedule(
    'daily-database-backup',
    '0 0 * * *', -- Daily at 00:00 (Midnight)
    'SELECT public.generate_database_backup();'
);
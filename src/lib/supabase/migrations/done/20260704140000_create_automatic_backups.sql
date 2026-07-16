-- Migration: Automatic 7-Day Rotating Database Backup & Recovery System
-- Timestamp: 20260704140000

-- 1. Create the table to store metadata, JSON backup payloads, and user/system notes
CREATE TABLE IF NOT EXISTS public.database_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL UNIQUE,
    backup_data JSONB NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Defensive fallback: If the table already existed previously, force-add the notes, type, and size columns safely
ALTER TABLE public.database_backups ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.database_backups ADD COLUMN IF NOT EXISTS type VARCHAR DEFAULT 'manual' CHECK (type IN ('manual', 'auto', 'archived'));
ALTER TABLE public.database_backups ADD COLUMN IF NOT EXISTS size_bytes BIGINT DEFAULT 0;

-- Enable Row Level Security (RLS)
ALTER TABLE public.database_backups ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing dependent policies FIRST to clear dependencies safely
DROP POLICY IF EXISTS "Allow admins to read backups" ON public.database_backups;
DROP POLICY IF EXISTS "Allow admins to delete backups" ON public.database_backups;

-- Clean up older functions
DROP FUNCTION IF EXISTS public.is_admin();

-- 3. RLS policies checking profiles role OR explicitly matching the superadmin email claim
CREATE POLICY "Allow admins to read backups" 
ON public.database_backups 
FOR SELECT 
TO authenticated
USING (
    LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
    OR LOWER(auth.jwt() ->> 'email') = 'wolf.palomar@gmail.com'
);

CREATE POLICY "Allow admins to delete backups" 
ON public.database_backups 
FOR DELETE 
TO authenticated
USING (
    LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
    OR LOWER(auth.jwt() ->> 'email') = 'wolf.palomar@gmail.com'
);

-- 4. Create the secure database restoration function (runs with elevated database privileges)
CREATE OR REPLACE FUNCTION public.restore_database_backup(target_backup_id UUID)
RETURNS void AS $$
DECLARE
    table_rows JSONB;
    backup_payload JSONB;
    table_to_restore TEXT;
BEGIN
    -- Security Guard: Restrict execution to authorized admins and the superadmin email only
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
          AND LOWER(profiles.role::text) IN ('admin', 'superadmin')
    ) AND LOWER(COALESCE(auth.jwt() ->> 'email', '')) != 'wolf.palomar@gmail.com' THEN
        RAISE EXCEPTION 'Access Denied: You do not have administrative clearance to restore system backups.';
    END IF;

    -- Retrieve the master backup payload
    SELECT backup_data INTO backup_payload 
    FROM public.database_backups 
    WHERE id = target_backup_id;

    IF backup_payload IS NULL THEN
        RAISE EXCEPTION 'Target backup point not found.';
    END IF;

    -- Set local session_replication_role to 'replica' to bypass all constraint triggers and system triggers.
    EXECUTE 'SET LOCAL session_replication_role = ''replica''';

    -- Loop through all tables saved inside the JSON backup file
    FOR table_to_restore IN SELECT jsonb_object_keys(backup_payload) LOOP
        -- FIX: Add 'WHERE true' to satisfy Supabase's safe-update rules (prevents "DELETE requires a WHERE clause")
        EXECUTE format('DELETE FROM %I WHERE true', table_to_restore);
        
        -- Extract the stored records
        table_rows := backup_payload->table_to_restore;
        
        -- Populate tables with the backup records
        IF jsonb_array_length(table_rows) > 0 THEN
            EXECUTE format(
                'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(NULL::%I, %L)', 
                table_to_restore, 
                table_to_restore, 
                table_rows
            );
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create/Update the dynamic backup generator function to accept optional notes & types
CREATE OR REPLACE FUNCTION public.generate_database_backup(custom_notes TEXT DEFAULT NULL, backup_type TEXT DEFAULT 'manual')
RETURNS void AS $$
DECLARE
    r RECORD;
    table_json JSONB;
    backup_payload JSONB := '{}'::jsonb;
    backup_filename TEXT;
    payload_size BIGINT;
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
    
    -- Calculate payload size in bytes
    payload_size := octet_length(backup_payload::text);

    -- Enforcement Rule 1: Rotate manual backups if saving manual and count >= 5
    IF backup_type = 'manual' THEN
        WHILE (SELECT count(*) FROM public.database_backups WHERE type = 'manual') >= 5 LOOP
            DELETE FROM public.database_backups 
            WHERE id = (
                SELECT id FROM public.database_backups 
                WHERE type = 'manual' 
                ORDER BY created_at ASC 
                LIMIT 1
            );
        END LOOP;
    END IF;

    -- Enforcement Rule 2: Rotate automated backups if saving auto and count >= 7 (keeps up to 7 files)
    IF backup_type = 'auto' THEN
        WHILE (SELECT count(*) FROM public.database_backups WHERE type = 'auto') >= 7 LOOP
            DELETE FROM public.database_backups 
            WHERE id = (
                SELECT id FROM public.database_backups 
                WHERE type = 'auto' 
                ORDER BY created_at ASC 
                LIMIT 1
            );
        END LOOP;
    END IF;

    -- Insert the new backup
    INSERT INTO public.database_backups (filename, backup_data, notes, type, size_bytes)
    VALUES (
        backup_filename, 
        backup_payload, 
        COALESCE(custom_notes, 'Manual recovery point'), 
        backup_type,
        payload_size
    );

    -- Clean up any lingering auto backups older than 7 days
    DELETE FROM public.database_backups 
    WHERE type = 'auto' 
      AND created_at < ((timezone('Asia/Manila', now())::date - INTERVAL '7 days' + INTERVAL '8 hours') AT TIME ZONE 'Asia/Manila');

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create the Archive function to set backups to archived and enforce rotation limits (Max 3)
CREATE OR REPLACE FUNCTION public.archive_database_backup(target_backup_id UUID)
RETURNS void AS $$
BEGIN
    -- Ensure only admins have clearance
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
          AND LOWER(profiles.role::text) IN ('admin', 'superadmin')
    ) AND LOWER(COALESCE(auth.jwt() ->> 'email', '')) != 'wolf.palomar@gmail.com' THEN
        RAISE EXCEPTION 'Access Denied: You do not have administrative clearance to archive backups.';
    END IF;

    -- Update target backup type to archived
    UPDATE public.database_backups 
    SET type = 'archived' 
    WHERE id = target_backup_id;

    -- Enforcement Rule 3: Limit archived backups to max 3 (delete oldest archived if exceeded)
    WHILE (SELECT count(*) FROM public.database_backups WHERE type = 'archived') > 3 LOOP
        DELETE FROM public.database_backups 
        WHERE id = (
            SELECT id FROM public.database_backups 
            WHERE type = 'archived' 
            ORDER BY created_at ASC 
            LIMIT 1
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create the Unarchive function to set backups back to manual and enforce manual limits (Max 5)
CREATE OR REPLACE FUNCTION public.unarchive_database_backup(target_backup_id UUID)
RETURNS void AS $$
BEGIN
    -- Ensure only admins have clearance
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
          AND LOWER(profiles.role::text) IN ('admin', 'superadmin')
    ) AND LOWER(COALESCE(auth.jwt() ->> 'email', '')) != 'wolf.palomar@gmail.com' THEN
        RAISE EXCEPTION 'Access Denied: You do not have administrative clearance to unarchive backups.';
    END IF;

    -- Update target backup type back to manual
    UPDATE public.database_backups 
    SET type = 'manual' 
    WHERE id = target_backup_id;

    -- Enforce manual rotation limits (Max 5)
    WHILE (SELECT count(*) FROM public.database_backups WHERE type = 'manual') > 5 LOOP
        DELETE FROM public.database_backups 
        WHERE id = (
            SELECT id FROM public.database_backups 
            WHERE type = 'manual' 
            ORDER BY created_at ASC 
            LIMIT 1
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Create the secure password verification function to bypass frontend JWT/client header overrides
CREATE OR REPLACE FUNCTION public.verify_user_password(entered_password TEXT)
RETURNS boolean AS $$
DECLARE
    stored_hash TEXT;
    is_valid boolean := false;
BEGIN
    -- Get password hash for currently authenticated user
    SELECT encrypted_password INTO stored_hash 
    FROM auth.users 
    WHERE id = auth.uid();

    IF stored_hash IS NULL THEN
        RETURN false;
    END IF;

    -- Verify hash using pgcrypto extension's crypt function
    BEGIN
        is_valid := (stored_hash = extensions.crypt(entered_password, stored_hash));
    EXCEPTION WHEN OTHERS THEN
        is_valid := (stored_hash = crypt(entered_password, stored_hash));
    END;

    RETURN is_valid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Enable pg_cron extension if not already active
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 10. Safely unschedule any existing backup cron tasks to avoid duplicate schedules
SELECT cron.unschedule(jobid) 
FROM cron.job 
WHERE jobname = 'daily-database-backup';

-- 11. Schedule the job to run every 24 hours (daily at midnight Manila time)
SELECT cron.schedule(
    'daily-database-backup',
    '0 0 * * *', -- Daily at 00:00 (Midnight)
    'SELECT public.generate_database_backup(''Scheduled automated backup'', ''auto'');'
);
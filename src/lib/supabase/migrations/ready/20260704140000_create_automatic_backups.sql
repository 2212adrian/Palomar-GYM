-- ==============================================================================
-- Migration: 3-Day Automated Backup Retention & 12:00 AM Manila (16:00 UTC) Cron
-- Description:
--   1. Configures public.database_backups with payload support.
--   2. Enforces a strict 3-day retention limit on 'auto' backups.
--   3. Automatically prunes old automated files when limit exceeds 3.
--   4. Schedules daily pg_cron at 16:00 UTC (12:00 AM Manila Time / PHT / UTC+8).
-- ==============================================================================

-- ==============================================================================
-- 0. EXTENSIONS & PRE-CLEANUP
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DROP FUNCTION IF EXISTS public.register_database_backup(text, text, text, bigint);
DROP FUNCTION IF EXISTS public.archive_database_backup(uuid);
DROP FUNCTION IF EXISTS public.unarchive_database_backup(uuid);
DROP FUNCTION IF EXISTS public.generate_database_backup(text, text);
DROP FUNCTION IF EXISTS public.restore_database_backup(uuid);
DROP FUNCTION IF EXISTS public.export_database_dump();
DROP FUNCTION IF EXISTS public.restore_database_from_payload(jsonb);
DROP FUNCTION IF EXISTS public.trigger_scheduled_storage_backup();
DROP FUNCTION IF EXISTS public.get_database_size_bytes();
DROP FUNCTION IF EXISTS public.get_storage_size_bytes();
DROP FUNCTION IF EXISTS public.get_table_registry_stats();
DROP FUNCTION IF EXISTS public.verify_user_password(text);

-- ==============================================================================
-- 1. DATABASE BACKUPS REGISTRY TABLE & RLS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.database_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL UNIQUE,
    notes TEXT DEFAULT '',
    type TEXT NOT NULL CHECK (type IN ('manual', 'auto', 'archived', 'safety')),
    size_bytes BIGINT DEFAULT 0,
    payload JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.database_backups ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_database_backups_type ON public.database_backups(type);
CREATE INDEX IF NOT EXISTS idx_database_backups_created_at ON public.database_backups(created_at DESC);

ALTER TABLE public.database_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admins to read backup records" ON public.database_backups;
DROP POLICY IF EXISTS "Allow admins to insert backup records" ON public.database_backups;
DROP POLICY IF EXISTS "Allow admins to update backup records" ON public.database_backups;
DROP POLICY IF EXISTS "Allow admins to delete backup records" ON public.database_backups;

CREATE POLICY "Allow admins to read backup records"
ON public.database_backups FOR SELECT TO authenticated
USING (
  LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
  OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'wolf.palomar@gmail.com'
);

CREATE POLICY "Allow admins to insert backup records"
ON public.database_backups FOR INSERT TO authenticated
WITH CHECK (
  LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
  OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'wolf.palomar@gmail.com'
);

CREATE POLICY "Allow admins to update backup records"
ON public.database_backups FOR UPDATE TO authenticated
USING (
  LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
  OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'wolf.palomar@gmail.com'
);

CREATE POLICY "Allow admins to delete backup records"
ON public.database_backups FOR DELETE TO authenticated
USING (
  LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
  OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'wolf.palomar@gmail.com'
);

-- ==============================================================================
-- 2. PRIVATE STORAGE BUCKET CONTAINER & STORAGE RLS
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('backups', 'backups', false, 104857600, ARRAY['application/json'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY['application/json'];

DROP POLICY IF EXISTS "Allow admins to read backup files" ON storage.objects;
DROP POLICY IF EXISTS "Allow admins to upload backup files" ON storage.objects;
DROP POLICY IF EXISTS "Allow admins to update backup files" ON storage.objects;
DROP POLICY IF EXISTS "Allow admins to delete backup files" ON storage.objects;

CREATE POLICY "Allow admins to read backup files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'backups' AND (
    LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
    OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'wolf.palomar@gmail.com'
  )
);

CREATE POLICY "Allow admins to upload backup files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'backups' AND (
    LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
    OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'wolf.palomar@gmail.com'
  )
);

CREATE POLICY "Allow admins to update backup files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'backups' AND (
    LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
    OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'wolf.palomar@gmail.com'
  )
);

CREATE POLICY "Allow admins to delete backup files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'backups' AND (
    LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
    OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) = 'wolf.palomar@gmail.com'
  )
);

-- ==============================================================================
-- 3. SYSTEM TELEMETRY RPC FUNCTIONS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_database_size_bytes()
RETURNS bigint AS $$
BEGIN
  RETURN pg_database_size(current_database());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_storage_size_bytes()
RETURNS bigint AS $$
BEGIN
  RETURN COALESCE(SUM((metadata->>'size')::bigint), 0)
  FROM storage.objects;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_table_registry_stats()
RETURNS TABLE(
  table_name text,
  record_count bigint,
  size_bytes bigint
) AS $$
DECLARE
  t_name text;
  r_count bigint;
  s_bytes bigint;
BEGIN
  FOR t_name IN 
    VALUES 
      ('profiles'), 
      ('rates_config'), 
      ('audit_logs'), 
      ('gym_profile'), 
      ('incident_reports'), 
      ('products'), 
      ('sales')
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = t_name
    ) THEN
      EXECUTE format('SELECT count(*) FROM %I', t_name) INTO r_count;
      s_bytes := pg_total_relation_size(quote_ident(t_name));
      table_name := t_name;
      record_count := r_count;
      size_bytes := s_bytes;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 4. EXPORT & RESTORE RPC FUNCTIONS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.export_database_dump()
RETURNS jsonb AS $$
DECLARE
    r RECORD;
    table_json JSONB;
    backup_payload JSONB := '{}'::jsonb;
BEGIN
    IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
              AND LOWER(profiles.role::text) IN ('admin', 'superadmin')
        ) AND LOWER(COALESCE(auth.jwt() ->> 'email', '')) != 'wolf.palomar@gmail.com' THEN
            RAISE EXCEPTION 'Access Denied: You do not have administrative clearance.';
        END IF;
    END IF;

    FOR r IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN ('spatial_ref_sys', 'database_backups')
    LOOP
        BEGIN
            EXECUTE format('SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM %I t', r.table_name) 
            INTO table_json;
            backup_payload := jsonb_set(backup_payload, ARRAY[r.table_name], table_json, true);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to backup table %: %', r.table_name, SQLERRM;
        END;
    END LOOP;

    RETURN backup_payload;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.restore_database_from_payload(backup_payload JSONB)
RETURNS void AS $$
DECLARE
    table_rows JSONB;
    table_to_restore TEXT;
BEGIN
    IF NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
              AND LOWER(profiles.role::text) IN ('admin', 'superadmin')
        ) AND LOWER(COALESCE(auth.jwt() ->> 'email', '')) != 'wolf.palomar@gmail.com' THEN
            RAISE EXCEPTION 'Access Denied: Administrative clearance required for restoration.';
        END IF;
    END IF;

    IF backup_payload IS NULL OR backup_payload = '{}'::jsonb THEN
        RAISE EXCEPTION 'Invalid or empty backup payload provided.';
    END IF;

    EXECUTE 'SET LOCAL session_replication_role = ''replica''';

    FOR table_to_restore IN SELECT jsonb_object_keys(backup_payload) LOOP
        IF table_to_restore != 'database_backups' AND EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = table_to_restore
        ) THEN
            EXECUTE format('DELETE FROM %I WHERE true', table_to_restore);
            table_rows := backup_payload->table_to_restore;
            
            IF jsonb_array_length(table_rows) > 0 THEN
                EXECUTE format(
                    'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(NULL::%I, %L)', 
                    table_to_restore, 
                    table_to_restore, 
                    table_rows
                );
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 5. PASSWORD VERIFICATION HELPER
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.verify_user_password(entered_password TEXT)
RETURNS boolean AS $$
DECLARE
    stored_hash TEXT;
    is_valid boolean := false;
BEGIN
    SELECT encrypted_password INTO stored_hash 
    FROM auth.users 
    WHERE id = auth.uid();

    IF stored_hash IS NULL THEN
        RETURN false;
    END IF;

    BEGIN
        is_valid := (stored_hash = extensions.crypt(entered_password, stored_hash));
    EXCEPTION WHEN OTHERS THEN
        is_valid := (stored_hash = crypt(entered_password, stored_hash));
    END;

    RETURN is_valid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 6. SCHEDULED 3-DAY ROTATION BACKUP FUNCTION & PG_CRON
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.trigger_scheduled_storage_backup()
RETURNS jsonb AS $$
DECLARE
    v_dump JSONB;
    v_filename TEXT;
    v_size BIGINT;
    v_now_epoch BIGINT;
    v_manila_today DATE;
    v_inserted_id UUID;
    v_old_ids UUID[];
    v_old_filenames TEXT[];
BEGIN
    -- 1. Check Manila calendar day (UTC+8)
    v_manila_today := (now() AT TIME ZONE 'Asia/Manila')::date;

    IF EXISTS (
        SELECT 1 FROM public.database_backups 
        WHERE type = 'auto' 
          AND (created_at AT TIME ZONE 'Asia/Manila')::date = v_manila_today
    ) THEN
        RETURN jsonb_build_object('status', 'skipped', 'message', 'Daily backup for Manila date already exists.');
    END IF;

    -- 2. Maintain strict 3-DAY retention policy:
    -- If there are >= 3 backups, delete the oldest so the new backup makes exactly 3.
    SELECT array_agg(id), array_agg(filename)
    INTO v_old_ids, v_old_filenames
    FROM (
        SELECT id, filename 
        FROM public.database_backups
        WHERE type = 'auto'
        ORDER BY created_at ASC
        LIMIT GREATEST(0, (SELECT count(*) FROM public.database_backups WHERE type = 'auto') - 2)
    ) old_backups;

    IF v_old_ids IS NOT NULL AND array_length(v_old_ids, 1) > 0 THEN
        DELETE FROM public.database_backups WHERE id = ANY(v_old_ids);
        BEGIN
            DELETE FROM storage.objects WHERE bucket_id = 'backups' AND name = ANY(v_old_filenames);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    -- 3. Create database snapshot
    v_dump := public.export_database_dump();
    IF v_dump IS NULL OR v_dump = '{}'::jsonb THEN
        RAISE EXCEPTION 'Automated backup failed: Generated empty database dump.';
    END IF;

    v_now_epoch := floor(extract(epoch from now()) * 1000)::bigint;
    v_filename := 'auto_' || v_now_epoch || '.json';
    v_size := octet_length(v_dump::text);

    -- 4. Store snapshot
    INSERT INTO public.database_backups (
        filename,
        notes,
        type,
        size_bytes,
        payload,
        created_at,
        updated_at
    ) VALUES (
        v_filename,
        'Daily Automated Backup (12:00 AM Manila / 16:00 UTC)',
        'auto',
        v_size,
        v_dump,
        now(),
        now()
    ) RETURNING id INTO v_inserted_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'id', v_inserted_id,
        'filename', v_filename,
        'size_bytes', v_size,
        'manila_date', v_manila_today
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Unschedule any previous cron job
DO $$
DECLARE
    v_job_id BIGINT;
BEGIN
    SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'daily-database-backup';
    IF v_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(v_job_id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Daily at 16:00 UTC (12:00 AM / Midnight Manila Time UTC+8)
SELECT cron.schedule(
    'daily-database-backup',
    '0 16 * * *',
    $$ SELECT public.trigger_scheduled_storage_backup(); $$
);

-- ==============================================================================
-- 7. EXECUTION PERMISSIONS
-- ==============================================================================
GRANT ALL ON TABLE public.database_backups TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_database_size_bytes() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_storage_size_bytes() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_table_registry_stats() TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.export_database_dump() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_database_from_payload(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_user_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_scheduled_storage_backup() TO authenticated, service_role;
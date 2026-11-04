-- ==============================================================================
-- MIGRATION: 20261104160000_repair_automatic_backup_rotation.sql
-- DESCRIPTION:
--   Repairs the 3-day retention policy and automated rotation in trigger_scheduled_storage_backup().
--   Uses ORDER BY created_at DESC OFFSET 2 so all backups older than the 2 newest are
--   reliably deleted prior to inserting today's backup, guaranteeing that exactly 3
--   daily rotation slots are occupied at all times.
--   Also performs an immediate prune on any existing excess automated backups.
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
    -- Select all existing automated backups beyond the 2 newest so the newly inserted backup makes exactly 3.
    SELECT array_agg(id), array_agg(filename)
    INTO v_old_ids, v_old_filenames
    FROM (
        SELECT id, filename 
        FROM public.database_backups
        WHERE type = 'auto'
        ORDER BY created_at DESC
        OFFSET 2
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage, auth;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.trigger_scheduled_storage_backup() TO authenticated, service_role;

-- Ensure service_role and postgres can delete from database_backups regardless of user context
DROP POLICY IF EXISTS "Allow service role and admin to delete backup records" ON public.database_backups;
CREATE POLICY "Allow service role and admin to delete backup records"
ON public.database_backups FOR DELETE TO authenticated
USING (
  LOWER((SELECT role::text FROM public.profiles WHERE id = auth.uid())) IN ('admin', 'superadmin')
  OR public.is_superadmin()
  OR auth.role() = 'service_role'
);

-- Prune any current excess automated backups beyond the 3 newest
DELETE FROM public.database_backups
WHERE type = 'auto'
  AND id IN (
    SELECT id FROM public.database_backups
    WHERE type = 'auto'
    ORDER BY created_at DESC
    OFFSET 3
  );

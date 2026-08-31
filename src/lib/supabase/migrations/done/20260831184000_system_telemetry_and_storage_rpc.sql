-- =============================================================================
-- Migration: 20260831184000_system_telemetry_and_storage_rpc.sql
-- Description: Creates dynamic disk size, storage, and catalog telemetry RPCs 
--              for Wolf Palomar Gym System Information and Dashboard monitors.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Function: get_database_size_bytes()
-- Description: Retrieves total disk size of the active PostgreSQL database.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_database_size_bytes()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT pg_database_size(current_database());
$$;

COMMENT ON FUNCTION public.get_database_size_bytes() IS 
'Returns total database size in bytes for Wolf Palomar Gym management terminal.';

-- -----------------------------------------------------------------------------
-- 2. Function: get_storage_size_bytes()
-- Description: Sums metadata file sizes across all Supabase Storage buckets.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_storage_size_bytes()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = storage, public, pg_catalog
AS $$
DECLARE
  v_total_size bigint;
BEGIN
  -- Safely check if storage.objects exists
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
    INTO v_total_size
    FROM storage.objects;
  ELSE
    v_total_size := 0;
  END IF;

  RETURN COALESCE(v_total_size, 0);
EXCEPTION WHEN OTHERS THEN
  RETURN 0;
END;
$$;

COMMENT ON FUNCTION public.get_storage_size_bytes() IS 
'Returns total storage bucket object size in bytes.';

-- -----------------------------------------------------------------------------
-- 3. Function: get_table_registry_stats()
-- Description: Dynamically iterates through all public user tables to return 
--              active record counts and physical on-disk relation sizes.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_table_registry_stats()
RETURNS TABLE(
  table_name text, 
  record_count bigint, 
  size_bytes bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  t record;
  r_count bigint;
  s_bytes bigint;
BEGIN
  FOR t IN 
    SELECT tablename AS t_name 
    FROM pg_tables 
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'schema_migrations%'
      AND tablename NOT LIKE '_prisma%'
      AND tablename NOT LIKE 'supabase_%'
    ORDER BY tablename ASC
  LOOP
    -- 1. Calculate Active Record Count (respecting soft-deleted rows if applicable)
    BEGIN
      EXECUTE format('SELECT count(*) FROM %I WHERE deleted_at IS NULL', t.t_name) INTO r_count;
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        EXECUTE format('SELECT count(*) FROM %I', t.t_name) INTO r_count;
      EXCEPTION WHEN OTHERS THEN
        r_count := 0;
      END;
    END;

    -- 2. Calculate Total Physical Disk Size (Table + Indexes + TOAST)
    BEGIN
      s_bytes := pg_total_relation_size(quote_ident(t.t_name));
    EXCEPTION WHEN OTHERS THEN
      s_bytes := 0;
    END;

    table_name := t.t_name;
    record_count := COALESCE(r_count, 0);
    size_bytes := COALESCE(s_bytes, 0);
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.get_table_registry_stats() IS 
'Dynamically scans public tables to return live record counts and disk sizes.';

-- -----------------------------------------------------------------------------
-- 4. Role Execution Permissions (Grants)
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_database_size_bytes() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_storage_size_bytes() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_table_registry_stats() TO anon, authenticated, service_role;

COMMIT;

-- =============================================================================
-- Verification Query (Run this to verify outputs immediately)
-- =============================================================================
SELECT * FROM public.get_table_registry_stats();
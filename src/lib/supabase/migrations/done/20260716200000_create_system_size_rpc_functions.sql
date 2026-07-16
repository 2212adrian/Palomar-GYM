-- Migration: Create System Telemetry and Table Registry RPC Functions
-- File: src/lib/supabase/migrations/ready/20260716200000_create_system_size_rpc_functions.sql
-- Description: Consolidates database size, storage size, and detailed table metadata tracking.

-- 1. Create function to retrieve the actual physical database size
CREATE OR REPLACE FUNCTION public.get_database_size_bytes()
RETURNS bigint AS $$
BEGIN
  RETURN pg_database_size(current_database());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create function to retrieve the combined file storage size from storage.objects
CREATE OR REPLACE FUNCTION public.get_storage_size_bytes()
RETURNS bigint AS $$
BEGIN
  RETURN COALESCE(SUM((metadata->>'size')::bigint), 0)
  FROM storage.objects;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create function to retrieve precise records count and exact table disk allocations for all 8 schema tables
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
      ('database_backups'), 
      ('rates_config'), 
      ('audit_logs'), 
      ('gym_profile'), 
      ('incident_reports'), 
      ('products'), 
      ('sales')
  LOOP
    EXECUTE format('SELECT count(*) FROM %I', t_name) INTO r_count;
    s_bytes := pg_total_relation_size(quote_ident(t_name));
    table_name := t_name;
    record_count := r_count;
    size_bytes := s_bytes;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Revoke public execute rights and grant explicit execute permissions to authenticated and anonymous web clients
REVOKE EXECUTE ON FUNCTION public.get_database_size_bytes() FROM public;
GRANT EXECUTE ON FUNCTION public.get_database_size_bytes() TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_storage_size_bytes() FROM public;
GRANT EXECUTE ON FUNCTION public.get_storage_size_bytes() TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_table_registry_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.get_table_registry_stats() TO anon, authenticated, service_role;

-- 5. Add comments for documentation
COMMENT ON FUNCTION public.get_database_size_bytes() IS 'Retrieves physical PostgreSQL database disk footprint in bytes.';
COMMENT ON FUNCTION public.get_storage_size_bytes() IS 'Aggregates combined metadata sizes of all objects within Supabase storage buckets.';
COMMENT ON FUNCTION public.get_table_registry_stats() IS 'Calculates row counts and physical disk foot prints (including Toast and index structures) for the 8 core schemas.';
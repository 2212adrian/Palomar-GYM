-- 20260916150000_get_database_schema_sizes.sql
-- Migration: add database schema storage telemetry
-- Purpose: expose PostgreSQL storage usage grouped by schema AND true physical database size

CREATE OR REPLACE FUNCTION public.get_database_schema_sizes()
RETURNS TABLE (
  schema_name text,
  total_bytes bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- 1. True physical database cluster size (matches Supabase dashboard quota exactly)
  SELECT
    '_database_total'::text AS schema_name,
    pg_database_size(current_database())::bigint AS total_bytes

  UNION ALL

  -- 2. Schema-by-schema breakdown
  SELECT
    n.nspname::text AS schema_name,
    COALESCE(
      SUM(pg_total_relation_size(c.oid))::bigint,
      0::bigint
    ) AS total_bytes
  FROM pg_class AS c
  JOIN pg_namespace AS n
    ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'm', 'p')
  GROUP BY n.nspname

  ORDER BY total_bytes DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_database_schema_sizes()
TO authenticated;
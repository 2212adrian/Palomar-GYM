-- Migration: Enable Realtime Broadcasts and Full Replica Identities for Notifications
-- Created: 2026-08-31 14:30:00

-- 1. Set REPLICA IDENTITY FULL to ensure the entire updated row payload is sent in real-time events
ALTER TABLE IF EXISTS public.incident_reports REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.products REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.subscriptions REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.members REPLICA IDENTITY FULL;

-- 2. Safely add tables to the supabase_realtime publication (idempotent check)
DO $$
BEGIN
  -- incident_reports
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'incident_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.incident_reports;
  END IF;

  -- products
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  END IF;

  -- subscriptions
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'subscriptions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
  END IF;

  -- members
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.members;
  END IF;
END $$;
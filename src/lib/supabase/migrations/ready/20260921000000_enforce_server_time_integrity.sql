-- Migration: Enforce Supabase Server Time on all CRUD Operations
-- File: 20260921000000_enforce_server_time_integrity.sql
-- Description: Enforces authoritative PostgreSQL server time (now()) across all tables,
-- preventing users from manipulating records by altering their local computer or device date/time.

BEGIN;

-- 1. Ensure get_server_time() function exists and is accessible to all clients
CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS timestamptz AS $$
BEGIN
  RETURN now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_server_time() TO anon, authenticated;

-- ==============================================================================
-- 2. ATTENDANCE SERVER-TIME INTEGRITY
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.enforce_attendance_server_time()
RETURNS TRIGGER AS $$
BEGIN
  -- Always override check_in_time and created_at with true database server time on insert
  IF TG_OP = 'INSERT' THEN
    NEW.check_in_time := now();
    NEW.created_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    -- If being soft-deleted, enforce server time for deleted_at
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      NEW.deleted_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_attendance_enforce_server_time ON public.attendance;
CREATE TRIGGER trg_attendance_enforce_server_time
BEFORE INSERT OR UPDATE ON public.attendance
FOR EACH ROW
EXECUTE FUNCTION public.enforce_attendance_server_time();

-- ==============================================================================
-- 3. SALES SERVER-TIME INTEGRITY
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.enforce_sales_server_time()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.updated_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      NEW.deleted_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sales_enforce_server_time ON public.sales;
CREATE TRIGGER trg_sales_enforce_server_time
BEFORE INSERT OR UPDATE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.enforce_sales_server_time();

-- ==============================================================================
-- 4. CASH MANAGEMENT SERVER-TIME INTEGRITY
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.enforce_cash_sessions_server_time()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.opened_at := now();
    NEW.created_at := now();
    NEW.updated_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    IF OLD.status = 'open' AND NEW.status = 'closed' THEN
      NEW.closed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cash_sessions_enforce_server_time ON public.cash_sessions;
CREATE TRIGGER trg_cash_sessions_enforce_server_time
BEFORE INSERT OR UPDATE ON public.cash_sessions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_cash_sessions_server_time();

CREATE OR REPLACE FUNCTION public.enforce_cash_transactions_server_time()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cash_transactions_enforce_server_time ON public.cash_transactions;
CREATE TRIGGER trg_cash_transactions_enforce_server_time
BEFORE INSERT ON public.cash_transactions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_cash_transactions_server_time();

-- ==============================================================================
-- 5. AUDIT LOGS SERVER-TIME INTEGRITY
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.enforce_audit_logs_server_time()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_logs_enforce_server_time ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_enforce_server_time
BEFORE INSERT ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_audit_logs_server_time();

-- ==============================================================================
-- 6. SUBSCRIPTIONS & CARDS SERVER-TIME INTEGRITY
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.enforce_subscriptions_server_time()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.updated_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN
      NEW.voided_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_subscriptions_enforce_server_time ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_enforce_server_time
BEFORE INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_subscriptions_server_time();

CREATE OR REPLACE FUNCTION public.enforce_receipts_server_time()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_receipts_enforce_server_time ON public.receipts;
CREATE TRIGGER trg_receipts_enforce_server_time
BEFORE INSERT ON public.receipts
FOR EACH ROW
EXECUTE FUNCTION public.enforce_receipts_server_time();

-- ==============================================================================
-- 7. MEMBERS & PRODUCTS SERVER-TIME INTEGRITY
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.enforce_members_server_time()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.updated_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      NEW.deleted_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_members_enforce_server_time ON public.members;
CREATE TRIGGER trg_members_enforce_server_time
BEFORE INSERT OR UPDATE ON public.members
FOR EACH ROW
EXECUTE FUNCTION public.enforce_members_server_time();

-- Products
CREATE OR REPLACE FUNCTION public.enforce_products_server_time()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.updated_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      NEW.deleted_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_products_enforce_server_time ON public.products;
CREATE TRIGGER trg_products_enforce_server_time
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.enforce_products_server_time();

-- ==============================================================================
-- 8. INCIDENT REPORTS & ONLINE REGISTRATIONS SERVER-TIME INTEGRITY
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.enforce_incident_reports_server_time()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.updated_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    IF (OLD.status IS NULL OR OLD.status = 'Unread') AND NEW.status = 'Read' THEN
      NEW.read_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_incident_reports_enforce_server_time ON public.incident_reports;
CREATE TRIGGER trg_incident_reports_enforce_server_time
BEFORE INSERT OR UPDATE ON public.incident_reports
FOR EACH ROW
EXECUTE FUNCTION public.enforce_incident_reports_server_time();

-- Online registrations
CREATE OR REPLACE FUNCTION public.enforce_online_registrations_server_time()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.submitted_at := now();
    NEW.created_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      NEW.deleted_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_online_registrations_enforce_server_time ON public.online_registrations;
CREATE TRIGGER trg_online_registrations_enforce_server_time
BEFORE INSERT OR UPDATE ON public.online_registrations
FOR EACH ROW
EXECUTE FUNCTION public.enforce_online_registrations_server_time();

COMMIT;

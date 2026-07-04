-- Migration: Create Gym Profile Configuration Table and Auto-Audit Triggers
-- Description: Sets up cloud-stored gym profile parameters and attaches DB auditing hooks
-- Timestamp: 20260704170000

CREATE TABLE IF NOT EXISTS public.gym_profile (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Enforces single-row design
    gym_name TEXT NOT NULL DEFAULT 'WOLF PALOMAR GYM',
    gym_description TEXT NOT NULL DEFAULT 'This terminal is exclusively for authorized staff members including trainers and coaches, as well as family members with administrative privileges.',
    gym_address TEXT NOT NULL DEFAULT '123 Sample Street, Barangay Central, Quezon City, Metro Manila',
    contact_name_1 TEXT NOT NULL DEFAULT 'Staff Ryan',
    contact_number_1 TEXT NOT NULL DEFAULT '09762607481',
    contact_name_2 TEXT NOT NULL DEFAULT 'Admin Wolf',
    contact_number_2 TEXT NOT NULL DEFAULT '09123456789',
    email_address TEXT NOT NULL DEFAULT 'contact@wolfpalomargym.com',
    gym_logo TEXT NOT NULL DEFAULT '',
    carousel_images TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.gym_profile ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow authenticated users to read gym profile" ON public.gym_profile;
DROP POLICY IF EXISTS "Allow admins to update gym profile" ON public.gym_profile;

-- Policy: Any authenticated user (staff/admin) can read the gym profile configuration
CREATE POLICY "Allow authenticated users to read gym profile" 
ON public.gym_profile 
FOR SELECT 
TO authenticated
USING (true);

-- Policy: Only administrators can update the configuration
CREATE POLICY "Allow admins to update gym profile" 
ON public.gym_profile 
FOR UPDATE 
TO authenticated
USING (
  (auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
  OR
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
  )
)
WITH CHECK (
  (auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
  OR
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
  )
);

-- Seed the single default row
INSERT INTO public.gym_profile (id, gym_name, gym_description, gym_address, contact_name_1, contact_number_1, contact_name_2, contact_number_2, email_address)
VALUES (1, 'WOLF PALOMAR GYM', 'This terminal is exclusively for authorized staff members including trainers and coaches, as well as family members with administrative privileges.', '123 Sample Street, Barangay Central, Quezon City, Metro Manila', 'Staff Ryan', '09762607481', 'Admin Wolf', '09123456789', 'contact@wolfpalomargym.com')
ON CONFLICT (id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- AUTOMATIC DATABASE AUDIT TRIGGER (ELIMINATES CLIENT-SIDE LOGGING HOOKS)
-- -----------------------------------------------------------------------------

-- Create a central trigger function to write updates automatically to public.audit_logs
CREATE OR REPLACE FUNCTION public.on_config_change_log_audit()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_username TEXT := 'System';
    v_details TEXT;
BEGIN
    -- Resolve active actor name from profile context
    IF auth.uid() IS NOT NULL THEN
        SELECT username INTO v_actor_username FROM public.profiles WHERE id = auth.uid();
        IF v_actor_username IS NULL THEN
            v_actor_username := auth.jwt() ->> 'email';
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'rates_config' THEN
        v_details := format('System rates updated: Monthly Sub = ₱%s, Yearly Sub = ₱%s, Regular Walk-In = ₱%s, Student Walk-In = ₱%s, Yearly Member Walk-In = ₱%s.', 
                            NEW.monthly_rate, NEW.yearly_rate, NEW.regular_walk_in, NEW.student_walk_in, NEW.yearly_walk_in);
        
        INSERT INTO public.audit_logs (user_id, actor_username, action, details)
        VALUES (auth.uid(), COALESCE(v_actor_username, 'System'), 'SYSTEM_RATES_UPDATED', v_details);

    ELSIF TG_TABLE_NAME = 'gym_profile' THEN
        v_details := format('Gym profile branding parameters updated: Name = %s, Address = %s, Contact 1 = %s (%s).', 
                            NEW.gym_name, NEW.gym_address, NEW.contact_name_1, NEW.contact_number_1);
        
        INSERT INTO public.audit_logs (user_id, actor_username, action, details)
        VALUES (auth.uid(), COALESCE(v_actor_username, 'System'), 'GYM_PROFILE_UPDATED', v_details);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing triggers before creation to prevent conflict
DROP TRIGGER IF EXISTS trigger_rates_config_audit ON public.rates_config;
DROP TRIGGER IF EXISTS trigger_gym_profile_audit ON public.gym_profile;

-- Attach trigger to public.rates_config
CREATE TRIGGER trigger_rates_config_audit
AFTER UPDATE ON public.rates_config
FOR EACH ROW EXECUTE FUNCTION public.on_config_change_log_audit();

-- Attach trigger to public.gym_profile
CREATE TRIGGER trigger_gym_profile_audit
AFTER UPDATE ON public.gym_profile
FOR EACH ROW EXECUTE FUNCTION public.on_config_change_log_audit();
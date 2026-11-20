-- ============================================================================
-- Migration: v1.0.10 Recycle Bin Staff Restriction & Remove Promo Payment Enum
-- File: 20261120000000_v1_0_10_recycle_bin_rbac_and_remove_promo_enum.sql
--
-- Description:
--   1. Fixes "invalid input value for enum payment_method_enum: Promo" in
--      public.process_member_enrollment by restricting payment_method_enum
--      resolution strictly to 'Cash' and 'GCash'.
--   2. Restricts Recycle Bin access (soft-deleted attendance, sales, products)
--      so non-admin Staff can soft-delete active records during their session/day
--      but CANNOT SELECT soft-deleted rows or restore items back to active.
--   3. Enforces trigger-level guards on public.attendance and public.sales so
--      SQL/REST/DevTools calls cannot bypass Recycle Bin RLS restrictions.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. FIX process_member_enrollment: ONLY 'Cash' AND 'GCash' PAYMENT METHODS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_member_enrollment(
    p_member_id TEXT DEFAULT NULL,
    p_member_fields JSONB DEFAULT '{}'::jsonb,
    p_plan_name TEXT DEFAULT 'No Subscription',
    p_payment_method TEXT DEFAULT 'Cash',
    p_base_price NUMERIC DEFAULT 0.00,
    p_gcash_fee NUMERIC DEFAULT 0.00,
    p_card_fee NUMERIC DEFAULT 0.00,
    p_gcash_ref_no TEXT DEFAULT NULL,
    p_add_id_card BOOLEAN DEFAULT false,
    p_online_reg_id TEXT DEFAULT NULL,
    p_processor_name TEXT DEFAULT 'Staff'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_actor TEXT;
    v_now TIMESTAMPTZ := now();
    v_member public.members;
    v_sub public.subscriptions;
    v_card public.cards;
    v_online_reg RECORD;
    v_full_name TEXT;
    v_is_paid BOOLEAN;
    v_total_amount NUMERIC;
    v_payment_enum public.payment_method_enum;
    v_receipt_no VARCHAR(30);
    v_plan_type public.subscription_type_enum;
    v_duration_days INT;
    v_active_sub RECORD;
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
    v_sub_status public.subscription_status_enum;
    v_customer_type TEXT;
    v_item_desc TEXT;
    v_card_num TEXT;
    v_card_exp TIMESTAMPTZ;
    v_should_update_profile BOOLEAN := true;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    v_is_admin := public.is_admin();
    v_actor := COALESCE(NULLIF(TRIM(p_processor_name), ''), auth.jwt() ->> 'email', 'Staff');
    v_is_paid := (COALESCE(p_plan_name, 'No Subscription') <> 'No Subscription') OR (COALESCE(p_add_id_card, false) AND COALESCE(p_card_fee, 0) > 0);

    IF v_is_paid THEN
        IF NOT EXISTS (SELECT 1 FROM public.cash_sessions WHERE status = 'open' AND closed_at IS NULL) THEN
            RAISE EXCEPTION 'Cash drawer session is closed. Paid subscriptions and cards require an open session.';
        END IF;
    END IF;

    IF p_online_reg_id IS NOT NULL AND TRIM(p_online_reg_id) <> '' THEN
        SELECT * INTO v_online_reg
        FROM public.online_registrations
        WHERE id = TRIM(p_online_reg_id)
          AND is_archived = false
          AND deleted_at IS NULL
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Online registration ticket "%" was not found.', p_online_reg_id;
        END IF;

        IF LOWER(v_online_reg.status::text) <> 'pending' THEN
            RAISE EXCEPTION 'Online registration ticket "%" has already been processed (status: %).', p_online_reg_id, v_online_reg.status;
        END IF;
    END IF;

    -- Mark transaction context so members/subscriptions triggers allow authorized execution
    PERFORM set_config('app.via_enrollment_rpc', 'on', true);

    v_full_name := regexp_replace(trim(COALESCE(p_member_fields ->> 'full_name', '')), '\s+', ' ', 'g');

    IF p_member_id IS NULL OR TRIM(p_member_id) = '' THEN
        -- Creating a brand new member profile
        IF NOT v_is_admin AND (p_online_reg_id IS NULL OR TRIM(p_online_reg_id) = '') THEN
            RAISE EXCEPTION 'Access Denied: Staff must import a valid Pending Online Registration code or QR code to add a new member.';
        END IF;

        IF v_full_name = '' THEN
            RAISE EXCEPTION 'Full name is required to register a member.';
        END IF;

        IF public.check_member_name_exists(v_full_name) THEN
            RAISE EXCEPTION 'Duplicate full name not allowed: "%" already exists.', v_full_name;
        END IF;

        INSERT INTO public.members (
            full_name,
            email,
            phone,
            gender,
            birthday,
            address,
            emergency_contact_name,
            relationship,
            emergency_contact_phone,
            parent_name,
            parent_relationship,
            parent_phone,
            parent_email,
            applicant_signature,
            parent_signature,
            consent_date,
            status
        ) VALUES (
            v_full_name,
            NULLIF(TRIM(p_member_fields ->> 'email'), ''),
            COALESCE(NULLIF(TRIM(p_member_fields ->> 'phone'), ''), ''),
            COALESCE(NULLIF(TRIM(p_member_fields ->> 'gender'), ''), 'Male'),
            NULLIF(TRIM(p_member_fields ->> 'birthday'), '')::date,
            NULLIF(TRIM(p_member_fields ->> 'address'), ''),
            NULLIF(TRIM(p_member_fields ->> 'emergency_contact_name'), ''),
            NULLIF(TRIM(p_member_fields ->> 'relationship'), ''),
            NULLIF(TRIM(p_member_fields ->> 'emergency_contact_phone'), ''),
            NULLIF(TRIM(p_member_fields ->> 'parent_name'), ''),
            NULLIF(TRIM(p_member_fields ->> 'parent_relationship'), ''),
            NULLIF(TRIM(p_member_fields ->> 'parent_phone'), ''),
            NULLIF(TRIM(p_member_fields ->> 'parent_email'), ''),
            NULLIF(p_member_fields ->> 'applicant_signature', ''),
            NULLIF(p_member_fields ->> 'parent_signature', ''),
            NULLIF(TRIM(p_member_fields ->> 'consent_date'), '')::timestamptz,
            'Active'::public.member_status_enum
        )
        RETURNING * INTO v_member;
    ELSE
        SELECT * INTO v_member
        FROM public.members
        WHERE (member_id = TRIM(p_member_id) OR id::text = TRIM(p_member_id))
          AND deleted_at IS NULL
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Member record "%" not found.', p_member_id;
        END IF;

        IF NOT v_is_admin AND public.member_has_running_subscription(v_member.member_id) THEN
            -- Staff cannot edit profile details while a subscription is running; allow renewal/card only
            v_should_update_profile := false;
        END IF;

        IF v_should_update_profile AND v_full_name <> '' THEN
            IF LOWER(regexp_replace(trim(v_member.full_name), '\s+', ' ', 'g')) <> LOWER(v_full_name)
               AND public.check_member_name_exists(v_full_name) THEN
                RAISE EXCEPTION 'Duplicate full name not allowed: "%" already exists.', v_full_name;
            END IF;

            UPDATE public.members
            SET full_name = COALESCE(NULLIF(v_full_name, ''), full_name),
                email = COALESCE(NULLIF(TRIM(p_member_fields ->> 'email'), ''), email),
                phone = COALESCE(NULLIF(TRIM(p_member_fields ->> 'phone'), ''), phone),
                gender = COALESCE(NULLIF(TRIM(p_member_fields ->> 'gender'), ''), gender),
                birthday = COALESCE(NULLIF(TRIM(p_member_fields ->> 'birthday'), '')::date, birthday),
                address = COALESCE(NULLIF(TRIM(p_member_fields ->> 'address'), ''), address),
                emergency_contact_name = COALESCE(NULLIF(TRIM(p_member_fields ->> 'emergency_contact_name'), ''), emergency_contact_name),
                relationship = COALESCE(NULLIF(TRIM(p_member_fields ->> 'relationship'), ''), relationship),
                emergency_contact_phone = COALESCE(NULLIF(TRIM(p_member_fields ->> 'emergency_contact_phone'), ''), emergency_contact_phone),
                parent_name = COALESCE(NULLIF(TRIM(p_member_fields ->> 'parent_name'), ''), parent_name),
                parent_relationship = COALESCE(NULLIF(TRIM(p_member_fields ->> 'parent_relationship'), ''), parent_relationship),
                parent_phone = COALESCE(NULLIF(TRIM(p_member_fields ->> 'parent_phone'), ''), parent_phone),
                parent_email = COALESCE(NULLIF(TRIM(p_member_fields ->> 'parent_email'), ''), parent_email),
                applicant_signature = COALESCE(NULLIF(p_member_fields ->> 'applicant_signature', ''), applicant_signature),
                parent_signature = COALESCE(NULLIF(p_member_fields ->> 'parent_signature', ''), parent_signature),
                consent_date = COALESCE(NULLIF(TRIM(p_member_fields ->> 'consent_date'), '')::timestamptz, consent_date),
                status = 'Active'::public.member_status_enum,
                updated_at = v_now
            WHERE id = v_member.id
            RETURNING * INTO v_member;
        END IF;
    END IF;

    -- Strictly allow only 'GCash' or 'Cash' (never 'Promo')
    v_payment_enum := CASE
        WHEN lower(COALESCE(p_payment_method, 'Cash')) LIKE '%gcash%' THEN 'GCash'::public.payment_method_enum
        ELSE 'Cash'::public.payment_method_enum
    END;

    v_total_amount := COALESCE(p_base_price, 0) + COALESCE(p_gcash_fee, 0) + COALESCE(p_card_fee, 0);
    v_receipt_no := 'REC-' || to_char(v_now AT TIME ZONE 'Asia/Manila', 'YYMMDDHH24MISS') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));

    IF COALESCE(p_plan_name, 'No Subscription') <> 'No Subscription' THEN
        IF UPPER(v_member.status::text) = 'SUSPENDED' THEN
            RAISE EXCEPTION 'Member % is currently suspended.', v_member.full_name;
        END IF;

        SELECT * INTO v_active_sub
        FROM public.subscriptions
        WHERE member_id = v_member.member_id
          AND status::text = 'Active'
          AND end_date > v_now
        ORDER BY end_date DESC
        LIMIT 1;

        v_plan_type := CASE WHEN p_plan_name = 'Yearly Membership' THEN 'yearly'::public.subscription_type_enum ELSE 'monthly'::public.subscription_type_enum END;
        v_duration_days := CASE WHEN p_plan_name = 'Yearly Membership' THEN 365 ELSE 30 END;

        IF FOUND THEN
            v_start := v_active_sub.end_date;
            v_sub_status := 'Inactive'::public.subscription_status_enum;
            v_customer_type := 'Existing Member';
            v_item_desc := format('Renewal %s (Starts %s)', p_plan_name, to_char(v_start AT TIME ZONE 'Asia/Manila', 'MM/DD/YYYY'));
        ELSE
            v_start := v_now;
            v_sub_status := 'Active'::public.subscription_status_enum;
            v_customer_type := 'New Membership';
            v_item_desc := format('Subscribed %s', p_plan_name);
        END IF;

        v_end := v_start + (v_duration_days || ' days')::interval;

        INSERT INTO public.subscriptions (
            member_id, plan_type, price, base_price, gcash_fee, card_fee,
            gcash_ref_no, start_date, end_date, status, payment_status,
            payment_method, receipt_number, processed_by
        ) VALUES (
            v_member.member_id, v_plan_type, v_total_amount, COALESCE(p_base_price, 0),
            COALESCE(p_gcash_fee, 0), COALESCE(p_card_fee, 0), NULLIF(TRIM(p_gcash_ref_no), ''),
            v_start, v_end, v_sub_status, 'Paid', v_payment_enum, v_receipt_no, v_actor
        )
        RETURNING * INTO v_sub;

        UPDATE public.members
        SET status = 'Active'::public.member_status_enum, updated_at = v_now
        WHERE id = v_member.id;

        INSERT INTO public.receipts (
            id, member_id, customer_name, customer_type, amount, base_price,
            gcash_fee, card_fee, gcash_ref_no, payment_method, payment_status,
            item_description, processed_by
        ) VALUES (
            v_receipt_no,
            v_member.member_id,
            v_member.full_name,
            v_customer_type::public.customer_type_enum,
            v_total_amount,
            COALESCE(p_base_price, 0),
            COALESCE(p_gcash_fee, 0),
            COALESCE(p_card_fee, 0),
            NULLIF(TRIM(p_gcash_ref_no), ''),
            v_payment_enum,
            'Paid',
            v_item_desc,
            v_actor
        ) ON CONFLICT (id) DO NOTHING;

    ELSIF COALESCE(p_add_id_card, false) AND COALESCE(p_card_fee, 0) > 0 THEN
        INSERT INTO public.receipts (
            id, member_id, customer_name, customer_type, amount, base_price,
            gcash_fee, card_fee, gcash_ref_no, payment_method, payment_status,
            item_description, processed_by
        ) VALUES (
            v_receipt_no,
            v_member.member_id,
            v_member.full_name,
            'Physical Card'::public.customer_type_enum,
            p_card_fee,
            0.00,
            0.00,
            p_card_fee,
            NULLIF(TRIM(p_gcash_ref_no), ''),
            v_payment_enum,
            'Paid',
            'Physical Membership Card Fee',
            v_actor
        ) ON CONFLICT (id) DO NOTHING;
    ELSE
        v_receipt_no := 'REG-' || to_char(v_now AT TIME ZONE 'Asia/Manila', 'HH24MISS');
    END IF;

    -- Issue / Update Card when requested OR when subscribing and no card exists yet
    IF COALESCE(p_add_id_card, false) OR COALESCE(p_plan_name, 'No Subscription') <> 'No Subscription' THEN
        SELECT * INTO v_card FROM public.cards WHERE member_id = v_member.member_id;
        IF COALESCE(p_add_id_card, false) OR NOT FOUND THEN
            v_card_num := gen_random_uuid()::text;
            v_card_exp := v_now + INTERVAL '3 years';

            INSERT INTO public.cards (
                member_id, card_number, card_type, status, version,
                payment_status, claim_status, card_fee_paid, receipt_number,
                issued_at, expires_at, updated_at
            ) VALUES (
                v_member.member_id,
                v_card_num,
                'QR'::public.card_type_enum,
                'Active',
                1,
                CASE WHEN COALESCE(p_add_id_card, false) THEN 'PAID' ELSE 'NONE' END,
                CASE WHEN COALESCE(p_add_id_card, false) THEN 'UNCLAIMED' ELSE 'NOT_APPLICABLE' END,
                CASE WHEN COALESCE(p_add_id_card, false) THEN COALESCE(p_card_fee, 0) ELSE 0 END,
                CASE WHEN COALESCE(p_add_id_card, false) THEN v_receipt_no ELSE NULL END,
                v_now, v_card_exp, v_now
            )
            ON CONFLICT (member_id) DO UPDATE SET
                status = 'Active',
                payment_status = CASE WHEN COALESCE(p_add_id_card, false) THEN 'PAID' ELSE cards.payment_status END,
                claim_status = CASE WHEN COALESCE(p_add_id_card, false) THEN 'UNCLAIMED' ELSE cards.claim_status END,
                card_fee_paid = CASE WHEN COALESCE(p_add_id_card, false) THEN COALESCE(p_card_fee, 0) ELSE cards.card_fee_paid END,
                receipt_number = CASE WHEN COALESCE(p_add_id_card, false) THEN v_receipt_no ELSE cards.receipt_number END,
                updated_at = v_now
            RETURNING * INTO v_card;

            INSERT INTO public.member_cards (
                member_id, card_number, card_type, status, version,
                payment_status, claim_status, card_fee_paid, receipt_number,
                issued_at, expires_at, updated_at
            ) VALUES (
                v_member.member_id, v_card.card_number, 'QR', 'Active', COALESCE(v_card.version, 1),
                v_card.payment_status, v_card.claim_status, v_card.card_fee_paid, v_card.receipt_number,
                v_card.issued_at, v_card.expires_at, v_now
            )
            ON CONFLICT (card_number) DO NOTHING;
        END IF;
    END IF;

    IF p_online_reg_id IS NOT NULL AND TRIM(p_online_reg_id) <> '' THEN
        UPDATE public.online_registrations
        SET status = 'Approved'::public.online_reg_status_enum,
            deleted_by = v_actor
        WHERE id = TRIM(p_online_reg_id);
    END IF;

    INSERT INTO public.audit_logs (user_id, actor_username, action, target_id, details)
    VALUES (
        auth.uid(),
        v_actor,
        CASE WHEN COALESCE(p_plan_name, 'No Subscription') = 'No Subscription' THEN 'MEMBER_ENROLLED' ELSE 'SUBSCRIPTION_CREATED' END,
        v_member.member_id,
        format('Processed %s for %s (%s). Plan: %s, Receipt: %s.',
            CASE WHEN p_online_reg_id IS NOT NULL THEN 'online ticket ' || TRIM(p_online_reg_id) ELSE 'enrollment' END,
            v_member.full_name,
            v_member.member_id,
            COALESCE(p_plan_name, 'No Subscription'),
            v_receipt_no
        )
    );

    RETURN jsonb_build_object(
        'member', to_jsonb(v_member),
        'subscription', CASE WHEN v_sub.id IS NOT NULL THEN to_jsonb(v_sub) ELSE NULL END,
        'receipt_no', v_receipt_no,
        'card', CASE WHEN v_card.id IS NOT NULL THEN to_jsonb(v_card) ELSE NULL END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.process_member_enrollment(TEXT, JSONB, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_member_enrollment(TEXT, JSONB, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. RESTRICT RECYCLE BIN VISIBILITY & RESTORE CAPABILITY FOR STAFF
-- ----------------------------------------------------------------------------

-- 2.1 attendance: Staff can read ONLY active (deleted_at IS NULL) open-session/today rows.
--                 Staff can UPDATE ONLY to soft-delete (OLD.deleted_at IS NULL -> NEW.deleted_at IS NOT NULL).
DROP POLICY IF EXISTS "Admins and scoped staff can read attendance" ON public.attendance;
CREATE POLICY "Admins and scoped staff can read attendance"
    ON public.attendance FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR (
            deleted_at IS NULL
            AND (
                (
                    cash_session_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM public.cash_sessions cs
                        WHERE cs.id = attendance.cash_session_id
                          AND cs.status = 'open'
                          AND cs.closed_at IS NULL
                    )
                )
                OR (check_in_time AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
            )
        )
    );

DROP POLICY IF EXISTS "Authenticated users can insert attendance" ON public.attendance;
CREATE POLICY "Authenticated users can insert attendance"
    ON public.attendance FOR INSERT TO authenticated
    WITH CHECK (
        public.is_admin()
        OR deleted_at IS NULL
    );

DROP POLICY IF EXISTS "Admins and scoped staff can update attendance" ON public.attendance;
CREATE POLICY "Admins and scoped staff can update attendance"
    ON public.attendance FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR (
            deleted_at IS NULL
            AND (
                (
                    cash_session_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM public.cash_sessions cs
                        WHERE cs.id = attendance.cash_session_id
                          AND cs.status = 'open'
                          AND cs.closed_at IS NULL
                    )
                )
                OR (check_in_time AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
            )
        )
    )
    WITH CHECK (
        public.is_admin()
        OR (
            deleted_at IS NOT NULL
            AND (
                (
                    cash_session_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM public.cash_sessions cs
                        WHERE cs.id = attendance.cash_session_id
                          AND cs.status = 'open'
                          AND cs.closed_at IS NULL
                    )
                )
                OR (check_in_time AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
            )
        )
    );

CREATE OR REPLACE FUNCTION public.f_tr_guard_attendance_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    IF OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Staff cannot view or restore items from the Recycle Bin.';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.member_id IS DISTINCT FROM OLD.member_id
       OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
       OR NEW.customer_type IS DISTINCT FROM OLD.customer_type
       OR NEW.check_in_time IS DISTINCT FROM OLD.check_in_time
       OR NEW.plan_name IS DISTINCT FROM OLD.plan_name
       OR NEW.entry_fee IS DISTINCT FROM OLD.entry_fee
       OR NEW.base_price IS DISTINCT FROM OLD.base_price
       OR NEW.gcash_fee IS DISTINCT FROM OLD.gcash_fee
       OR NEW.card_fee IS DISTINCT FROM OLD.card_fee
       OR NEW.gcash_ref_no IS DISTINCT FROM OLD.gcash_ref_no
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
       OR NEW.staff_name IS DISTINCT FROM OLD.staff_name
       OR NEW.processed_by IS DISTINCT FROM OLD.processed_by
       OR NEW.cash_session_id IS DISTINCT FROM OLD.cash_session_id
       OR NEW.member_ids IS DISTINCT FROM OLD.member_ids
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
        RAISE EXCEPTION 'Access Denied: Staff cannot edit attendance amounts, payment status, or customer fields.';
    END IF;

    RETURN NEW;
END;
$$;

-- 2.2 sales: Staff can read ONLY active (deleted_at IS NULL) open-session/today sales.
--            Staff can UPDATE ONLY to soft-delete (OLD.deleted_at IS NULL -> NEW.deleted_at IS NOT NULL).
DROP POLICY IF EXISTS "Admins and scoped staff can read sales" ON public.sales;
CREATE POLICY "Admins and scoped staff can read sales"
    ON public.sales FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR (
            deleted_at IS NULL
            AND (
                (
                    cash_session_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM public.cash_sessions cs
                        WHERE cs.id = sales.cash_session_id
                          AND cs.status = 'open'
                          AND cs.closed_at IS NULL
                    )
                )
                OR (created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
            )
        )
    );

DROP POLICY IF EXISTS "Authenticated users can insert sales" ON public.sales;
CREATE POLICY "Authenticated users can insert sales"
    ON public.sales FOR INSERT TO authenticated
    WITH CHECK (
        public.is_admin()
        OR deleted_at IS NULL
    );

DROP POLICY IF EXISTS "Admins and scoped staff can soft-delete or restore sales" ON public.sales;
CREATE POLICY "Admins and scoped staff can soft-delete or restore sales"
    ON public.sales FOR UPDATE TO authenticated
    USING (
        public.is_admin()
        OR (
            deleted_at IS NULL
            AND (
                (
                    cash_session_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM public.cash_sessions cs
                        WHERE cs.id = sales.cash_session_id
                          AND cs.status = 'open'
                          AND cs.closed_at IS NULL
                    )
                )
                OR (created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
            )
        )
    )
    WITH CHECK (
        public.is_admin()
        OR (
            deleted_at IS NOT NULL
            AND (
                (
                    cash_session_id IS NOT NULL
                    AND EXISTS (
                        SELECT 1 FROM public.cash_sessions cs
                        WHERE cs.id = sales.cash_session_id
                          AND cs.status = 'open'
                          AND cs.closed_at IS NULL
                    )
                )
                OR (created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
            )
        )
    );

CREATE OR REPLACE FUNCTION public.f_tr_guard_sales_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    IF OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL THEN
        RAISE EXCEPTION 'Access Denied: Staff cannot view or restore items from the Recycle Bin.';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.receipt_no IS DISTINCT FROM OLD.receipt_no
       OR NEW.items IS DISTINCT FROM OLD.items
       OR NEW.product_name IS DISTINCT FROM OLD.product_name
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.amount_received IS DISTINCT FROM OLD.amount_received
       OR NEW.change_calculated IS DISTINCT FROM OLD.change_calculated
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
       OR NEW.gcash_fee_applied IS DISTINCT FROM OLD.gcash_fee_applied
       OR NEW.reference_number IS DISTINCT FROM OLD.reference_number
       OR NEW.cash_session_id IS DISTINCT FROM OLD.cash_session_id
       OR NEW.processed_by IS DISTINCT FROM OLD.processed_by
       OR NEW.is_quarantined IS DISTINCT FROM OLD.is_quarantined
       OR NEW.quarantine_reason IS DISTINCT FROM OLD.quarantine_reason THEN
        RAISE EXCEPTION 'Access Denied: Staff cannot modify sales items, totals, or payment details.';
    END IF;

    RETURN NEW;
END;
$$;

-- 2.3 products: Staff can read ONLY active (non-deleted) products.
DROP POLICY IF EXISTS "Authenticated users can read products" ON public.products;
CREATE POLICY "Authenticated users can read products"
    ON public.products FOR SELECT TO authenticated
    USING (
        public.is_admin()
        OR deleted_at IS NULL
    );

COMMIT;

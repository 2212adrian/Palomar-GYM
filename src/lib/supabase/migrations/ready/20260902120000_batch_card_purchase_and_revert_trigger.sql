DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_type_enum') THEN
        BEGIN
            ALTER TYPE public.customer_type_enum ADD VALUE IF NOT EXISTS 'Card';
        EXCEPTION WHEN duplicate_object THEN
            -- Value already exists
        END;
    END IF;
END $$;

BEGIN;

-- 1. Trigger Function: Automatically Revert Card Status on Logbook Delete/Soft-Delete & Restore
CREATE OR REPLACE FUNCTION public.handle_card_revert_on_attendance_change()
RETURNS TRIGGER AS $$
BEGIN
    -- [CASE A] When an attendance row is deleted or soft-deleted (moved to Recycle Bin)
    IF (TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL) 
       OR (TG_OP = 'DELETE') THEN
        
        IF (COALESCE(OLD.customer_type::text, '') = 'Card' 
            OR OLD.plan_name ILIKE '%Physical Membership Card%' 
            OR OLD.plan_name ILIKE '%Batch Physical Cards%'
            OR OLD.plan_name ILIKE '%Card Printing Fee%'
            OR OLD.plan_name ILIKE '%Card Fee%') THEN
            
            IF OLD.receipt_number IS NOT NULL THEN
                UPDATE public.cards
                SET payment_status = 'NONE',
                    claim_status = 'NOT_APPLICABLE',
                    card_fee_paid = 0.00,
                    receipt_number = NULL,
                    claimed_at = NULL,
                    claimed_by = NULL,
                    claim_notes = NULL,
                    updated_at = now()
                WHERE receipt_number = OLD.receipt_number;

                DELETE FROM public.receipts WHERE id = OLD.receipt_number;
            ELSE
                UPDATE public.cards
                SET payment_status = 'NONE',
                    claim_status = 'NOT_APPLICABLE',
                    card_fee_paid = 0.00,
                    receipt_number = NULL,
                    claimed_at = NULL,
                    claimed_by = NULL,
                    claim_notes = NULL,
                    updated_at = now()
                WHERE member_id = OLD.member_id;
            END IF;
        END IF;

    -- [CASE B] When restored from Logbook Recycle Bin
    ELSIF (TG_OP = 'UPDATE' AND NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL) THEN
        IF (COALESCE(NEW.customer_type::text, '') = 'Card' 
            OR NEW.plan_name ILIKE '%Physical Membership Card%' 
            OR NEW.plan_name ILIKE '%Batch Physical Cards%'
            OR NEW.plan_name ILIKE '%Card Printing Fee%'
            OR NEW.plan_name ILIKE '%Card Fee%') THEN
            
            IF NEW.receipt_number IS NOT NULL THEN
                UPDATE public.cards
                SET payment_status = 'PAID',
                    claim_status = 'UNCLAIMED',
                    card_fee_paid = COALESCE(NEW.card_fee, NEW.entry_fee, 50.00),
                    receipt_number = NEW.receipt_number,
                    updated_at = now()
                WHERE receipt_number = NEW.receipt_number;
            ELSE
                UPDATE public.cards
                SET payment_status = 'PAID',
                    claim_status = 'UNCLAIMED',
                    card_fee_paid = COALESCE(NEW.card_fee, NEW.entry_fee, 50.00),
                    receipt_number = NEW.receipt_number,
                    updated_at = now()
                WHERE member_id = NEW.member_id;
            END IF;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reattach trigger safely
DROP TRIGGER IF EXISTS tr_card_revert_on_attendance_change ON public.attendance;
CREATE TRIGGER tr_card_revert_on_attendance_change
    AFTER UPDATE OR DELETE ON public.attendance
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_card_revert_on_attendance_change();

-- 2. Consolidated Batch Purchase Member Cards RPC
CREATE OR REPLACE FUNCTION public.batch_purchase_member_cards(
    p_member_ids text[],
    p_payment_method text,
    p_card_fee numeric DEFAULT 50.00,
    p_gcash_ref_no text DEFAULT NULL,
    p_staff_name text DEFAULT 'Admin Staff'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member_id text;
    v_member record;
    v_batch_receipt_id text;
    v_batch_checkin_id text;
    v_count integer := 0;
    v_total_amount numeric := 0.00;
    v_first_name text := NULL;
    v_first_member_id text := NULL;
    v_summary_names text := '';
    v_now timestamptz := now();
    v_expires timestamptz := now() + interval '3 years';
    v_payment_method public.payment_method_enum;
    v_customer_type public.customer_type_enum;
BEGIN
    IF lower(COALESCE(p_payment_method, 'Cash')) LIKE '%gcash%' THEN
        v_payment_method := 'GCash'::public.payment_method_enum;
    ELSE
        v_payment_method := 'Cash'::public.payment_method_enum;
    END IF;

    v_customer_type := 'Card'::public.customer_type_enum;
    v_batch_receipt_id := 'REC-CARD-' || to_char(v_now AT TIME ZONE 'Asia/Manila', 'YYMMDD') || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    v_batch_checkin_id := 'CHK-' || to_char(v_now AT TIME ZONE 'Asia/Manila', 'YYMMDD') || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);

    FOREACH v_member_id IN ARRAY p_member_ids LOOP
        SELECT * INTO v_member 
        FROM public.members 
        WHERE (member_id = v_member_id OR id::text = v_member_id) 
          AND deleted_at IS NULL;
        
        IF FOUND THEN
            v_count := v_count + 1;
            IF v_first_name IS NULL THEN
                v_first_name := v_member.full_name;
                v_first_member_id := v_member.member_id;
            END IF;

            INSERT INTO public.cards (
                member_id,
                card_number,
                card_type,
                status,
                version,
                payment_status,
                claim_status,
                card_fee_paid,
                receipt_number,
                issued_at,
                expires_at,
                updated_at
            ) VALUES (
                v_member.member_id,
                gen_random_uuid()::text,
                'QR',
                'Active',
                1,
                'PAID',
                'UNCLAIMED',
                p_card_fee,
                v_batch_receipt_id,
                v_now,
                v_expires,
                v_now
            )
            ON CONFLICT (member_id) DO UPDATE SET
                payment_status = 'PAID',
                claim_status = 'UNCLAIMED',
                card_fee_paid = p_card_fee,
                receipt_number = v_batch_receipt_id,
                updated_at = v_now;
        END IF;
    END LOOP;

    IF v_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'count', 0);
    END IF;

    v_total_amount := p_card_fee * v_count;

    IF v_count = 1 THEN
        v_summary_names := v_first_name;
    ELSE
        v_summary_names := v_first_name || ' & ' || (v_count - 1)::text || ' others';
    END IF;

    -- 1. Insert 1 consolidated Receipt
    INSERT INTO public.receipts (
        id,
        member_id,
        customer_name,
        customer_type,
        amount,
        base_price,
        gcash_fee,
        card_fee,
        gcash_ref_no,
        payment_method,
        payment_status,
        item_description,
        created_at
    ) VALUES (
        v_batch_receipt_id,
        v_first_member_id,
        v_summary_names,
        v_customer_type,
        v_total_amount,
        0.00,
        0.00,
        v_total_amount,
        p_gcash_ref_no,
        v_payment_method,
        'Paid',
        CASE WHEN v_count = 1 THEN 'Physical Membership Card Fee' ELSE 'Batch Physical Cards (' || v_count::text || ' pcs)' END,
        v_now
    );

    -- 2. Insert 1 consolidated Attendance record for Logbook
    INSERT INTO public.attendance (
        id,
        member_id,
        customer_name,
        customer_type,
        check_in_time,
        plan_name,
        entry_fee,
        base_price,
        gcash_fee,
        card_fee,
        gcash_ref_no,
        payment_method,
        receipt_number,
        staff_name,
        created_at
    ) VALUES (
        v_batch_checkin_id,
        v_first_member_id,
        v_summary_names,
        v_customer_type,
        v_now,
        CASE WHEN v_count = 1 THEN 'Physical Membership Card' ELSE 'Batch Physical Cards (' || v_count::text || ' pcs)' END,
        v_total_amount,
        0.00,
        0.00,
        v_total_amount,
        p_gcash_ref_no,
        v_payment_method,
        v_batch_receipt_id,
        COALESCE(p_staff_name, 'Admin Staff'),
        v_now
    );

    RETURN jsonb_build_object('success', true, 'count', v_count, 'total', v_total_amount);
END;
$$;

-- 3. Update get_sanitized_logbook RPC Function
CREATE OR REPLACE FUNCTION public.get_sanitized_logbook(target_date date default null)
RETURNS TABLE (
    id text,
    "timestamp" timestamptz,
    member_id text,
    customer_name text,
    customer_type text,
    category_or_plan text,
    payment_method text,
    amount_paid numeric,
    base_price numeric,
    gcash_fee numeric,
    card_fee numeric,
    gcash_ref_no text,
    payment_status text,
    is_subscription boolean,
    deletable boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH ref_date AS (
        SELECT COALESCE(target_date, (now() AT TIME ZONE 'Asia/Manila')::date) AS d
    )
    SELECT
        a.id::text AS id,
        a.check_in_time AS "timestamp",
        a.member_id::text AS member_id,
        a.customer_name::text AS customer_name,
        a.customer_type::text AS customer_type,
        COALESCE(a.plan_name, 'Regular Pass')::text AS category_or_plan,
        a.payment_method::text AS payment_method,
        COALESCE(a.entry_fee, 0.00)::numeric AS amount_paid,
        COALESCE(a.base_price, a.entry_fee - COALESCE(a.gcash_fee, 0.00))::numeric AS base_price,
        COALESCE(a.gcash_fee, 0.00)::numeric AS gcash_fee,
        COALESCE(a.card_fee, 0.00)::numeric AS card_fee,
        a.gcash_ref_no::text AS gcash_ref_no,
        CASE WHEN COALESCE(a.entry_fee, 0.00) > 0 THEN 'Paid' ELSE 'Promo' END::text AS payment_status,
        false AS is_subscription,
        true AS deletable
    FROM public.attendance a, ref_date rd
    WHERE a.deleted_at IS NULL
      AND (a.check_in_time AT TIME ZONE 'Asia/Manila')::date = rd.d

    UNION ALL

    SELECT
        'rcpt-' || r.id::text AS id,
        r.created_at AS "timestamp",
        r.member_id::text AS member_id,
        r.customer_name::text AS customer_name,
        COALESCE(r.customer_type::text, 'New Membership')::text AS customer_type,
        COALESCE(r.item_description::text, 'Subscription')::text AS category_or_plan,
        r.payment_method::text AS payment_method,
        COALESCE(r.amount, 0.00)::numeric AS amount_paid,
        COALESCE(r.base_price, r.amount, 0.00)::numeric AS base_price,
        COALESCE(r.gcash_fee, 0.00)::numeric AS gcash_fee,
        COALESCE(r.card_fee, 0.00)::numeric AS card_fee,
        r.gcash_ref_no::text AS gcash_ref_no,
        'Paid'::text AS payment_status,
        true AS is_subscription,
        false AS deletable
    FROM public.receipts r, ref_date rd
    WHERE (r.created_at AT TIME ZONE 'Asia/Manila')::date = rd.d
      AND r.customer_type::text <> 'Card'

    ORDER BY "timestamp" DESC;
$$;

-- 4. Grant Execution Privileges
GRANT EXECUTE ON FUNCTION public.get_sanitized_logbook(date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.batch_purchase_member_cards(text[], text, numeric, text, text) TO authenticated;

COMMIT;
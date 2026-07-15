-- Migration: Patch Products and Sales RLS Policies to Support Staff Operations
-- Timestamp: 20260714180000_patch_rls_staff_privileges.sql

-- 1. Update Products UPDATE Policy
-- Allows both Admin and Staff to update products (enabling inventory stock adjustments on sales and restores) [1, 2]
DROP POLICY IF EXISTS "Allow authorized users to update products" ON public.products;

CREATE POLICY "Allow authorized users to update products" ON public.products
    FOR UPDATE
    TO authenticated
    USING (
        lower(public.get_user_role()) = 'admin' OR
        lower(public.get_user_role()) = 'staff' OR
        auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
    )
    WITH CHECK (
        lower(public.get_user_role()) = 'admin' OR
        lower(public.get_user_role()) = 'staff' OR
        auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com'
    );


-- 2. Update Sales SELECT Policy
-- Replaces the "biographies" key typo in JWT check with the direct path [1]
DROP POLICY IF EXISTS "Allow authenticated users to view sales" ON public.sales;

CREATE POLICY "Allow authenticated users to view sales" ON public.sales
    FOR SELECT
    TO authenticated
    USING (
        (lower(public.get_user_role()) = 'admin' OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
        OR (
            deleted_at IS NULL 
            AND (created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
        )
    );


-- 3. Update Sales UPDATE Policy
-- Allows Admins to update any sale, and Staff to update/restore current-day transactions from the Recycle Bin [1, 2]
DROP POLICY IF EXISTS "Allow authorized users to update sales" ON public.sales;

CREATE POLICY "Allow authorized users to update sales" ON public.sales
    FOR UPDATE
    TO authenticated
    USING (
        (lower(public.get_user_role()) = 'admin' OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
        OR (
            lower(public.get_user_role()) = 'staff' 
            AND (created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
        )
    )
    WITH CHECK (
        (lower(public.get_user_role()) = 'admin' OR auth.jwt() ->> 'email' = 'wolf.palomar@gmail.com')
        OR (
            lower(public.get_user_role()) = 'staff' 
            AND (created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
        )
    );
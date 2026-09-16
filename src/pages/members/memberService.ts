// src/pages/members/memberService.ts
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
import { assertActiveCashSession } from '../../hooks/useSessionLock';

import type {
  Member,
  Subscription,
  MemberCard,
  Receipt,
  OnlineRegistration,
  ActivityLog,
  MembershipSettings,
  PaymentMethod,
  AttendanceRecord,
  MemberStatus,
  SubscriptionStatus,
  CardStatus,
  RegistrationStatus,
  PaymentStatus,
} from '../../types/members';

export type {
  Member,
  Subscription,
  MemberCard,
  Receipt,
  OnlineRegistration,
  ActivityLog,
  MembershipSettings,
  PaymentMethod,
  AttendanceRecord,
  MemberStatus,
  SubscriptionStatus,
  CardStatus,
  RegistrationStatus,
  PaymentStatus,
};

export const STORAGE_KEYS = {
  MEMBERS: 'palomar_members',
  DELETED_MEMBERS: 'palomar_gym_members_deleted',
  SUBSCRIPTIONS: 'palomar_subscriptions',
  CARDS: 'palomar_cards',
  RECEIPTS: 'palomar_receipts',
  REGISTRATIONS: 'palomar_registration_queue',
  SETTINGS: 'palomar_membership_settings',
  LOGS: 'palomar_activity_logs',
  ATTENDANCE: 'palomar_attendance',
};

export const DEFAULT_SETTINGS: MembershipSettings = {
  gym_name: 'WOLF PALOMAR GYM',
  system_name: 'Wolf Management Console 2.0',
  currency: '₱',
  monthly_plan_price: 0,
  yearly_plan_price: 0,
  regular_walkin_fee: 0,
  student_walkin_fee: 0,
  monthly_member_checkin_fee: 0,
  yearly_member_checkin_fee: 0,
  qr_card_enabled: true,
  manual_card_enabled: true,
  card_printing_fee: 150,
  card_replacement_fee: 150,
  gcash_fee: 10,
  receipt_prefix: 'REC-',
  receipt_starting_no: 10000000001,
  receipt_footer: 'Thank you for choosing Wolf Gym.',
  registration_expiry_hours: 24,
  max_registrations_per_hour: 3,
  max_registrations_per_day: 5,
};

// ==========================================
// INTERNAL HELPERS
// ==========================================

const isUUID = (str?: string | null): boolean => {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str.trim()
  );
};

/**
 * Generates a high-entropy cryptographically secure UUID token for membership cards.
 */
export const generateCardTokenUuid = (): string => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const writeAudit = async (
  action: string,
  category: ActivityLog['category'],
  _user: string,
  affectedId?: string,
  reason?: string,
  details?: string
) => {
  try {
    const formattedDetails =
      details || reason || `${category} operation processed.`;
    await logAudit(action, formattedDetails, affectedId);
  } catch (err) {
    console.warn('Audit logging bypassed:', err);
  }
};

/**
 * Computes effective subscription status dynamically.
 */
export const getEffectiveSubscriptionStatus = (
  status: SubscriptionStatus | string,
  startDateStr: string,
  endDateStr: string
): SubscriptionStatus => {
  if (status === 'Voided') return 'Voided';

  const now = Date.now();
  const startMs = new Date(startDateStr).getTime();
  const endMs = new Date(endDateStr).getTime();

  if (!isNaN(startMs) && startMs > now) {
    return 'Inactive' as SubscriptionStatus; // Scheduled queued subscription
  }
  if (!isNaN(endMs) && endMs < now) {
    return 'Expired';
  }
  return 'Active';
};

// ==========================================
// MEMBER SERVICE
// ==========================================
export const memberService = {
  getAll: async (): Promise<Member[]> => {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching members from Supabase:', error);
      throw new Error(error.message);
    }

    return (data || []).map((m) => ({
      ...m,
      avatar_url: m.image_url || m.avatar_url || null,
    }));
  },

  getById: async (id: string): Promise<Member | null> => {
    if (!id) return null;

    let query = supabase.from('members').select('*');
    if (isUUID(id)) {
      query = query.eq('id', id);
    } else {
      query = query.eq('member_id', id);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('Error fetching member by ID:', error);
      throw new Error(error.message);
    }

    return data
      ? { ...data, avatar_url: data.image_url || data.avatar_url || null }
      : null;
  },

  getArchived: async (): Promise<Member[]> => {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) {
      console.error('Error fetching archived members:', error);
      throw new Error(error.message);
    }

    return (data || []).map((m) => ({
      ...m,
      avatar_url: m.image_url || m.avatar_url || null,
    }));
  },

  create: async (
    data: Partial<Member> & { full_name: string; phone: string },
    user: string
  ): Promise<Member> => {
    const d = data as any;
    const payload = {
      full_name: d.full_name,
      phone: d.phone,
      email: d.email || null,
      gender: d.gender || 'Male',
      birthday: d.birthday || null,
      address: d.address || null,
      image_url: d.image_url || d.avatar_url || null,
      emergency_contact_name: d.emergency_contact_name || null,
      relationship: d.relationship || null,
      emergency_contact_phone: d.emergency_contact_phone || null,
      status: d.status || 'Active',
      notes: d.notes || null,

      parent_name: d.parent_name || null,
      parent_relationship: d.parent_relationship || null,
      parent_phone: d.parent_phone || null,
      parent_email: d.parent_email || null,
      applicant_signature: d.applicant_signature || null,
      parent_signature: d.parent_signature || null,
      consent_date: d.consent_date || null,
    };

    const { data: created, error } = await supabase
      .from('members')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Error creating member in Supabase:', error);
      throw new Error(error.message);
    }

    const newMember: Member = {
      ...created,
      avatar_url: created.image_url || created.avatar_url || null,
    };

    await writeAudit(
      'MEMBER_CREATED',
      'Members',
      user,
      newMember.member_id,
      undefined,
      `Registered profile for ${newMember.full_name}`
    );
    return newMember;
  },

  update: async (
    id: string,
    updates: Partial<Member>,
    user: string
  ): Promise<Member> => {
    if (!id) throw new Error('Member ID is required for update.');

    let findQuery = supabase.from('members').select('*');
    if (isUUID(id)) {
      findQuery = findQuery.eq('id', id);
    } else {
      findQuery = findQuery.eq('member_id', id);
    }
    const { data: previousData } = await findQuery.maybeSingle();

    const payload: any = { ...updates, updated_at: new Date().toISOString() };

    if ('avatar_url' in payload) {
      if (!payload.image_url && payload.avatar_url) {
        payload.image_url = payload.avatar_url;
      }
      delete payload.avatar_url;
    }
    delete payload.id;

    let query = supabase.from('members').update(payload);
    if (isUUID(id)) {
      query = query.eq('id', id);
    } else {
      query = query.eq('member_id', id);
    }

    const { data: updated, error } = await query.select().single();

    if (error) {
      console.error('Error updating member:', error);
      throw new Error(error.message);
    }

    const memberObj: Member = {
      ...updated,
      avatar_url: updated.image_url || null,
    };

    const changes: string[] = [];
    if (previousData) {
      if (updates.full_name && updates.full_name !== previousData.full_name) {
        changes.push(
          `Name: "${previousData.full_name}" -> "${updates.full_name}"`
        );
      }
      if (updates.phone && updates.phone !== previousData.phone) {
        changes.push(
          `Phone: "${previousData.phone || 'None'}" -> "${updates.phone}"`
        );
      }
      if (updates.status && updates.status !== previousData.status) {
        changes.push(`Status: "${previousData.status}" -> "${updates.status}"`);
      }
    }

    const auditDetail =
      changes.length > 0
        ? `Updated member profile for "${memberObj.full_name}": ${changes.join(', ')}`
        : `Updated profile parameters for "${memberObj.full_name}".`;

    await writeAudit(
      'MEMBER_UPDATED',
      'Members',
      user,
      memberObj.member_id,
      undefined,
      auditDetail
    );
    return memberObj;
  },

  archive: async (id: string, reason: string, user: string): Promise<void> => {
    if (!id) throw new Error('Member ID is required for archive.');

    let findQuery = supabase.from('members').select('*');
    if (isUUID(id)) {
      findQuery = findQuery.eq('id', id);
    } else {
      findQuery = findQuery.eq('member_id', id);
    }

    const { data: target, error: findError } = await findQuery.single();

    if (findError || !target) {
      throw new Error('Member profile not found.');
    }

    const { data: activeSubs } = await supabase
      .from('subscriptions')
      .select('id, plan_type, status, end_date')
      .eq('member_id', target.member_id)
      .eq('status', 'Active');

    const hasCurrentlyActiveSub = (activeSubs || []).some(
      (s) => new Date(s.end_date).getTime() >= Date.now()
    );

    if (hasCurrentlyActiveSub) {
      throw new Error(
        `Archiving rejected: ${target.full_name} has an active subscription contract.`
      );
    }

    let archiveQuery = supabase.from('members').update({
      deleted_at: new Date().toISOString(),
      delete_reason: reason,
    });

    if (isUUID(id)) {
      archiveQuery = archiveQuery.eq('id', id);
    } else {
      archiveQuery = archiveQuery.eq('member_id', id);
    }

    const { error: updateErr } = await archiveQuery;

    if (updateErr) {
      console.error('Error archiving member:', updateErr);
      throw new Error(updateErr.message);
    }

    await writeAudit(
      'MEMBER_ARCHIVED',
      'Members',
      user,
      target.member_id,
      reason,
      `Moved ${target.full_name} to Recycle Bin.`
    );
  },

  restore: async (id: string, user: string): Promise<Member> => {
    if (!id) throw new Error('Member ID is required for restore.');

    let query = supabase.from('members').update({
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
      status: 'Active',
      updated_at: new Date().toISOString(),
    });

    if (isUUID(id)) {
      query = query.eq('id', id);
    } else {
      query = query.eq('member_id', id);
    }

    const { data: restored, error } = await query.select().single();

    if (error) {
      console.error('Error restoring member:', error);
      throw new Error(error.message);
    }

    const memberObj: Member = {
      ...restored,
      avatar_url: restored.image_url || restored.avatar_url || null,
    };

    await writeAudit(
      'MEMBER_RESTORED',
      'Members',
      user,
      memberObj.member_id,
      undefined,
      `Restored profile for ${memberObj.full_name}`
    );
    return memberObj;
  },
};

// ==========================================
// SUBSCRIPTION SERVICE
// ==========================================
export const subscriptionService = {
  getAll: async (): Promise<Subscription[]> => {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching subscriptions:', error);
      throw new Error(error.message);
    }

    return (data || []).map((s) => {
      const effStatus = getEffectiveSubscriptionStatus(
        s.status,
        s.start_date,
        s.end_date
      );
      return {
        ...s,
        status: effStatus,
        plan_name:
          s.plan_type === 'yearly' ? 'Yearly Membership' : 'Monthly Membership',
      };
    });
  },

  getByMemberId: async (memberId: string): Promise<Subscription[]> => {
    if (!memberId) return [];

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching subscriptions for member:', error);
      throw new Error(error.message);
    }

    return (data || []).map((s) => {
      const effStatus = getEffectiveSubscriptionStatus(
        s.status,
        s.start_date,
        s.end_date
      );
      return {
        ...s,
        status: effStatus,
        plan_name:
          s.plan_type === 'yearly' ? 'Yearly Membership' : 'Monthly Membership',
      };
    });
  },

  create: async (
    memberId: string,
    planName: 'Monthly Membership' | 'Yearly Membership',
    paymentMethod: PaymentMethod,
    user: string,
    amountPaidOverride?: number,
    extraDetails?: {
      basePrice?: number;
      gcashFee?: number;
      cardFee?: number;
      gcashRefNo?: string;
    }
  ): Promise<Subscription> => {
    await assertActiveCashSession('create or renew subscriptions');

    if (!memberId) {
      throw new Error('Member ID is missing or invalid.');
    }

    let mQuery = supabase.from('members').select('*');
    if (isUUID(memberId)) {
      mQuery = mQuery.eq('id', memberId);
    } else {
      mQuery = mQuery.eq('member_id', memberId);
    }

    const { data: m, error: mErr } = await mQuery.single();

    if (mErr || !m) {
      console.error('Member lookup failed for ID:', memberId, mErr);
      throw new Error(`Member lookup missing for identifier "${memberId}".`);
    }

    if (m.status === 'Suspended') {
      throw new Error(`Member ${m.full_name} is currently suspended.`);
    }

    // Check for any currently ACTIVE subscription that has not expired yet
    const { data: memberSubs } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('member_id', m.member_id)
      .neq('status', 'Voided')
      .order('end_date', { ascending: false });

    const now = new Date();
    const activeSub = (memberSubs || []).find((s) => {
      const endMs = new Date(s.end_date).getTime();
      return s.status === 'Active' && endMs > now.getTime();
    });

    const activeSettings = await settingsService.load();

    const dbPlanType = planName === 'Yearly Membership' ? 'yearly' : 'monthly';
    const defaultPrice =
      planName === 'Monthly Membership'
        ? activeSettings.monthly_plan_price
        : activeSettings.yearly_plan_price;
    const basePrice = extraDetails?.basePrice ?? defaultPrice;
    const gcashFee =
      extraDetails?.gcashFee ??
      (paymentMethod === 'GCash' ? activeSettings.gcash_fee || 10 : 0);
    const cardFee = extraDetails?.cardFee ?? 0;
    const gcashRefNo = extraDetails?.gcashRefNo || null;

    const totalAmount = amountPaidOverride ?? basePrice + gcashFee + cardFee;
    const durationDays = planName === 'Monthly Membership' ? 30 : 365;

    let start: Date;
    let initialStatus: SubscriptionStatus;

    if (activeSub) {
      start = new Date(activeSub.end_date);
      initialStatus = 'Inactive';
    } else {
      start = new Date();
      initialStatus = 'Active';
    }

    const end = new Date(start.getTime());
    end.setDate(end.getDate() + durationDays);

    // Insert new subscription record
    const { data: insertedSub, error: subErr } = await supabase
      .from('subscriptions')
      .insert([
        {
          member_id: m.member_id,
          plan_type: dbPlanType,
          price: totalAmount,
          base_price: basePrice,
          gcash_fee: gcashFee,
          card_fee: cardFee,
          gcash_ref_no: gcashRefNo,
          start_date: start.toISOString(),
          end_date: end.toISOString(),
          status: initialStatus,
          payment_status: 'Paid',
          payment_method: paymentMethod,
        },
      ])
      .select()
      .single();

    if (subErr) {
      console.error('Error inserting subscription:', subErr);
      throw new Error(subErr.message);
    }

    // Ensure a valid receipt ID is present
    const receiptNo =
      insertedSub.receipt_number ||
      `REC-${Date.now().toString().slice(-8)}`;

    if (!insertedSub.receipt_number) {
      await supabase
        .from('subscriptions')
        .update({ receipt_number: receiptNo })
        .eq('id', insertedSub.id);
      insertedSub.receipt_number = receiptNo;
    }

    await supabase
      .from('members')
      .update({ status: 'Active', updated_at: new Date().toISOString() })
      .eq('member_id', m.member_id);

    // Insert official receipt into receipts table (tracked by Cash Management)
    const { error: rcptInsertErr } = await supabase.from('receipts').insert([
      {
        id: receiptNo,
        member_id: m.member_id,
        customer_name: m.full_name,
        customer_type: activeSub ? 'Membership Renewal' : 'New Membership',
        amount: totalAmount,
        base_price: basePrice,
        gcash_fee: gcashFee,
        card_fee: cardFee,
        gcash_ref_no: gcashRefNo,
        payment_method: paymentMethod,
        payment_status: 'Paid',
        item_description: activeSub
          ? `Renewal under ${planName} (Starts ${start.toLocaleDateString()})`
          : `Subscribed under ${planName}`,
      },
    ]);

    if (rcptInsertErr) {
      console.warn('Failed to insert receipt for subscription:', rcptInsertErr);
    }

    const auditActionText = activeSub
      ? `Scheduled ${planName} Renewal starting ${start.toLocaleDateString()}.`
      : `Issued ${planName} Contract.`;

    await writeAudit(
      'SUBSCRIPTION_CREATED',
      'Subscriptions',
      user,
      m.member_id,
      undefined,
      auditActionText
    );

    window.dispatchEvent(new Event('palomar_logbook_updated'));

    return {
      ...insertedSub,
      status: activeSub ? 'Inactive' : 'Active',
      plan_name: planName,
    };
  },

  void: async (
    subscriptionId: string,
    reason: string,
    notes: string,
    user: string
  ): Promise<void> => {
    await assertActiveCashSession('void subscriptions and revoke revenue');

    const { data: target, error: findErr } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .single();

    if (findErr || !target) throw new Error('Subscription record not found.');

    // 1. Delete linked receipt so cash drawer balance reconciles immediately
    if (target.receipt_number) {
      const { error: rcptErr } = await supabase
        .from('receipts')
        .delete()
        .eq('id', target.receipt_number);

      if (rcptErr) {
        console.error('Error purging receipt on void:', rcptErr.message);
      }

      const { error: attErr } = await supabase
        .from('attendance')
        .delete()
        .eq('receipt_number', target.receipt_number);

      if (attErr) {
        console.warn('Attendance deletion on void:', attErr.message);
      }
    }

    // 2. Mark subscription as Voided
    const { error: voidErr } = await supabase
      .from('subscriptions')
      .update({
        status: 'Voided',
        payment_status: 'Cancelled',
        voided_at: new Date().toISOString(),
        voided_by: user,
        void_reason: reason,
        void_notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscriptionId);

    if (voidErr) {
      console.error('Error voiding subscription:', voidErr);
      throw new Error(voidErr.message);
    }

    await writeAudit(
      'SUBSCRIPTION_VOIDED',
      'Subscriptions',
      user,
      target.member_id,
      reason,
      `Voided subscription contract (${target.id}) and purged receipt ${target.receipt_number || 'N/A'}. Notes: ${notes || 'None'}.`
    );

    window.dispatchEvent(new Event('palomar_logbook_updated'));
  },
};

// ==========================================
// CARD SERVICE (CARDS TABLE & CASH MANAGEMENT)
// ==========================================
export const cardService = {
  batchPurchase: async (
    memberIds: string[],
    paymentMethod: PaymentMethod,
    feePerCard: number = 10,
    gcashRefNo?: string,
    user: string = 'Admin Staff'
  ): Promise<{ success: boolean; count: number }> => {
    await assertActiveCashSession('batch purchase membership cards');

    if (!memberIds || memberIds.length === 0) {
      throw new Error('No members selected for batch card purchase.');
    }

    const { data, error } = await supabase.rpc('batch_purchase_member_cards', {
      p_member_ids: memberIds,
      p_payment_method: paymentMethod,
      p_card_fee: feePerCard,
      p_gcash_ref_no: gcashRefNo || null,
      p_staff_name: user,
    });

    if (error) {
      console.error('Batch card purchase error:', error);
      throw new Error(error.message);
    }

    // Fetch member names to create individual receipts for Cash Management ledger
    const { data: membersList } = await supabase
      .from('members')
      .select('member_id, full_name')
      .in('member_id', memberIds);

    const memberMap = new Map(
      (membersList || []).map((m: any) => [m.member_id, m.full_name])
    );

    const now = Date.now();
    const receiptRows = memberIds.map((mId, idx) => {
      const rcptId = `REC-CARD-${now.toString().slice(-6)}-${idx + 1}`;
      return {
        id: rcptId,
        member_id: mId,
        customer_name: memberMap.get(mId) || mId,
        customer_type: 'Physical Card',
        amount: feePerCard,
        base_price: 0,
        gcash_fee: 0,
        card_fee: feePerCard,
        gcash_ref_no: gcashRefNo || null,
        payment_method: paymentMethod,
        payment_status: 'Paid',
        item_description: 'Physical Membership Card Fee',
      };
    });

    if (receiptRows.length > 0) {
      const { error: rcptErr } = await supabase
        .from('receipts')
        .insert(receiptRows);

      if (rcptErr) {
        console.warn('Could not insert batch receipts for cards:', rcptErr);
      } else {
        // Link receipt_number to each card record
        for (const r of receiptRows) {
          await supabase
            .from('cards')
            .update({ receipt_number: r.id })
            .eq('member_id', r.member_id)
            .eq('status', 'Active');
        }
      }
    }

    await writeAudit(
      'CARDS_BATCH_PURCHASED',
      'Cards',
      user,
      undefined,
      undefined,
      `Batch purchased physical cards for ${data?.count || memberIds.length} members (₱${feePerCard * (data?.count || memberIds.length)} via ${paymentMethod}).`
    );

    window.dispatchEvent(new Event('palomar_logbook_updated'));

    return data;
  },

  getAll: async (): Promise<MemberCard[]> => {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .order('issued_at', { ascending: false });

    if (error) {
      console.error('Error fetching cards from cards table:', error);
      return [];
    }

    return (data || []).map((c) => ({
      id: c.id,
      member_id: c.member_id,
      card_number: c.card_number,
      card_type: c.card_type as 'QR' | 'Manual' | 'None',
      status: (new Date(c.expires_at).getTime() < Date.now()
        ? 'Inactive'
        : c.status) as CardStatus,
      version: c.version || 1,
      payment_status: (c.payment_status || 'NONE') as
        'NONE' | 'PAID' | 'REFUNDED',
      claim_status: (c.claim_status || 'NOT_APPLICABLE') as
        'NOT_APPLICABLE' | 'UNCLAIMED' | 'CLAIMED',
      card_fee_paid: Number(c.card_fee_paid || 0),
      claimed_at: c.claimed_at || null,
      claimed_by: c.claimed_by || null,
      claim_notes: c.claim_notes || null,
      receipt_number: c.receipt_number || null,
      issued_at: c.issued_at,
      expires_at: c.expires_at,
      replacement_reason: c.replacement_reason || undefined,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));
  },

  getByMemberId: async (memberId: string): Promise<MemberCard | null> => {
    if (!memberId) return null;

    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('member_id', memberId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching card by member_id:', error);
      return null;
    }

    if (!data) return null;

    const isExpired = new Date(data.expires_at).getTime() < Date.now();

    return {
      id: data.id,
      member_id: data.member_id,
      card_number: data.card_number,
      card_type: data.card_type as 'QR' | 'Manual' | 'None',
      status: isExpired ? 'Inactive' : (data.status as CardStatus),
      version: data.version || 1,
      payment_status: (data.payment_status || 'NONE') as
        'NONE' | 'PAID' | 'REFUNDED',
      claim_status: (data.claim_status || 'NOT_APPLICABLE') as
        'NOT_APPLICABLE' | 'UNCLAIMED' | 'CLAIMED',
      card_fee_paid: Number(data.card_fee_paid || 0),
      claimed_at: data.claimed_at || null,
      claimed_by: data.claimed_by || null,
      claim_notes: data.claim_notes || null,
      receipt_number: data.receipt_number || null,
      issued_at: data.issued_at,
      expires_at: data.expires_at,
      replacement_reason: data.replacement_reason || undefined,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  },

  issue: async (
    memberId: string,
    type: 'QR' | 'Manual' | 'None',
    user: string,
    customExpireIso?: string,
    paymentStatus: 'NONE' | 'PAID' | 'REFUNDED' = 'NONE',
    claimStatus: 'NOT_APPLICABLE' | 'UNCLAIMED' | 'CLAIMED' = 'NOT_APPLICABLE',
    cardFeePaid: number = 0,
    receiptNo?: string,
    forcedCardNumber?: string
  ): Promise<MemberCard | null> => {
    if (!memberId) throw new Error('Member ID is required to issue card.');

    if (cardFeePaid > 0) {
      await assertActiveCashSession('issue paid membership cards');
    }

    if (type === 'None') {
      await supabase.from('cards').delete().eq('member_id', memberId);
      return null;
    }

    const now = new Date();
    const nowIso = now.toISOString();

    let expiresIso = customExpireIso;
    if (!expiresIso) {
      const expDate = new Date(now);
      expDate.setFullYear(expDate.getFullYear() + 3);
      expiresIso = expDate.toISOString();
    }

    const cardNumber = forcedCardNumber || generateCardTokenUuid();

    const { data: cardRow, error: cardErr } = await supabase
      .from('cards')
      .upsert(
        {
          member_id: memberId,
          card_number: cardNumber,
          card_type: type,
          status: 'Active',
          version: 1,
          payment_status: paymentStatus,
          claim_status: claimStatus,
          card_fee_paid: cardFeePaid,
          receipt_number: receiptNo || null,
          claimed_at: claimStatus === 'CLAIMED' ? nowIso : null,
          claimed_by: claimStatus === 'CLAIMED' ? user : null,
          issued_at: nowIso,
          expires_at: expiresIso,
          updated_at: nowIso,
        },
        { onConflict: 'member_id' }
      )
      .select()
      .single();

    if (cardErr) {
      console.error('Error upserting card record:', cardErr);
      throw new Error(cardErr.message);
    }

    await writeAudit(
      'CARD_ISSUED',
      'Cards',
      user,
      memberId,
      undefined,
      `Assigned ${type} security token (${cardNumber}). Payment: ${paymentStatus}, Claim: ${claimStatus}.`
    );

    window.dispatchEvent(new Event('palomar_logbook_updated'));

    return {
      id: cardRow.id,
      member_id: cardRow.member_id,
      card_number: cardRow.card_number,
      card_type: cardRow.card_type as 'QR' | 'Manual' | 'None',
      status: 'Active',
      version: cardRow.version,
      payment_status: cardRow.payment_status as 'NONE' | 'PAID' | 'REFUNDED',
      claim_status: cardRow.claim_status as
        'NOT_APPLICABLE' | 'UNCLAIMED' | 'CLAIMED',
      card_fee_paid: Number(cardRow.card_fee_paid || 0),
      claimed_at: cardRow.claimed_at,
      claimed_by: cardRow.claimed_by,
      claim_notes: cardRow.claim_notes,
      receipt_number: cardRow.receipt_number,
      issued_at: cardRow.issued_at,
      expires_at: cardRow.expires_at,
      created_at: cardRow.created_at,
      updated_at: cardRow.updated_at,
    };
  },

  replace: async (
    memberId: string,
    reason: string,
    user: string,
    customExpireIso?: string,
    paymentStatus: 'NONE' | 'PAID' | 'REFUNDED' = 'PAID',
    claimStatus: 'NOT_APPLICABLE' | 'UNCLAIMED' | 'CLAIMED' = 'UNCLAIMED',
    cardFeePaid: number = 0,
    receiptNo?: string
  ): Promise<MemberCard> => {
    if (cardFeePaid > 0) {
      await assertActiveCashSession('reissue cards with replacement fee');
    }

    if (!memberId)
      throw new Error('Member ID is required for card replacement.');

    const existing = await cardService.getByMemberId(memberId);
    const newVersion = existing ? existing.version + 1 : 1;
    const currentType =
      existing?.card_type && existing.card_type !== 'None'
        ? existing.card_type
        : 'QR';

    const now = new Date();
    const nowIso = now.toISOString();

    let expiresIso = customExpireIso;
    if (!expiresIso) {
      const expDate = new Date(now);
      expDate.setFullYear(expDate.getFullYear() + 3);
      expiresIso = expDate.toISOString();
    }

    const newCardNumber = generateCardTokenUuid();
    const finalReceiptNo =
      receiptNo ||
      (cardFeePaid > 0 ? `REC-CARD-${Date.now().toString().slice(-6)}` : null);

    // If a replacement fee is charged, ensure it is recorded in the receipts table
    if (cardFeePaid > 0 && finalReceiptNo) {
      const { data: member } = await supabase
        .from('members')
        .select('full_name')
        .eq('member_id', memberId)
        .maybeSingle();

      await supabase.from('receipts').insert([
        {
          id: finalReceiptNo,
          member_id: memberId,
          customer_name: member?.full_name || memberId,
          customer_type: 'Existing Member',
          amount: cardFeePaid,
          base_price: 0,
          gcash_fee: 0,
          card_fee: cardFeePaid,
          payment_method: 'Cash',
          payment_status: 'Paid',
          item_description: `Physical Card Replacement Fee (${reason || 'Replacement'})`,
        },
      ]);
    }

    const { data: updated, error: cardErr } = await supabase
      .from('cards')
      .upsert(
        {
          member_id: memberId,
          card_number: newCardNumber,
          card_type: currentType,
          status: 'Active',
          version: newVersion,
          payment_status: paymentStatus,
          claim_status: claimStatus,
          card_fee_paid: cardFeePaid,
          receipt_number: finalReceiptNo || existing?.receipt_number || null,
          claimed_at: claimStatus === 'CLAIMED' ? nowIso : null,
          claimed_by: claimStatus === 'CLAIMED' ? user : null,
          issued_at: nowIso,
          expires_at: expiresIso,
          replacement_reason: reason,
          updated_at: nowIso,
        },
        { onConflict: 'member_id' }
      )
      .select()
      .single();

    if (cardErr) {
      console.error('Error replacing member card:', cardErr);
      throw new Error(cardErr.message);
    }

    await writeAudit(
      'CARD_REPLACED',
      'Cards',
      user,
      memberId,
      reason,
      `Reissued card version ${newVersion} (${newCardNumber}).`
    );

    window.dispatchEvent(new Event('palomar_logbook_updated'));

    return {
      id: updated.id,
      member_id: updated.member_id,
      card_number: updated.card_number,
      card_type: updated.card_type as 'QR' | 'Manual' | 'None',
      status: 'Active',
      version: updated.version,
      payment_status: updated.payment_status as 'NONE' | 'PAID' | 'REFUNDED',
      claim_status: updated.claim_status as
        'NOT_APPLICABLE' | 'UNCLAIMED' | 'CLAIMED',
      card_fee_paid: Number(updated.card_fee_paid || 0),
      claimed_at: updated.claimed_at,
      claimed_by: updated.claimed_by,
      claim_notes: updated.claim_notes,
      receipt_number: updated.receipt_number,
      issued_at: updated.issued_at,
      expires_at: updated.expires_at,
      replaced_at: nowIso,
      replacement_reason: reason,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    };
  },

  markClaimed: async (
    memberId: string,
    user: string,
    notes?: string
  ): Promise<MemberCard> => {
    if (!memberId)
      throw new Error('Member ID is required to mark card as claimed.');

    const nowIso = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('cards')
      .update({
        claim_status: 'CLAIMED',
        claimed_at: nowIso,
        claimed_by: user,
        claim_notes: notes || null,
        updated_at: nowIso,
      })
      .eq('member_id', memberId)
      .select()
      .single();

    if (error) {
      console.error('Error marking card claimed:', error);
      throw new Error(error.message);
    }

    await writeAudit(
      'CARD_CLAIMED',
      'Cards',
      user,
      memberId,
      undefined,
      `Physical card claimed and released to member. Notes: ${notes || 'None'}.`
    );

    return {
      id: updated.id,
      member_id: updated.member_id,
      card_number: updated.card_number,
      card_type: updated.card_type as 'QR' | 'Manual' | 'None',
      status: updated.status as CardStatus,
      version: updated.version,
      payment_status: updated.payment_status as 'NONE' | 'PAID' | 'REFUNDED',
      claim_status: 'CLAIMED',
      card_fee_paid: Number(updated.card_fee_paid || 0),
      claimed_at: updated.claimed_at,
      claimed_by: updated.claimed_by,
      claim_notes: updated.claim_notes,
      receipt_number: updated.receipt_number,
      issued_at: updated.issued_at,
      expires_at: updated.expires_at,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    };
  },

  payCard: async (
    memberId: string,
    amount: number,
    paymentMethod: PaymentMethod,
    user: string,
    receiptNo?: string,
    gcashRefNo?: string
  ): Promise<MemberCard> => {
    await assertActiveCashSession('process membership card payments');

    if (!memberId) throw new Error('Member ID is required.');

    // 1. Fetch member details
    const { data: member, error: mErr } = await supabase
      .from('members')
      .select('*')
      .eq('member_id', memberId)
      .single();

    if (mErr || !member) throw new Error('Member not found.');

    const finalReceiptNo =
      receiptNo || `REC-CARD-${Date.now().toString().slice(-6)}`;
    const nowIso = new Date().toISOString();

    // 2. Insert receipt so Cash Management ledger and drawer record the transaction
    const { error: rErr } = await supabase.from('receipts').insert([
      {
        id: finalReceiptNo,
        member_id: memberId,
        customer_name: member.full_name,
        customer_type: 'Existing Member',
        amount: amount,
        base_price: 0,
        gcash_fee: 0,
        card_fee: amount,
        gcash_ref_no: gcashRefNo || null,
        payment_method: paymentMethod,
        payment_status: 'Paid',
        item_description: 'Physical Membership Card Fee',
      },
    ]);

    if (rErr) {
      console.warn('Receipt creation error on card payment:', rErr);
    }

    // 3. Upsert card record
    const existing = await cardService.getByMemberId(memberId);
    let cardRow: any;

    if (existing) {
      const { data: updated, error: uErr } = await supabase
        .from('cards')
        .update({
          payment_status: 'PAID',
          claim_status: 'UNCLAIMED',
          card_fee_paid: amount,
          receipt_number: finalReceiptNo,
          claimed_at: null,
          claimed_by: null,
          updated_at: nowIso,
        })
        .eq('member_id', memberId)
        .select()
        .single();

      if (uErr) throw new Error(uErr.message);
      cardRow = updated;
    } else {
      const expDate = new Date();
      expDate.setFullYear(expDate.getFullYear() + 3);
      const expIso = expDate.toISOString();
      const cardNumber = generateCardTokenUuid();

      const { data: inserted, error: iErr } = await supabase
        .from('cards')
        .insert([
          {
            member_id: memberId,
            card_number: cardNumber,
            card_type: 'QR',
            status: 'Active',
            version: 1,
            payment_status: 'PAID',
            claim_status: 'UNCLAIMED',
            card_fee_paid: amount,
            receipt_number: finalReceiptNo,
            issued_at: nowIso,
            expires_at: expIso,
            updated_at: nowIso,
          },
        ])
        .select()
        .single();

      if (iErr) throw new Error(iErr.message);
      cardRow = inserted;
    }

    await writeAudit(
      'CARD_PAID',
      'Cards',
      user,
      memberId,
      undefined,
      `Paid physical card fee of ₱${amount.toFixed(2)} (${paymentMethod}). Receipt: ${finalReceiptNo}. Card ready for pickup.`
    );

    window.dispatchEvent(new Event('palomar_logbook_updated'));

    return {
      id: cardRow.id,
      member_id: cardRow.member_id,
      card_number: cardRow.card_number,
      card_type: cardRow.card_type as 'QR' | 'Manual' | 'None',
      status: 'Active',
      version: cardRow.version,
      payment_status: 'PAID',
      claim_status: 'UNCLAIMED',
      card_fee_paid: amount,
      claimed_at: null,
      claimed_by: null,
      receipt_number: finalReceiptNo,
      issued_at: cardRow.issued_at,
      expires_at: cardRow.expires_at,
      created_at: cardRow.created_at,
      updated_at: cardRow.updated_at,
    };
  },

  unbind: async (memberId: string, user: string): Promise<void> => {
    if (!memberId) throw new Error('Member ID is required to unbind card.');

    const { error } = await supabase
      .from('cards')
      .update({
        status: 'Inactive',
        updated_at: new Date().toISOString(),
      })
      .eq('member_id', memberId);

    if (error) {
      console.error('Error unbinding card:', error);
      throw new Error(error.message);
    }

    await writeAudit(
      'CARD_UNBOUND',
      'Cards',
      user,
      memberId,
      undefined,
      `Deactivated and unbound card credential.`
    );
  },
};

// ==========================================
// REGISTRATION SERVICE (ONLINE QUEUE)
// ==========================================
export const registrationService = {
  getQueue: async (): Promise<OnlineRegistration[]> => {
    const { data, error } = await supabase
      .from('online_registrations')
      .select('*')
      .eq('is_archived', false)
      .is('deleted_at', null)
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('Error fetching online registrations queue:', error);
      throw new Error(error.message);
    }

    return (data || []).map((r) => ({
      ...r,
      preferred_plan:
        r.preferred_plan === 'yearly'
          ? 'Yearly Membership'
          : 'Monthly Membership',
    }));
  },

  getArchived: async (): Promise<OnlineRegistration[]> => {
    const { data, error } = await supabase
      .from('online_registrations')
      .select('*')
      .or('is_archived.eq.true,deleted_at.not.is.null')
      .order('deleted_at', { ascending: false });

    if (error) {
      console.error('Error fetching archived online registrations:', error);
      throw new Error(error.message);
    }

    return (data || []).map((r) => ({
      ...r,
      preferred_plan:
        r.preferred_plan === 'yearly'
          ? 'Yearly Membership'
          : 'Monthly Membership',
    }));
  },

  submit: async (reg: OnlineRegistration): Promise<OnlineRegistration> => {
    const planStr = (reg.preferred_plan as string) || '';
    const dbPlan =
      planStr === 'Yearly Membership' || planStr === 'yearly'
        ? 'yearly'
        : 'monthly';

    const payload = {
      id:
        reg.id ||
        `REG-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
      full_name: reg.full_name,
      email: reg.email || null,
      phone: reg.phone,
      gender: reg.gender || 'Male',
      birthday: reg.birthday,
      address: reg.address || null,
      emergency_contact_name: reg.emergency_contact_name,
      relationship: reg.relationship || 'Emergency Contact',
      emergency_contact_phone: reg.emergency_contact_phone,
      preferred_plan: dbPlan,
      status: reg.status || 'Pending',
      submitted_at: reg.submitted_at || new Date().toISOString(),
      notes: reg.notes || null,

      parent_consent_required: reg.parent_consent_required || false,
      parent_name: reg.parent_name || null,
      parent_relationship: reg.parent_relationship || null,
      parent_phone: reg.parent_phone || null,
      parent_email: reg.parent_email || null,
      applicant_signature: reg.applicant_signature || null,
      parent_signature: reg.parent_signature || null,
      consent_date: reg.consent_date || null,
      guardian_consent: reg.guardian_consent ?? null,
    };

    const { data: inserted, error } = await supabase
      .from('online_registrations')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Error submitting online registration:', error);
      throw new Error(error.message);
    }

    return {
      ...inserted,
      preferred_plan:
        inserted.preferred_plan === 'yearly'
          ? 'Yearly Membership'
          : 'Monthly Membership',
    };
  },

  archive: async (
    regId: string,
    reason: string,
    user: string
  ): Promise<void> => {
    const { error } = await supabase
      .from('online_registrations')
      .update({
        is_archived: true,
        deleted_at: new Date().toISOString(),
        deleted_by: user,
        delete_reason: reason,
      })
      .eq('id', regId);

    if (error) {
      console.error('Error archiving online registration:', error);
      throw new Error(error.message);
    }

    await writeAudit(
      'PRE_REG_ARCHIVED',
      'Registrations',
      user,
      regId,
      reason,
      `Archived registration ticket to prevent daily purge.`
    );
  },

  restore: async (regId: string, user: string): Promise<void> => {
    const { error } = await supabase
      .from('online_registrations')
      .update({
        is_archived: false,
        deleted_at: null,
        deleted_by: null,
        delete_reason: null,
      })
      .eq('id', regId);

    if (error) {
      console.error('Error restoring online registration:', error);
      throw new Error(error.message);
    }

    await writeAudit(
      'PRE_REG_RESTORED',
      'Registrations',
      user,
      regId,
      undefined,
      `Restored registration ticket from archive.`
    );
  },

  reject: async (
    regId: string,
    reason: string,
    user: string
  ): Promise<void> => {
    const { error } = await supabase
      .from('online_registrations')
      .update({
        status: 'Rejected',
        notes: reason,
      })
      .eq('id', regId);

    if (error) {
      console.error('Error rejecting registration:', error);
      throw new Error(error.message);
    }

    await writeAudit(
      'PRE_REG_REJECTED',
      'Registrations',
      user,
      regId,
      reason,
      `Denied onboarding parameters.`
    );
  },

  approve: async (regId: string, user: string): Promise<void> => {
    const { error } = await supabase
      .from('online_registrations')
      .update({ status: 'Approved' })
      .eq('id', regId);

    if (error) {
      console.error('Error approving registration:', error);
      throw new Error(error.message);
    }

    await writeAudit(
      'PRE_REG_APPROVED',
      'Registrations',
      user,
      regId,
      undefined,
      `Approved online registration ticket.`
    );
  },
};

// ==========================================
// SETTINGS SERVICE (RATES_CONFIG & GYM_PROFILE)
// ==========================================
export const settingsService = {
  load: async (): Promise<MembershipSettings> => {
    const [ratesRes, profileRes] = await Promise.all([
      supabase.from('rates_config').select('*').eq('id', 1).maybeSingle(),
      supabase.from('gym_profile').select('*').eq('id', 1).maybeSingle(),
    ]);

    if (ratesRes.error) {
      throw new Error(`Rates config error: ${ratesRes.error.message}`);
    }

    const rData = ratesRes.data;
    const pData = profileRes.data;

    if (!rData) {
      throw new Error('No pricing configuration found in database.');
    }

    return {
      ...DEFAULT_SETTINGS,
      gym_name: pData?.gym_name ?? DEFAULT_SETTINGS.gym_name,
      monthly_plan_price: Number(rData.monthly_rate ?? 0),
      yearly_plan_price: Number(rData.yearly_rate ?? 0),
      regular_walkin_fee: Number(rData.regular_walk_in ?? 0),
      student_walkin_fee: Number(rData.student_walk_in ?? 0),
      yearly_member_checkin_fee: Number(rData.yearly_walk_in ?? 0),
      card_printing_fee: Number(rData.new_card_fee ?? 0),
      card_replacement_fee: Number(rData.new_card_fee ?? 0),
      gcash_fee: Number(rData.gcash_fee ?? 0),
    };
  },

  save: async (data: MembershipSettings, user: string): Promise<void> => {
    try {
      await supabase.from('rates_config').upsert([
        {
          id: 1,
          monthly_rate: data.monthly_plan_price,
          yearly_rate: data.yearly_plan_price,
          regular_walk_in: data.regular_walkin_fee,
          student_walk_in: data.student_walkin_fee,
          yearly_walk_in: data.yearly_member_checkin_fee,
          new_card_fee: data.card_printing_fee,
          gcash_fee: data.gcash_fee,
          updated_at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      console.warn('Failed to persist settings to Supabase:', e);
    }

    await writeAudit(
      'SETTINGS_SAVED',
      'Settings',
      user,
      undefined,
      undefined,
      'Saved configuration options.'
    );
  },
};
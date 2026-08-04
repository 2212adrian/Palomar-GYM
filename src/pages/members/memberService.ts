import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';

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
  PaymentStatus
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
  PaymentStatus
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
  ATTENDANCE: 'palomar_attendance'
};

export const DEFAULT_SETTINGS: MembershipSettings = {
  gym_name: 'WOLF PALOMAR GYM',
  system_name: 'Wolf Management Console 2.0',
  currency: '₱',
  monthly_plan_price: 800,
  yearly_plan_price: 8000,
  regular_walkin_fee: 100,
  student_walkin_fee: 80,
  monthly_member_checkin_fee: 0,
  yearly_member_checkin_fee: 50,
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
  max_registrations_per_day: 5
};

// Safe Audit Log Helper utilizing central logAudit RPC/function
const writeAudit = async (
  action: string,
  category: ActivityLog['category'],
  user: string,
  affectedId?: string,
  reason?: string,
  details?: string
) => {
  try {
    const formattedDetails = `${category}: ${details || reason || 'No additional details'} (by ${user})`;
    await logAudit(action, formattedDetails, affectedId);
  } catch (err) {
    console.warn('Audit logging bypassed:', err);
  }
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

    return (data || []).map(m => ({
      ...m,
      avatar_url: m.image_url || m.avatar_url || null
    }));
  },

  getById: async (id: string): Promise<Member | null> => {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .or(`id.eq.${id},member_id.eq.${id}`)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Record not found
      console.error('Error fetching member by ID:', error);
      throw new Error(error.message);
    }

    return data ? { ...data, avatar_url: data.image_url || data.avatar_url || null } : null;
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

    return (data || []).map(m => ({
      ...m,
      avatar_url: m.image_url || m.avatar_url || null
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

      // Security Card Defaults
      card_number: d.card_number || null,
      card_type: d.card_type || 'None',
      card_version: d.card_version || 1,
      card_issued_at: d.card_issued_at || null,

      // Minor & Signature Fields
      parent_name: d.parent_name || null,
      parent_relationship: d.parent_relationship || null,
      parent_phone: d.parent_phone || null,
      parent_email: d.parent_email || null,
      applicant_signature: d.applicant_signature || null,
      parent_signature: d.parent_signature || null,
      consent_date: d.consent_date || null
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
      avatar_url: created.image_url || created.avatar_url || null
    };

    await writeAudit('MEMBER_CREATED', 'Members', user, newMember.member_id, undefined, `Registered profile for ${newMember.full_name}`);
    return newMember;
  },

  update: async (id: string, updates: Partial<Member>, user: string): Promise<Member> => {
    const payload: any = { ...updates, updated_at: new Date().toISOString() };
    if ('avatar_url' in updates && !('image_url' in updates)) {
      payload.image_url = updates.avatar_url;
    }
    delete payload.id; // Prevent updating UUID primary key

    const { data: updated, error } = await supabase
      .from('members')
      .update(payload)
      .or(`id.eq.${id},member_id.eq.${id}`)
      .select()
      .single();

    if (error) {
      console.error('Error updating member:', error);
      throw new Error(error.message);
    }

    const memberObj: Member = {
      ...updated,
      avatar_url: updated.image_url || updated.avatar_url || null
    };

    await writeAudit('MEMBER_UPDATED', 'Members', user, memberObj.member_id, undefined, `Updated parameters for ${memberObj.full_name}`);
    return memberObj;
  },

  archive: async (id: string, reason: string, user: string): Promise<void> => {
    const { data: target, error: findError } = await supabase
      .from('members')
      .select('*')
      .or(`id.eq.${id},member_id.eq.${id}`)
      .single();

    if (findError || !target) {
      throw new Error('Member profile not found.');
    }

    const { data: activeSub } = await supabase
      .from('subscriptions')
      .select('id, plan_type')
      .eq('member_id', target.member_id)
      .eq('status', 'Active')
      .maybeSingle();

    if (activeSub) {
      throw new Error(`Archiving rejected: ${target.full_name} has an active subscription contract.`);
    }

    const { error: updateErr } = await supabase
      .from('members')
      .update({
        deleted_at: new Date().toISOString(),
        delete_reason: reason
      })
      .or(`id.eq.${id},member_id.eq.${id}`);

    if (updateErr) {
      console.error('Error archiving member:', updateErr);
      throw new Error(updateErr.message);
    }

    await writeAudit('MEMBER_ARCHIVED', 'Members', user, target.member_id, reason, `Moved ${target.full_name} to Recycle Bin.`);
  },

  restore: async (id: string, user: string): Promise<Member> => {
    const { data: restored, error } = await supabase
      .from('members')
      .update({
        deleted_at: null,
        deleted_by: null,
        delete_reason: null,
        status: 'Active',
        updated_at: new Date().toISOString()
      })
      .or(`id.eq.${id},member_id.eq.${id}`)
      .select()
      .single();

    if (error) {
      console.error('Error restoring member:', error);
      throw new Error(error.message);
    }

    const memberObj: Member = {
      ...restored,
      avatar_url: restored.image_url || restored.avatar_url || null
    };

    await writeAudit('MEMBER_RESTORED', 'Members', user, memberObj.member_id, undefined, `Restored profile for ${memberObj.full_name}`);
    return memberObj;
  }
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

    return (data || []).map(s => ({
      ...s,
      plan_name: s.plan_type === 'yearly' ? 'Yearly Membership' : 'Monthly Membership'
    }));
  },

  getByMemberId: async (memberId: string): Promise<Subscription[]> => {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching subscriptions for member:', error);
      throw new Error(error.message);
    }

    return (data || []).map(s => ({
      ...s,
      plan_name: s.plan_type === 'yearly' ? 'Yearly Membership' : 'Monthly Membership'
    }));
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
    const { data: m, error: mErr } = await supabase
      .from('members')
      .select('*')
      .or(`member_id.eq.${memberId},id.eq.${memberId}`)
      .single();

    if (mErr || !m) throw new Error('Member lookup missing.');
    if (m.status === 'Suspended') throw new Error(`Member is currently ${m.status}.`);

    const { data: existingActive } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('member_id', m.member_id)
      .eq('status', 'Active')
      .maybeSingle();

    if (existingActive) throw new Error('Member currently possesses an active subscription.');

    // Fetch dynamic rate configuration parameters from rates_config
    const activeSettings = await settingsService.load();

    const dbPlanType = planName === 'Yearly Membership' ? 'yearly' : 'monthly';
    const defaultPrice = planName === 'Monthly Membership' ? activeSettings.monthly_plan_price : activeSettings.yearly_plan_price;
    const basePrice = extraDetails?.basePrice ?? defaultPrice;
    const gcashFee = extraDetails?.gcashFee ?? (paymentMethod === 'GCash' ? (activeSettings.gcash_fee || 10) : 0);
    const cardFee = extraDetails?.cardFee ?? 0;
    const gcashRefNo = extraDetails?.gcashRefNo || null;

    const totalAmount = amountPaidOverride ?? (basePrice + gcashFee + cardFee);
    const durationDays = planName === 'Monthly Membership' ? 30 : 365;

    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + durationDays);

    const { data: sub, error: subErr } = await supabase
      .from('subscriptions')
      .insert([{
        member_id: m.member_id,
        plan_type: dbPlanType,
        price: totalAmount,
        base_price: basePrice,
        gcash_fee: gcashFee,
        card_fee: cardFee,
        gcash_ref_no: gcashRefNo,
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        status: 'Active',
        payment_status: 'Paid',
        payment_method: paymentMethod
      }])
      .select()
      .single();

    if (subErr) {
      console.error('Error inserting subscription:', subErr);
      throw new Error(subErr.message);
    }

    const receiptNo = sub.receipt_number;

    await supabase
      .from('members')
      .update({ status: 'Active', updated_at: new Date().toISOString() })
      .eq('member_id', m.member_id);

    await supabase
      .from('receipts')
      .insert([{
        id: receiptNo,
        member_id: m.member_id,
        customer_name: m.full_name,
        customer_type: 'New Membership',
        amount: totalAmount,
        base_price: basePrice,
        gcash_fee: gcashFee,
        card_fee: cardFee,
        gcash_ref_no: gcashRefNo,
        payment_method: paymentMethod,
        payment_status: 'Paid',
        item_description: `Subscribed under ${planName}`
      }]);

    await supabase
      .from('attendance')
      .insert([{
        member_id: m.member_id,
        customer_name: m.full_name,
        customer_type: 'New Membership',
        check_in_time: new Date().toISOString(),
        plan_name: planName,
        entry_fee: totalAmount,
        base_price: basePrice,
        gcash_fee: gcashFee,
        card_fee: cardFee,
        gcash_ref_no: gcashRefNo,
        payment_method: paymentMethod,
        receipt_number: receiptNo,
        staff_name: user
      }]);

    await writeAudit('SUBSCRIPTION_CREATED', 'Subscriptions', user, m.member_id, undefined, `Issued ${planName} Contract.`);

    return {
      ...sub,
      plan_name: planName
    };
  },

  void: async (
    subscriptionId: string,
    reason: string,
    notes: string,
    user: string
  ): Promise<void> => {
    const { data: target, error: findErr } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .single();

    if (findErr || !target) throw new Error('Subscription record not found.');

    const { error: voidErr } = await supabase
      .from('subscriptions')
      .update({
        status: 'Voided',
        voided_at: new Date().toISOString(),
        voided_by: user,
        void_reason: reason,
        void_notes: notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', subscriptionId);

    if (voidErr) {
      console.error('Error voiding subscription:', voidErr);
      throw new Error(voidErr.message);
    }

    if (target.receipt_number) {
      await supabase
        .from('receipts')
        .delete()
        .eq('id', target.receipt_number);

      await supabase
        .from('attendance')
        .delete()
        .eq('receipt_number', target.receipt_number);
    }

    await writeAudit(
      'SUBSCRIPTION_VOIDED',
      'Subscriptions',
      user,
      target.member_id,
      reason,
      `Voided & purged contract (${target.id}) and receipt ${target.receipt_number}. Notes: ${notes || 'None'}.`
    );
  }
};

// ==========================================
// CARD SERVICE
// ==========================================
export const cardService = {
  getAll: async (): Promise<MemberCard[]> => {
    const { data, error } = await supabase
      .from('members')
      .select('id, member_id, card_number, card_type, card_version, card_issued_at, created_at, status')
      .neq('card_type', 'None')
      .is('deleted_at', null);

    if (error) {
      console.error('Error fetching cards:', error);
      throw new Error(error.message);
    }

    return (data || []).map(m => ({
      id: `card-${m.id}`,
      member_id: m.member_id,
      card_number: m.card_number || `CARD-${m.card_type}-${m.member_id}`,
      card_type: m.card_type as 'QR' | 'Manual' | 'None',
      status: m.status === 'Active' ? 'Active' : 'Inactive',
      version: m.card_version || 1,
      issued_at: m.card_issued_at || m.created_at
    }));
  },

  issue: async (memberId: string, type: 'QR' | 'Manual' | 'None', user: string): Promise<MemberCard | null> => {
    if (type === 'None') {
      await supabase
        .from('members')
        .update({
          card_type: 'None',
          card_number: null,
          updated_at: new Date().toISOString()
        })
        .or(`member_id.eq.${memberId},id.eq.${memberId}`);
      return null;
    }

    const isQr = type === 'QR';
    const cardNumber = `${isQr ? 'CARD-QR' : 'CARD-MAN'}-${Math.floor(100000 + Math.random() * 900000)}`;
    const nowIso = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('members')
      .update({
        card_type: type,
        card_number: cardNumber,
        card_version: 1,
        card_issued_at: nowIso,
        updated_at: nowIso
      })
      .or(`member_id.eq.${memberId},id.eq.${memberId}`)
      .select()
      .single();

    if (error) {
      console.error('Error issuing security card:', error);
      throw new Error(error.message);
    }

    await writeAudit('CARD_ISSUED', 'Cards', user, updated.member_id, undefined, `Assigned new ${type} security token.`);

    return {
      id: `card-${updated.id}`,
      member_id: updated.member_id,
      card_number: updated.card_number,
      card_type: updated.card_type as 'QR' | 'Manual' | 'None',
      status: 'Active',
      version: updated.card_version,
      issued_at: updated.card_issued_at
    };
  },

  replace: async (memberId: string, reason: string, user: string): Promise<MemberCard> => {
    const { data: existing, error: getErr } = await supabase
      .from('members')
      .select('*')
      .or(`member_id.eq.${memberId},id.eq.${memberId}`)
      .single();

    if (getErr || !existing) throw new Error('Original card registry entry not found.');

    const currentType = existing.card_type === 'None' ? 'QR' : existing.card_type;
    const isQr = currentType === 'QR';
    const newCardNumber = `${isQr ? 'CARD-QR' : 'CARD-MAN'}-${Math.floor(100000 + Math.random() * 900000)}`;
    const newVersion = (existing.card_version || 1) + 1;
    const nowIso = new Date().toISOString();

    const { data: updated, error: updateErr } = await supabase
      .from('members')
      .update({
        card_type: currentType,
        card_number: newCardNumber,
        card_version: newVersion,
        card_issued_at: nowIso,
        updated_at: nowIso
      })
      .or(`member_id.eq.${memberId},id.eq.${memberId}`)
      .select()
      .single();

    if (updateErr) {
      console.error('Error replacing member card:', updateErr);
      throw new Error(updateErr.message);
    }

    await writeAudit('CARD_REPLACED', 'Cards', user, updated.member_id, reason, `Reissued card version ${newVersion}.`);

    return {
      id: `card-${updated.id}`,
      member_id: updated.member_id,
      card_number: updated.card_number,
      card_type: updated.card_type as 'QR' | 'Manual' | 'None',
      status: 'Active',
      version: updated.card_version,
      issued_at: updated.card_issued_at,
      replaced_at: nowIso,
      replacement_reason: reason
    };
  }
};

// ==========================================
// REGISTRATION SERVICE (ONLINE QUEUE)
// ==========================================
export const registrationService = {
  getQueue: async (): Promise<OnlineRegistration[]> => {
    const { data, error } = await supabase
      .from('online_registrations')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('Error fetching online registrations queue:', error);
      throw new Error(error.message);
    }

    return (data || []).map(r => ({
      ...r,
      preferred_plan: r.preferred_plan === 'yearly' ? 'Yearly Membership' : 'Monthly Membership'
    }));
  },

  submit: async (reg: OnlineRegistration): Promise<OnlineRegistration> => {
    const planStr = (reg.preferred_plan as string) || '';
    const dbPlan = planStr === 'Yearly Membership' || planStr === 'yearly' ? 'yearly' : 'monthly';

    const payload = {
      id: reg.id || `REG-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
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

      // Minor & Signature Fields
      parent_consent_required: reg.parent_consent_required || false,
      parent_name: reg.parent_name || null,
      parent_relationship: reg.parent_relationship || null,
      parent_phone: reg.parent_phone || null,
      parent_email: reg.parent_email || null,
      applicant_signature: reg.applicant_signature || null,
      parent_signature: reg.parent_signature || null,
      consent_date: reg.consent_date || null,
      guardian_consent: reg.guardian_consent ?? null
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
      preferred_plan: inserted.preferred_plan === 'yearly' ? 'Yearly Membership' : 'Monthly Membership'
    };
  },

  reject: async (regId: string, reason: string, user: string): Promise<void> => {
    const { error } = await supabase
      .from('online_registrations')
      .update({
        status: 'Rejected',
        notes: reason
      })
      .eq('id', regId);

    if (error) {
      console.error('Error rejecting registration:', error);
      throw new Error(error.message);
    }

    await writeAudit('PRE_REG_REJECTED', 'Registrations', user, regId, reason, `Denied onboarding parameters.`);
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

    await writeAudit('PRE_REG_APPROVED', 'Registrations', user, regId, undefined, `Approved online registration ticket.`);
  }
};

// ==========================================
// SETTINGS SERVICE (RATES_CONFIG & GYM_PROFILE)
// ==========================================
export const settingsService = {
  load: async (): Promise<MembershipSettings> => {
    try {
      const [ratesRes, profileRes] = await Promise.all([
        supabase.from('rates_config').select('*').eq('id', 1).maybeSingle(),
        supabase.from('gym_profile').select('*').eq('id', 1).maybeSingle()
      ]);

      const rData = ratesRes.data;
      const pData = profileRes.data;

      return {
        ...DEFAULT_SETTINGS,
        gym_name: pData?.gym_name ?? DEFAULT_SETTINGS.gym_name,
        monthly_plan_price: Number(rData?.monthly_rate ?? DEFAULT_SETTINGS.monthly_plan_price),
        yearly_plan_price: Number(rData?.yearly_rate ?? DEFAULT_SETTINGS.yearly_plan_price),
        regular_walkin_fee: Number(rData?.regular_walk_in ?? DEFAULT_SETTINGS.regular_walkin_fee),
        student_walkin_fee: Number(rData?.student_walk_in ?? DEFAULT_SETTINGS.student_walkin_fee),
        monthly_member_checkin_fee: 0,
        yearly_member_checkin_fee: Number(rData?.yearly_walk_in ?? DEFAULT_SETTINGS.yearly_member_checkin_fee),
        card_printing_fee: Number(rData?.new_card_fee ?? DEFAULT_SETTINGS.card_printing_fee),
        card_replacement_fee: Number(rData?.new_card_fee ?? DEFAULT_SETTINGS.card_replacement_fee),
        gcash_fee: Number(rData?.gcash_fee ?? DEFAULT_SETTINGS.gcash_fee)
      };
    } catch (e) {
      console.warn('Unable to load rates_config from Supabase, returning DEFAULT_SETTINGS:', e);
    }
    return DEFAULT_SETTINGS;
  },

  save: async (data: MembershipSettings, user: string): Promise<void> => {
    try {
      await supabase.from('rates_config').upsert([{
        id: 1,
        monthly_rate: data.monthly_plan_price,
        yearly_rate: data.yearly_plan_price,
        regular_walk_in: data.regular_walkin_fee,
        student_walk_in: data.student_walkin_fee,
        yearly_walk_in: data.yearly_member_checkin_fee,
        new_card_fee: data.card_printing_fee,
        gcash_fee: data.gcash_fee,
        updated_at: new Date().toISOString()
      }]);
    } catch (e) {
      console.warn('Failed to persist settings to Supabase:', e);
    }

    await writeAudit('SETTINGS_SAVED', 'Settings', user, undefined, undefined, 'Saved configuration options.');
  }
};
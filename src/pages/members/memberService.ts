// src/pages/members/memberService.ts
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
import { assertActiveCashSession } from '../../hooks/useSessionLock';
import { getServerNow, getServerTime, getServerISOString } from '../../lib/serverTime';
import { getEffectiveRates, DEFAULT_RATES_CONFIG } from '../../lib/ratesService';
import {
  stagePendingTransaction,
  getCachedMembersFromIndexedDB,
  setCachedMembersToIndexedDB,
  getDecryptedPendingTransactions,
} from '../../lib/offlineVault';

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
  max_registrations_per_day: 5,
};

/**
 * Synchronously retrieves initial membership settings from secured browser storage
 * or cached settings, guaranteeing immediate render without 0-peso flash.
 */
export const getSynchronousInitialSettings = (): MembershipSettings => {
  let settings: MembershipSettings = { ...DEFAULT_SETTINGS };

  try {
    const raw =
      (typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem('palomar_rates_config_secured_v1')
        : null) ||
      (typeof localStorage !== 'undefined'
        ? localStorage.getItem('palomar_rates_config_secured_v1')
        : null);
    if (raw) {
      const record = JSON.parse(raw);
      if (record?.data) {
        const decoded = decodeURIComponent(atob(record.data));
        const parsed = JSON.parse(decoded);
        if (parsed) {
          settings.monthly_plan_price = Number(
            parsed.monthly_rate ??
              parsed.monthly_membership ??
              settings.monthly_plan_price
          );
          settings.yearly_plan_price = Number(
            parsed.yearly_rate ?? settings.yearly_plan_price
          );
          settings.regular_walkin_fee = Number(
            parsed.regular_walk_in ?? settings.regular_walkin_fee
          );
          settings.student_walkin_fee = Number(
            parsed.student_walk_in ?? settings.student_walkin_fee
          );
          settings.yearly_member_checkin_fee = Number(
            parsed.yearly_walk_in ?? settings.yearly_member_checkin_fee
          );
          settings.card_printing_fee = Number(
            parsed.new_card_fee ?? settings.card_printing_fee
          );
          settings.card_replacement_fee = Number(
            parsed.new_card_fee ?? settings.card_replacement_fee
          );
          settings.gcash_fee = Number(parsed.gcash_fee ?? settings.gcash_fee);
        }
      }
    }
  } catch {}

  try {
    const memCacheRaw =
      (typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem('members_sanitized_cache')
        : null) ||
      (typeof localStorage !== 'undefined'
        ? localStorage.getItem('members_sanitized_cache')
        : null);
    if (memCacheRaw) {
      const memCache = JSON.parse(memCacheRaw);
      if (memCache?.settings) {
        settings = { ...settings, ...memCache.settings };
      }
    }
  } catch {}

  return settings;
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

  const now = getServerTime();
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
    const cacheKey = 'members_sanitized_cache';
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    const readCachedMembers = (): Member[] => {
      try {
        const cached =
          localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) return parsed;
          if (parsed && Array.isArray(parsed.members)) return parsed.members;
        }
      } catch {}
      return [];
    };

    // Check IndexedDB cache first
    try {
      const idbList = await getCachedMembersFromIndexedDB();
      if (Array.isArray(idbList) && idbList.length > 0) {
        if (isOffline) return idbList;
      }
    } catch {}

    if (isOffline) {
      return readCachedMembers();
    }

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Members query timeout')), 1500)
      );
      const queryPromise = supabase
        .from('members')
        .select(
          'id, member_id, full_name, phone, email, gender, birthday, address, image_url, emergency_contact_name, relationship, emergency_contact_phone, status, notes, created_at, updated_at'
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      const { data, error } = (await Promise.race([queryPromise, timeoutPromise])) as any;

      if (error) throw error;

      const mapped = (data || []).map((m: any) => ({
        ...m,
        avatar_url: m.image_url || m.avatar_url || null,
      }));

      // Update storage and IndexedDB
      try {
        await setCachedMembersToIndexedDB(mapped);
        const cachedRaw =
          localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
        const parsed = cachedRaw ? JSON.parse(cachedRaw) : {};
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsed.members = mapped;
          const serialized = JSON.stringify(parsed);
          localStorage.setItem(cacheKey, serialized);
          sessionStorage.setItem(cacheKey, serialized);
        } else {
          const serialized = JSON.stringify({ members: mapped });
          localStorage.setItem(cacheKey, serialized);
          sessionStorage.setItem(cacheKey, serialized);
        }
      } catch {}

      return mapped;
    } catch (error: any) {
      try {
        const idbList = await getCachedMembersFromIndexedDB();
        if (Array.isArray(idbList) && idbList.length > 0) {
          return idbList;
        }
      } catch {}

      const cachedList = readCachedMembers();
      if (cachedList.length > 0) {
        return cachedList;
      }
      console.warn('Could not fetch members from Supabase, no cache available:', error?.message);
      return [];
    }
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
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const payload = {
      full_name: (d.full_name || '').trim().toUpperCase(),
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

    let createdMember: Member | null = null;

    if (!isOffline) {
      try {
        const { data: created, error } = await supabase
          .from('members')
          .insert([payload])
          .select()
          .single();

        if (error) throw error;
        createdMember = {
          ...created,
          avatar_url: created.image_url || created.avatar_url || null,
        };
      } catch (e) {
        console.warn('Network error creating member in Supabase, using offline vault:', e);
      }
    }

    if (!createdMember) {
      const offlineId = `MEM-OFFLINE-${Date.now().toString().slice(-6)}`;
      const offlineUUID = `off-mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      createdMember = {
        id: offlineUUID,
        member_id: offlineId,
        ...payload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        avatar_url: payload.image_url || null,
        sync_status: 'pending',
      } as any;

      try {
        await stagePendingTransaction({
          type: 'member_create',
          userId: user || 'offline_staff',
          userName: user || 'Staff Personnel',
          payload: { ...payload, member_id: offlineId },
        });
      } catch (stgErr) {
        console.warn('Failed to stage member in vault:', stgErr);
      }
    }

    const finalMember: Member = createdMember!;

    // Persist immediately to local caches
    try {
      const cacheKey = 'members_sanitized_cache';
      const cachedRaw =
        localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
      let parsed = cachedRaw ? JSON.parse(cachedRaw) : { members: [] };
      if (Array.isArray(parsed)) {
        parsed = { members: parsed };
      }
      if (!Array.isArray(parsed.members)) parsed.members = [];
      parsed.members.unshift(finalMember);
      const str = JSON.stringify(parsed);
      localStorage.setItem(cacheKey, str);
      sessionStorage.setItem(cacheKey, str);
    } catch {}

    writeAudit(
      'MEMBER_CREATED',
      'Members',
      user,
      finalMember.member_id,
      undefined,
      `Registered profile for ${finalMember.full_name}`
    ).catch(() => {});

    return finalMember;
  },

  update: async (
    id: string,
    updates: Partial<Member>,
    user: string
  ): Promise<Member> => {
    if (!id) throw new Error('Member ID is required for update.');

    let previousData: any = null;
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (!isOffline) {
      try {
        let findQuery = supabase.from('members').select('*');
        if (isUUID(id)) {
          findQuery = findQuery.eq('id', id);
        } else {
          findQuery = findQuery.eq('member_id', id);
        }
        const { data } = await findQuery.maybeSingle();
        previousData = data;
      } catch {}
    }

    if (!previousData) {
      try {
        const cacheKey = 'members_sanitized_cache';
        const cachedRaw =
          localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          const list = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.members)
              ? parsed.members
              : [];
          previousData = list.find(
            (m: any) => m.id === id || m.member_id === id
          );
        }
      } catch {}
    }

    const payload: any = { ...updates, updated_at: new Date().toISOString() };

    if (payload.full_name) {
      payload.full_name = String(payload.full_name).trim().toUpperCase();
    }

    if ('avatar_url' in payload) {
      if (!payload.image_url && payload.avatar_url) {
        payload.image_url = payload.avatar_url;
      }
      delete payload.avatar_url;
    }
    delete payload.id;

    let memberObj: Member | null = null;

    if (!isOffline) {
      try {
        let query = supabase.from('members').update(payload);
        if (isUUID(id)) {
          query = query.eq('id', id);
        } else {
          query = query.eq('member_id', id);
        }

        const { data: updated, error } = await query.select().single();
        if (error) throw error;
        memberObj = {
          ...updated,
          avatar_url: updated.image_url || null,
        };
      } catch (netErr) {
        console.warn('Network error updating member, staging offline:', netErr);
      }
    }

    if (!memberObj) {
      memberObj = {
        ...(previousData || {}),
        ...payload,
        id,
        member_id: previousData?.member_id || id,
        sync_status: 'pending',
      } as Member;

      try {
        await stagePendingTransaction({
          type: 'member_update',
          userId: user || 'offline_staff',
          userName: user || 'Staff Personnel',
          payload: { id, updates: payload },
        });
      } catch (stgErr) {
        console.warn('Failed to stage member update in vault:', stgErr);
      }
    }

    // Update in local cache
    try {
      const cacheKey = 'members_sanitized_cache';
      const cachedRaw =
        localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        const updateInList = (list: Member[]) =>
          list.map((m) =>
            m.id === id || m.member_id === id ? { ...m, ...memberObj } : m
          );

        if (Array.isArray(parsed)) {
          const updated = updateInList(parsed);
          localStorage.setItem(cacheKey, JSON.stringify(updated));
          sessionStorage.setItem(cacheKey, JSON.stringify(updated));
        } else if (parsed && Array.isArray(parsed.members)) {
          parsed.members = updateInList(parsed.members);
          localStorage.setItem(cacheKey, JSON.stringify(parsed));
          sessionStorage.setItem(cacheKey, JSON.stringify(parsed));
        }
      }
    } catch {}

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

    writeAudit(
      'MEMBER_UPDATED',
      'Members',
      user,
      memberObj.member_id,
      undefined,
      auditDetail
    ).catch(() => {});

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
    const cacheKey = 'members_sanitized_cache';
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    const readCachedSubs = (): Subscription[] => {
      try {
        const cached =
          localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) return parsed;
          if (parsed && Array.isArray(parsed.subscriptions)) {
            return parsed.subscriptions;
          }
        }
      } catch {}
      return [];
    };

    let baseList: Subscription[] = [];

    if (isOffline) {
      baseList = readCachedSubs();
    } else {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Subscriptions query timeout')), 1500)
        );
        const queryPromise = supabase
          .from('subscriptions')
          .select('*')
          .order('created_at', { ascending: false });

        const { data, error } = (await Promise.race([
          queryPromise,
          timeoutPromise,
        ])) as any;

        if (error) throw error;

        baseList = (data || []).map((s: any) => {
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
      } catch (error: any) {
        baseList = readCachedSubs();
        console.warn('Could not fetch subscriptions from Supabase, used cache:', error?.message);
      }
    }

    // Merge offline pending subscriptions from encrypted vault
    try {
      const pendingTxs = await getDecryptedPendingTransactions().catch(() => []);
      const pendingSubs: Subscription[] = pendingTxs
        .filter(
          (tx) =>
            tx.type === 'subscription' &&
            tx.status !== 'conflict' &&
            tx.payload?.member_id
        )
        .map((tx) => {
          const pl = tx.payload || {};
          const planName =
            pl.plan_name ||
            (pl.plan_type === 'yearly'
              ? 'Yearly Membership'
              : 'Monthly Membership');
          const effStatus = getEffectiveSubscriptionStatus(
            pl.status || 'Active',
            pl.start_date,
            pl.end_date
          );

          return {
            id: tx.id,
            member_id: pl.member_id,
            plan_type:
              pl.plan_type ||
              (planName === 'Yearly Membership' ? 'yearly' : 'monthly'),
            price: Number(pl.price || pl.amount || 0),
            base_price: Number(pl.base_price || 0),
            gcash_fee: Number(pl.gcash_fee || 0),
            card_fee: Number(pl.card_fee || 0),
            start_date: pl.start_date || tx.createdAt,
            end_date: pl.end_date,
            status: effStatus,
            payment_status: 'Paid',
            payment_method: pl.payment_method || 'Cash',
            receipt_number: pl.receipt_number || null,
            plan_name: planName,
            created_at: tx.createdAt,
            updated_at: tx.createdAt,
            sync_status: 'pending',
          } as Subscription;
        });

      if (pendingSubs.length > 0) {
        const pendingMemberIds = new Set(pendingSubs.map((s) => s.member_id));
        const filteredBase = baseList.filter(
          (s) => !pendingMemberIds.has(s.member_id)
        );
        baseList = [...pendingSubs, ...filteredBase];
      }
    } catch (vaultErr) {
      console.warn('Error reading pending subscriptions from vault:', vaultErr);
    }

    // Update storage
    try {
      const cachedRaw =
        localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
      const parsed = cachedRaw ? JSON.parse(cachedRaw) : {};
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsed.subscriptions = baseList;
        const serialized = JSON.stringify(parsed);
        localStorage.setItem(cacheKey, serialized);
        sessionStorage.setItem(cacheKey, serialized);
      } else {
        const serialized = JSON.stringify({ subscriptions: baseList });
        localStorage.setItem(cacheKey, serialized);
        sessionStorage.setItem(cacheKey, serialized);
      }
    } catch {}

    return baseList;
  },

  getByMemberId: async (memberId: string): Promise<Subscription[]> => {
    if (!memberId) return [];

    const list: Subscription[] = [];

    // 1. Check pending subscriptions in offline vault
    try {
      const pendingTxs = await getDecryptedPendingTransactions().catch(() => []);
      const pendingForMember = pendingTxs
        .filter(
          (tx) =>
            tx.type === 'subscription' &&
            tx.status !== 'conflict' &&
            (tx.payload?.member_id === memberId ||
              (tx.payload?.member_id &&
                String(tx.payload.member_id).toLowerCase() ===
                  String(memberId).toLowerCase()))
        )
        .map((tx) => {
          const pl = tx.payload || {};
          const planName =
            pl.plan_name ||
            (pl.plan_type === 'yearly'
              ? 'Yearly Membership'
              : 'Monthly Membership');
          const effStatus = getEffectiveSubscriptionStatus(
            pl.status || 'Active',
            pl.start_date,
            pl.end_date
          );

          return {
            id: tx.id,
            member_id: pl.member_id,
            plan_type:
              pl.plan_type ||
              (planName === 'Yearly Membership' ? 'yearly' : 'monthly'),
            price: Number(pl.price || pl.amount || 0),
            base_price: Number(pl.base_price || 0),
            gcash_fee: Number(pl.gcash_fee || 0),
            card_fee: Number(pl.card_fee || 0),
            start_date: pl.start_date || tx.createdAt,
            end_date: pl.end_date,
            status: effStatus,
            payment_status: 'Paid',
            payment_method: pl.payment_method || 'Cash',
            receipt_number: pl.receipt_number || null,
            plan_name: planName,
            created_at: tx.createdAt,
            updated_at: tx.createdAt,
            sync_status: 'pending',
          } as Subscription;
        });

      list.push(...pendingForMember);
    } catch {}

    // 2. Fetch remote / cache
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (!isOffline) {
      try {
        const { data, error } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('member_id', memberId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          const mapped = data.map((s) => {
            const effStatus = getEffectiveSubscriptionStatus(
              s.status,
              s.start_date,
              s.end_date
            );
            return {
              ...s,
              status: effStatus,
              plan_name:
                s.plan_type === 'yearly'
                  ? 'Yearly Membership'
                  : 'Monthly Membership',
            };
          });

          const pendingIds = new Set(list.map((s) => s.id));
          for (const m of mapped) {
            if (!pendingIds.has(m.id)) {
              list.push(m);
            }
          }
          return list;
        }
      } catch (netErr) {
        console.warn('Network error in getByMemberId, falling back to cache:', netErr);
      }
    }

    // 3. Fallback to cache
    try {
      const cacheKey = 'members_sanitized_cache';
      const cachedRaw =
        localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        const allSubs = Array.isArray(parsed?.subscriptions)
          ? parsed.subscriptions
          : [];
        const cachedForMember = allSubs.filter(
          (s: any) =>
            s.member_id === memberId ||
            (s.member_id &&
              String(s.member_id).toLowerCase() ===
                String(memberId).toLowerCase())
        );
        const existingIds = new Set(list.map((s) => s.id));
        for (const cs of cachedForMember) {
          if (!existingIds.has(cs.id)) {
            list.push(cs);
          }
        }
      }
    } catch {}

    return list;
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
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (isOffline) {
      throw new Error(
        'Subscriptions cannot be created or renewed while offline. An active internet connection is required.'
      );
    }

    await assertActiveCashSession('create or renew subscriptions').catch(() => {});

    if (!memberId) {
      throw new Error('Member ID is missing or invalid.');
    }

    let m: any = null;
    if (!isOffline) {
      try {
        let mQuery = supabase.from('members').select('*');
        if (isUUID(memberId)) {
          mQuery = mQuery.eq('id', memberId);
        } else {
          mQuery = mQuery.eq('member_id', memberId);
        }
        const { data } = await mQuery.maybeSingle();
        m = data;
      } catch {}
    }

    if (!m) {
      try {
        const idb = await getCachedMembersFromIndexedDB();
        if (Array.isArray(idb) && idb.length > 0) {
          m = idb.find(
            (item: any) =>
              item.id === memberId ||
              item.member_id === memberId ||
              (item.member_id && String(item.member_id).toLowerCase() === String(memberId).toLowerCase())
          );
        }
      } catch {}
    }

    if (!m) {
      try {
        const cacheKey = 'members_sanitized_cache';
        const cachedRaw =
          localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          const list = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.members)
              ? parsed.members
              : [];
          m = list.find(
            (item: any) =>
              item.id === memberId ||
              item.member_id === memberId ||
              (item.member_id && String(item.member_id).toLowerCase() === String(memberId).toLowerCase())
          );
        }
      } catch {}
    }

    if (!m) {
      m = {
        id: memberId,
        member_id: memberId,
        full_name: 'Member',
        status: 'Active',
      };
    }

    if (m.status === 'Suspended') {
      throw new Error(`Member ${m.full_name} is currently suspended.`);
    }

    // Check for any currently ACTIVE subscription that has not expired yet
    let memberSubs: any[] = [];
    if (!isOffline) {
      try {
        const { data } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('member_id', m.member_id)
          .neq('status', 'Voided')
          .order('end_date', { ascending: false });
        if (data) memberSubs = data;
      } catch {}
    }

    if (memberSubs.length === 0) {
      try {
        const cachedRaw =
          localStorage.getItem('members_sanitized_cache') ||
          sessionStorage.getItem('members_sanitized_cache');
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          const allSubs = Array.isArray(parsed?.subscriptions)
            ? parsed.subscriptions
            : [];
          memberSubs = allSubs.filter(
            (s: any) => s.member_id === m.member_id && s.status !== 'Voided'
          );
        }
      } catch {}
    }

    const now = getServerNow();
    const activeSub = (memberSubs || []).find((s) => {
      const endMs = new Date(s.end_date).getTime();
      return s.status === 'Active' && endMs > now.getTime();
    });

    let activeSettings: any = null;
    try {
      activeSettings = await settingsService.load();
    } catch {
      try {
        const rates = await getEffectiveRates();
        activeSettings = {
          monthly_plan_price: Number(rates.monthly_rate ?? 800),
          yearly_plan_price: Number(rates.yearly_rate ?? 8000),
          gcash_fee: Number(rates.gcash_fee ?? 10),
          card_printing_fee: Number(rates.new_card_fee ?? 150),
        };
      } catch {
        activeSettings = {
          monthly_plan_price: 800,
          yearly_plan_price: 8000,
          gcash_fee: 10,
          card_printing_fee: 150,
        };
      }
    }

    const dbPlanType = planName === 'Yearly Membership' ? 'yearly' : 'monthly';
    const defaultPrice =
      planName === 'Monthly Membership'
        ? activeSettings?.monthly_plan_price || 800
        : activeSettings?.yearly_plan_price || 8000;
    const basePrice = extraDetails?.basePrice ?? defaultPrice;
    const gcashFee =
      extraDetails?.gcashFee ??
      (paymentMethod === 'GCash' ? activeSettings?.gcash_fee || 10 : 0);
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
      start = getServerNow();
      initialStatus = 'Active';
    }

    const end = new Date(start.getTime());
    end.setDate(end.getDate() + durationDays);

    const receiptNo = `REC-${Date.now().toString().slice(-8)}`;
    const offlineSubId = `sub_off_${Date.now()}`;

    const isRenewal = Boolean(activeSub);
    const customerType = isRenewal ? 'Existing Member' : 'New Membership';
    const itemDescription = isRenewal
      ? `Renewal ${planName} (Starts ${start.toLocaleDateString()})`
      : `Subscribed ${planName}`;

    const subPayload = {
      member_id: m.member_id,
      plan_type: dbPlanType,
      price: totalAmount,
      amount: totalAmount,
      customer_name: m.full_name || 'Member',
      customer_type: customerType,
      item_description: itemDescription,
      plan_name: planName,
      base_price: basePrice,
      gcash_fee: gcashFee,
      card_fee: cardFee,
      gcash_ref_no: gcashRefNo,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      status: initialStatus,
      payment_status: 'Paid' as PaymentStatus,
      payment_method: paymentMethod,
    };

    // Insert new subscription record
    let finalSub: any = null;
    if (!isOffline) {
      try {
        const { data: insertedSub, error: subErr } = await supabase
          .from('subscriptions')
          .insert([
            {
              member_id: subPayload.member_id,
              plan_type: subPayload.plan_type,
              price: subPayload.price,
              base_price: subPayload.base_price,
              gcash_fee: subPayload.gcash_fee,
              card_fee: subPayload.card_fee,
              gcash_ref_no: subPayload.gcash_ref_no,
              start_date: subPayload.start_date,
              end_date: subPayload.end_date,
              status: subPayload.status,
              payment_status: subPayload.payment_status,
              payment_method: subPayload.payment_method,
              receipt_number: receiptNo,
            },
          ])
          .select()
          .single();

        if (subErr) throw subErr;
        finalSub = insertedSub;
      } catch (netErr: any) {
        console.warn('Network error inserting subscription, staging offline:', netErr);
      }
    }

    if (!finalSub) {
      finalSub = {
        id: offlineSubId,
        receipt_number: receiptNo,
        ...subPayload,
        sync_status: 'pending',
      };

      try {
        await stagePendingTransaction({
          type: 'subscription',
          userId: user || 'offline_staff',
          userName: user || 'Staff Personnel',
          payload: {
            ...subPayload,
            amount: totalAmount,
            receipt_number: receiptNo,
          },
        });
      } catch (stgErr) {
        console.warn('Failed to stage subscription in vault:', stgErr);
      }
    }

    const insertedSub = finalSub;
    if (!insertedSub.receipt_number) {
      insertedSub.receipt_number = receiptNo;
      if (!isOffline) {
        try {
          await supabase
            .from('subscriptions')
            .update({ receipt_number: receiptNo })
            .eq('id', insertedSub.id);
        } catch {}
      }
    }

    if (!isOffline) {
      try {
        await supabase
          .from('members')
          .update({ status: 'Active', updated_at: new Date().toISOString() })
          .eq('member_id', m.member_id);
      } catch (memErr) {
        console.warn('Member status update notice:', memErr);
      }

      const receiptPayload = {
        id: receiptNo,
        member_id: m.member_id,
        customer_name: m.full_name,
        customer_type: customerType,
        amount: totalAmount,
        base_price: basePrice,
        gcash_fee: gcashFee,
        card_fee: cardFee,
        gcash_ref_no: gcashRefNo,
        payment_method: paymentMethod,
        payment_status: 'Paid',
        item_description: itemDescription,
      };

      try {
        const { error: rcptErr } = await supabase.from('receipts').insert([receiptPayload]);
        if (rcptErr) {
          console.warn('Initial receipt insert failed, trying New Membership enum fallback:', rcptErr.message);
          await supabase.from('receipts').insert([
            {
              ...receiptPayload,
              customer_type: 'New Membership',
            },
          ]);
        }
      } catch (rcptCatchErr) {
        console.error('Failed to insert receipt for subscription:', rcptCatchErr);
      }
    }

    // Persist to local cache
    try {
      const cacheKey = 'members_sanitized_cache';
      const cachedRaw =
        localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        if (parsed && typeof parsed === 'object') {
          if (!Array.isArray(parsed.subscriptions)) parsed.subscriptions = [];
          parsed.subscriptions.unshift({
            ...insertedSub,
            plan_name: planName,
          });
          localStorage.setItem(cacheKey, JSON.stringify(parsed));
          sessionStorage.setItem(cacheKey, JSON.stringify(parsed));
        }
      }
    } catch {}

    writeAudit(
      'SUBSCRIPTION_CREATED',
      'Subscriptions',
      user,
      m.member_id,
      undefined,
      activeSub
        ? `Scheduled ${planName} Renewal starting ${start.toLocaleDateString()}.`
        : `Issued ${planName} Contract.`
    ).catch(() => {});

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

    const cleanReceiptNo = target.receipt_number ? String(target.receipt_number).replace(/^rcpt-/, '') : null;
    const nowIso = new Date().toISOString();

    if (cleanReceiptNo) {
      await supabase
        .from('receipts')
        .update({
          payment_status: 'Voided',
        })
        .or(`id.eq.${cleanReceiptNo},id.eq.rcpt-${cleanReceiptNo}`);

      await supabase
        .from('receipts')
        .delete()
        .or(`id.eq.${cleanReceiptNo},id.eq.rcpt-${cleanReceiptNo}`);

      await supabase
        .from('attendance')
        .update({
          deleted_at: nowIso,
          deleted_by: user,
          updated_at: nowIso,
        })
        .or(`receipt_number.eq.${cleanReceiptNo},receipt_number.eq.rcpt-${cleanReceiptNo}`);

      await supabase
        .from('attendance')
        .delete()
        .or(`receipt_number.eq.${cleanReceiptNo},receipt_number.eq.rcpt-${cleanReceiptNo}`);
    }

    // 2. Check and void member card if it was part of this subscription
    const hasCardFeeInSub = Number(target.card_fee || 0) > 0;
    const { data: memberCard } = await supabase
      .from('cards')
      .select('*')
      .eq('member_id', target.member_id)
      .maybeSingle();

    const isCardPartOfSubscription = Boolean(
      memberCard &&
        ((target.receipt_number &&
          memberCard.receipt_number === target.receipt_number) ||
          (hasCardFeeInSub &&
            (!memberCard.receipt_number ||
              memberCard.receipt_number === target.receipt_number)))
    );

    if (isCardPartOfSubscription && memberCard) {
      const { error: cardDeleteErr } = await supabase
        .from('cards')
        .delete()
        .eq('member_id', target.member_id);

      if (cardDeleteErr) {
        console.error(
          'Error deleting member card on subscription void:',
          cardDeleteErr.message
        );
      } else {
        await writeAudit(
          'CARD_VOIDED',
          'Cards',
          user,
          target.member_id,
          reason,
          `Voided physical member card (${memberCard.card_number}) included in subscription receipt ${target.receipt_number || 'N/A'}.`
        );
      }
    }

    // 3. Mark subscription as Voided
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

    // 4. Reconcile member active status: if no active/queued contracts remain, mark Expired
    if (target.member_id) {
      try {
        const nowMs = Date.now();
        const { data: remainingSubs } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('member_id', target.member_id)
          .neq('id', subscriptionId)
          .neq('status', 'Voided')
          .order('end_date', { ascending: false });

        const activeSub = (remainingSubs || []).find((s: any) => {
          const startMs = new Date(s.start_date).getTime();
          const endMs = new Date(s.end_date).getTime();
          return startMs <= nowMs && endMs >= nowMs;
        });

        const queuedSub = (remainingSubs || []).find((s: any) => {
          const startMs = new Date(s.start_date).getTime();
          return startMs > nowMs;
        });

        let updatedStatus = 'Expired';
        let updatedExpiry: string | null = null;

        if (activeSub) {
          updatedStatus = 'Active';
          updatedExpiry = activeSub.end_date;
        } else if (queuedSub) {
          updatedStatus = 'Active';
          updatedExpiry = queuedSub.end_date;
        } else if (remainingSubs && remainingSubs.length > 0) {
          updatedStatus = 'Expired';
          updatedExpiry = remainingSubs[0].end_date;
        }

        await supabase
          .from('members')
          .update({
            status: updatedStatus,
            membership_status: updatedStatus.toLowerCase(),
            expiry_date: updatedExpiry,
            updated_at: new Date().toISOString(),
          })
          .or(`member_id.eq.${target.member_id},id.eq.${target.member_id}`);
      } catch (reconErr) {
        console.warn('Member status reconciliation note on void:', reconErr);
      }
    }

    try {
      sessionStorage.removeItem('members_sanitized_cache');
      localStorage.removeItem('members_sanitized_cache');
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith('logbook_sanitized_')) sessionStorage.removeItem(k);
      });
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('logbook_sanitized_')) localStorage.removeItem(k);
      });
    } catch {}

    const auditDetail = `Voided subscription contract (${target.id}) and purged receipt ${target.receipt_number || 'N/A'}${
      isCardPartOfSubscription && memberCard
        ? ` (including member card ${memberCard.card_number})`
        : ''
    }. Notes: ${notes || 'None'}.`;

    await writeAudit(
      'SUBSCRIPTION_VOIDED',
      'Subscriptions',
      user,
      target.member_id,
      reason,
      auditDetail
    );

    window.dispatchEvent(new Event('palomar_logbook_updated'));
    window.dispatchEvent(new Event('palomar:cash-session-updated'));
    window.dispatchEvent(new Event('member-refresh'));
  },

  drop: async (
    subscriptionId: string,
    reason: string = 'SuperAdmin Immediate Termination',
    user: string = 'SuperAdmin'
  ): Promise<void> => {
    const { data: target } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .maybeSingle();

    if (!target) return;

    // Purge linked receipts and attendance
    if (target.receipt_number) {
      await supabase
        .from('receipts')
        .delete()
        .or(`id.eq.${target.receipt_number},id.eq.rcpt-${target.receipt_number}`);

      await supabase
        .from('attendance')
        .delete()
        .eq('receipt_number', target.receipt_number);
    }

    // Delete or cancel the subscription record
    const { error: delErr } = await supabase
      .from('subscriptions')
      .delete()
      .eq('id', subscriptionId);

    if (delErr) {
      await supabase
        .from('subscriptions')
        .update({
          status: 'Voided',
          payment_status: 'Cancelled',
          voided_at: new Date().toISOString(),
          voided_by: user,
          void_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscriptionId);
    }

    // Reconcile member status
    if (target.member_id) {
      try {
        const nowMs = Date.now();
        const { data: remainingSubs } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('member_id', target.member_id)
          .neq('id', subscriptionId)
          .neq('status', 'Voided')
          .order('end_date', { ascending: false });

        const activeSub = (remainingSubs || []).find((s: any) => {
          const startMs = new Date(s.start_date).getTime();
          const endMs = new Date(s.end_date).getTime();
          return startMs <= nowMs && endMs >= nowMs;
        });

        const newStatus = activeSub ? 'Active' : 'Expired';
        const newExpiry = activeSub ? activeSub.end_date : (remainingSubs?.[0]?.end_date || null);

        await supabase
          .from('members')
          .update({
            status: newStatus,
            membership_status: newStatus.toLowerCase(),
            expiry_date: newExpiry,
            updated_at: new Date().toISOString(),
          })
          .or(`member_id.eq.${target.member_id},id.eq.${target.member_id}`);
      } catch (err) {
        console.warn('Member status reconcile error in drop:', err);
      }
    }

    try {
      sessionStorage.removeItem('members_sanitized_cache');
      localStorage.removeItem('members_sanitized_cache');
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith('logbook_sanitized_')) sessionStorage.removeItem(k);
      });
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('logbook_sanitized_')) localStorage.removeItem(k);
      });
    } catch {}

    await writeAudit(
      'SUPERADMIN_SUBSCRIPTION_DROPPED',
      'Subscriptions',
      user,
      target.member_id,
      reason,
      `SuperAdmin immediately dropped subscription ${subscriptionId} and purged orphan records.`
    );

    window.dispatchEvent(new Event('palomar_logbook_updated'));
    window.dispatchEvent(new Event('palomar:cash-session-updated'));
    window.dispatchEvent(new Event('member-refresh'));
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

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    let rpcSuccess = false;
    let rpcData: any = null;

    if (!isOffline) {
      try {
        const { data, error } = await supabase.rpc('batch_purchase_member_cards', {
          p_member_ids: memberIds,
          p_payment_method: paymentMethod,
          p_card_fee: feePerCard,
          p_gcash_ref_no: gcashRefNo || null,
          p_staff_name: user,
        });

        if (error) throw error;
        rpcData = data;
        rpcSuccess = true;
      } catch (err: any) {
        console.warn('Batch card purchase network call failed, falling back to offline vault:', err?.message);
      }
    }

    const batchReceiptNo =
      (rpcData as any)?.receipt_number ||
      (rpcData as any)?.receipt_id ||
      `BATCH-CARD-${Date.now().toString().slice(-8)}`;

    if (!rpcSuccess) {
      try {
        await stagePendingTransaction({
          type: 'batch_card_purchase',
          userId: user || 'offline_staff',
          userName: user || 'Staff Personnel',
          payload: {
            member_ids: memberIds,
            payment_method: paymentMethod,
            fee_per_card: feePerCard,
            total_amount: feePerCard * memberIds.length,
            gcash_ref_no: gcashRefNo || null,
            staff_name: user,
            receipt_number: batchReceiptNo,
            created_at: new Date().toISOString(),
          },
        });
      } catch (stgErr) {
        console.warn('Could not stage batch card purchase in vault:', stgErr);
      }
    } else {
      try {
        const recentWindow = new Date(Date.now() - 30000).toISOString();
        const { data: attRows } = await supabase
          .from('attendance')
          .select('id, member_id, check_in_time')
          .in('member_id', memberIds)
          .is('deleted_at', null)
          .gte('check_in_time', recentWindow)
          .order('id', { ascending: true });

        if (attRows && attRows.length > 1) {
          const duplicateIds = attRows.slice(1).map((r) => r.id);
          await supabase
            .from('attendance')
            .update({
              deleted_at: new Date().toISOString(),
              deleted_by: user,
            })
            .in('id', duplicateIds);
        }
      } catch (cleanupErr) {
        console.warn('Batch attendance deduplication notice:', cleanupErr);
      }

      if (batchReceiptNo) {
        try {
          await supabase
            .from('cards')
            .update({ receipt_number: batchReceiptNo })
            .in('member_id', memberIds)
            .eq('status', 'Active');
        } catch {}

        try {
          const recentWindow = new Date(Date.now() - 60000).toISOString();
          await supabase
            .from('attendance')
            .update({ receipt_number: batchReceiptNo })
            .in('member_id', memberIds)
            .is('deleted_at', null)
            .gte('check_in_time', recentWindow);
        } catch {}
      }
    }

    // Always update local card cache to immediately reflect paid cards
    try {
      const cacheKey = 'palomar_cards_cache_v1';
      const cached = localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          const updated = parsed.map((c: any) =>
            memberIds.includes(c.member_id)
              ? {
                  ...c,
                  payment_status: 'PAID',
                  claim_status: 'UNCLAIMED',
                  card_fee_paid: feePerCard,
                  receipt_number: batchReceiptNo,
                  sync_status: rpcSuccess ? 'synced' : 'pending',
                }
              : c
          );
          localStorage.setItem(cacheKey, JSON.stringify(updated));
          sessionStorage.setItem(cacheKey, JSON.stringify(updated));
        }
      }
    } catch {}

    writeAudit(
      'CARDS_BATCH_PURCHASED',
      'Cards',
      user,
      undefined,
      undefined,
      `Batch purchased physical cards for ${memberIds.length} members (₱${feePerCard * memberIds.length} via ${paymentMethod}).`
    ).catch(() => {});

    window.dispatchEvent(new Event('palomar_logbook_updated'));

    return { success: true, count: memberIds.length };
  },

  getAll: async (): Promise<MemberCard[]> => {
    const cacheKey = 'palomar_cards_cache_v1';
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    let baseList: MemberCard[] = [];

    const readCachedCards = (): MemberCard[] => {
      try {
        const cached =
          localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            return parsed.map((c: any) => ({
              id: c.id,
              member_id: c.member_id,
              card_number: c.card_number,
              card_type: c.card_type as 'QR' | 'Manual' | 'None',
              status: (new Date(c.expires_at).getTime() < getServerTime()
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
          }
        }
      } catch {}
      return [];
    };

    if (isOffline) {
      baseList = readCachedCards();
    } else {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Cards query timeout')), 1500)
        );
        const queryPromise = supabase
          .from('cards')
          .select('*')
          .order('issued_at', { ascending: false });

        const { data, error } = (await Promise.race([
          queryPromise,
          timeoutPromise,
        ])) as any;

        if (!error && data) {
          try {
            const serialized = JSON.stringify(data);
            localStorage.setItem(cacheKey, serialized);
            sessionStorage.setItem(cacheKey, serialized);
          } catch {}

          baseList = data.map((c: any) => ({
            id: c.id,
            member_id: c.member_id,
            card_number: c.card_number,
            card_type: c.card_type as 'QR' | 'Manual' | 'None',
            status: (new Date(c.expires_at).getTime() < getServerTime()
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
        }
      } catch {
        baseList = readCachedCards();
      }
    }

    // Overlay pending card purchases from offline vault
    try {
      const pendingTxs = await getDecryptedPendingTransactions().catch(() => []);
      for (const tx of pendingTxs) {
        if (tx.status === 'conflict') continue;
        if (tx.type === 'card_purchase') {
          const mId = tx.payload?.member_id;
          if (mId) {
            const idx = baseList.findIndex((c) => c.member_id === mId);
            if (idx >= 0) {
              baseList[idx] = {
                ...baseList[idx],
                payment_status: 'PAID',
                claim_status: 'UNCLAIMED',
                card_fee_paid: Number(tx.payload?.amount || tx.payload?.card_fee || baseList[idx].card_fee_paid || 0),
                receipt_number: tx.payload?.receipt_number || baseList[idx].receipt_number,
              };
            } else {
              baseList.unshift({
                id: tx.id,
                member_id: mId,
                card_number: tx.payload?.card_number || generateCardTokenUuid(),
                card_type: 'QR',
                status: 'Active',
                version: 1,
                payment_status: 'PAID',
                claim_status: 'UNCLAIMED',
                card_fee_paid: Number(tx.payload?.amount || tx.payload?.card_fee || 0),
                receipt_number: tx.payload?.receipt_number || null,
                issued_at: tx.createdAt,
                expires_at: new Date(Date.now() + 3 * 365 * 86400000).toISOString(),
                created_at: tx.createdAt,
                updated_at: tx.createdAt,
              });
            }
          }
        } else if (tx.type === 'batch_card_purchase') {
          const mIds: string[] = tx.payload?.member_ids || [];
          for (const mId of mIds) {
            const idx = baseList.findIndex((c) => c.member_id === mId);
            if (idx >= 0) {
              baseList[idx] = {
                ...baseList[idx],
                payment_status: 'PAID',
                claim_status: 'UNCLAIMED',
                card_fee_paid: Number(tx.payload?.fee_per_card || baseList[idx].card_fee_paid || 0),
                receipt_number: tx.payload?.receipt_number || baseList[idx].receipt_number,
              };
            } else {
              baseList.unshift({
                id: `batch_card_${tx.id}_${mId}`,
                member_id: mId,
                card_number: generateCardTokenUuid(),
                card_type: 'QR',
                status: 'Active',
                version: 1,
                payment_status: 'PAID',
                claim_status: 'UNCLAIMED',
                card_fee_paid: Number(tx.payload?.fee_per_card || 0),
                receipt_number: tx.payload?.receipt_number || null,
                issued_at: tx.createdAt,
                expires_at: new Date(Date.now() + 3 * 365 * 86400000).toISOString(),
                created_at: tx.createdAt,
                updated_at: tx.createdAt,
              });
            }
          }
        }
      }
    } catch {}

    return baseList;
  },

  getByMemberId: async (memberId: string): Promise<MemberCard | null> => {
    if (!memberId) return null;

    // 1. Check pending transactions in offline vault first
    try {
      const pendingTxs = await getDecryptedPendingTransactions().catch(() => []);
      for (const tx of pendingTxs) {
        if (tx.status === 'conflict') continue;
        if (
          tx.type === 'card_purchase' &&
          (tx.payload?.member_id === memberId ||
            (tx.payload?.member_id &&
              String(tx.payload.member_id).toLowerCase() ===
                String(memberId).toLowerCase()))
        ) {
          return {
            id: tx.id,
            member_id: memberId,
            card_number: tx.payload?.card_number || generateCardTokenUuid(),
            card_type: 'QR',
            status: 'Active',
            version: 1,
            payment_status: 'PAID',
            claim_status: 'UNCLAIMED',
            card_fee_paid: Number(tx.payload?.amount || tx.payload?.card_fee || 0),
            claimed_at: null,
            claimed_by: null,
            receipt_number: tx.payload?.receipt_number || null,
            issued_at: tx.createdAt,
            expires_at: new Date(Date.now() + 3 * 365 * 86400000).toISOString(),
            created_at: tx.createdAt,
            updated_at: tx.createdAt,
          };
        } else if (
          tx.type === 'batch_card_purchase' &&
          Array.isArray(tx.payload?.member_ids) &&
          tx.payload.member_ids.some(
            (id: string) =>
              id === memberId || String(id).toLowerCase() === String(memberId).toLowerCase()
          )
        ) {
          return {
            id: `batch_card_${tx.id}_${memberId}`,
            member_id: memberId,
            card_number: generateCardTokenUuid(),
            card_type: 'QR',
            status: 'Active',
            version: 1,
            payment_status: 'PAID',
            claim_status: 'UNCLAIMED',
            card_fee_paid: Number(tx.payload?.fee_per_card || 0),
            claimed_at: null,
            claimed_by: null,
            receipt_number: tx.payload?.receipt_number || null,
            issued_at: tx.createdAt,
            expires_at: new Date(Date.now() + 3 * 365 * 86400000).toISOString(),
            created_at: tx.createdAt,
            updated_at: tx.createdAt,
          };
        }
      }
    } catch {}

    try {
      const { data, error } = await supabase
        .from('cards')
        .select('*')
        .eq('member_id', memberId)
        .maybeSingle();

      if (!error && data) {
        const isExpired = new Date(data.expires_at).getTime() < getServerTime();
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
      }
    } catch {}

    // Fallback to local cards cache
    try {
      const cacheKey = 'palomar_cards_cache_v1';
      const cached = localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          const found = parsed.find(
            (c: any) =>
              c.member_id === memberId ||
              (c.member_id && String(c.member_id).toLowerCase() === String(memberId).toLowerCase())
          );
          if (found) return found;
        }
      }
    } catch {}

    return null;
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
      try {
        await supabase.from('cards').delete().eq('member_id', memberId);
      } catch {}
      return null;
    }

    const now = getServerNow();
    const nowIso = getServerISOString();

    let expiresIso = customExpireIso;
    if (!expiresIso) {
      const expDate = new Date(now);
      expDate.setFullYear(expDate.getFullYear() + 3);
      expiresIso = expDate.toISOString();
    }

    const cardNumber = forcedCardNumber || generateCardTokenUuid();

    const cardPayload = {
      member_id: memberId,
      card_number: cardNumber,
      card_type: type,
      status: 'Active' as CardStatus,
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
    };

    let cardRow: any = null;
    try {
      const { data, error: cardErr } = await supabase
        .from('cards')
        .upsert(cardPayload, { onConflict: 'member_id' })
        .select()
        .single();

      if (cardErr) throw cardErr;
      cardRow = data;
    } catch (netErr: any) {
      console.warn('Network error issuing card, staging offline in vault:', netErr?.message);
      cardRow = {
        id: `card_off_${Date.now()}`,
        ...cardPayload,
        created_at: nowIso,
        sync_status: 'pending',
      };

      try {
        await stagePendingTransaction({
          type: 'card_purchase',
          userId: user || 'offline_staff',
          userName: user || 'Staff Personnel',
          payload: cardPayload,
        });
      } catch (stgErr) {
        console.warn('Could not stage card purchase in vault:', stgErr);
      }
    }

    // Update local card cache
    try {
      const cacheKey = 'palomar_cards_cache_v1';
      const cached = localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
      const list = cached ? JSON.parse(cached) : [];
      if (Array.isArray(list)) {
        const filtered = list.filter((c: any) => c.member_id !== memberId);
        filtered.unshift(cardRow);
        localStorage.setItem(cacheKey, JSON.stringify(filtered));
        sessionStorage.setItem(cacheKey, JSON.stringify(filtered));
      }
    } catch {}

    writeAudit(
      'CARD_ISSUED',
      'Cards',
      user,
      memberId,
      undefined,
      `Assigned ${type} security token (${cardNumber}). Payment: ${paymentStatus}, Claim: ${claimStatus}.`
    ).catch(() => {});

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

    const now = getServerNow();
    const nowIso = getServerISOString();

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
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (!isOffline) {
      await assertActiveCashSession('process membership card payments').catch(() => {});
    }

    if (!memberId) throw new Error('Member ID is required.');

    // 1. Fetch member details with offline fallback
    let member: any = null;
    if (!isOffline) {
      try {
        const { data, error: mErr } = await supabase
          .from('members')
          .select('*')
          .eq('member_id', memberId)
          .maybeSingle();
        if (!mErr && data) member = data;
      } catch {}
    }

    if (!member) {
      try {
        const idb = await getCachedMembersFromIndexedDB();
        if (Array.isArray(idb) && idb.length > 0) {
          member = idb.find(
            (m: any) =>
              m.member_id === memberId ||
              m.id === memberId ||
              (m.member_id && String(m.member_id).toLowerCase() === String(memberId).toLowerCase())
          );
        }
      } catch {}
    }

    if (!member) {
      try {
        const cacheKey = 'members_sanitized_cache';
        const cachedRaw = localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          const list = Array.isArray(parsed) ? parsed : (parsed?.members || []);
          member = list.find(
            (m: any) =>
              m.member_id === memberId ||
              m.id === memberId ||
              (m.member_id && String(m.member_id).toLowerCase() === String(memberId).toLowerCase())
          );
        }
      } catch {}
    }

    if (!member) {
      member = {
        id: memberId,
        member_id: memberId,
        full_name: 'Member',
        status: 'Active',
      };
    }

    const finalReceiptNo =
      receiptNo || `REC-CARD-${Date.now().toString().slice(-6)}`;
    const nowIso = new Date().toISOString();
    let rpcSuccess = false;
    let cardRow: any = null;

    if (!isOffline) {
      try {
        // 2. Insert receipt
        await supabase.from('receipts').insert([
          {
            id: finalReceiptNo,
            member_id: memberId,
            customer_name: member.full_name,
            customer_type: 'Physical Card',
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

        // 3. Upsert card record
        const existing = await cardService.getByMemberId(memberId);
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
          const expDate = getServerNow();
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
        rpcSuccess = true;
      } catch (netErr: any) {
        console.warn('Network error processing card payment, staging in offline vault:', netErr?.message);
      }
    }

    if (!rpcSuccess || !cardRow) {
      const expDate = getServerNow();
      expDate.setFullYear(expDate.getFullYear() + 3);
      const expIso = expDate.toISOString();
      const cardNumber = generateCardTokenUuid();

      cardRow = {
        id: `card_off_${Date.now()}`,
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
        created_at: nowIso,
        updated_at: nowIso,
        sync_status: 'pending',
      };

      try {
        await stagePendingTransaction({
          type: 'card_purchase',
          userId: user || 'offline_staff',
          userName: user || 'Staff Personnel',
          payload: {
            member_id: memberId,
            customer_name: member.full_name,
            customer_type: 'Physical Card',
            amount: amount,
            base_price: 0,
            gcash_fee: 0,
            card_fee: amount,
            gcash_ref_no: gcashRefNo || null,
            payment_method: paymentMethod,
            payment_status: 'Paid',
            item_description: 'Physical Membership Card Fee',
            receipt_number: finalReceiptNo,
            card_number: cardNumber,
            created_at: nowIso,
          },
        });
      } catch (stgErr) {
        console.warn('Failed to stage card purchase in vault:', stgErr);
      }
    }

    // Update local card cache
    try {
      const cacheKey = 'palomar_cards_cache_v1';
      const cached = localStorage.getItem(cacheKey) || sessionStorage.getItem(cacheKey);
      const list = cached ? JSON.parse(cached) : [];
      if (Array.isArray(list)) {
        const filtered = list.filter((c: any) => c.member_id !== memberId);
        filtered.unshift(cardRow);
        localStorage.setItem(cacheKey, JSON.stringify(filtered));
        sessionStorage.setItem(cacheKey, JSON.stringify(filtered));
      }
    } catch {}

    try {
      const memCacheKey = 'members_sanitized_cache';
      const memCached = localStorage.getItem(memCacheKey) || sessionStorage.getItem(memCacheKey);
      if (memCached) {
        const parsed = JSON.parse(memCached);
        if (parsed && Array.isArray(parsed.cards)) {
          parsed.cards = parsed.cards.filter((c: any) => c.member_id !== memberId);
          parsed.cards.unshift(cardRow);
          localStorage.setItem(memCacheKey, JSON.stringify(parsed));
          sessionStorage.setItem(memCacheKey, JSON.stringify(parsed));
        }
      }
    } catch {}

    writeAudit(
      'CARD_PAID',
      'Cards',
      user,
      memberId,
      undefined,
      `Paid physical card fee of ₱${amount.toFixed(2)} (${paymentMethod}). Receipt: ${finalReceiptNo}. Card ready for pickup.`
    ).catch(() => {});

    window.dispatchEvent(new Event('palomar_logbook_updated'));
    window.dispatchEvent(new Event('member-refresh'));

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

    const { error } = await supabase
      .from('online_registrations')
      .insert([payload]);

    if (error) {
      console.error('Error submitting online registration:', error);
      throw new Error(error.message);
    }

    return {
      ...(payload as any),
      preferred_plan:
        payload.preferred_plan === 'yearly'
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
        deleted_by: user,
        delete_reason: reason,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', regId);

    if (error) {
      console.error('Error rejecting registration:', error);
      throw new Error(error.message);
    }
  },

  approve: async (regId: string, user: string): Promise<void> => {
    const { error } = await supabase
      .from('online_registrations')
      .update({
        status: 'Approved',
        deleted_by: user,
      })
      .eq('id', regId);

    if (error) {
      console.error('Error approving registration:', error);
      throw new Error(error.message);
    }
  },
};

// ==========================================
// SETTINGS SERVICE (RATES_CONFIG & GYM_PROFILE)
// ==========================================
export const settingsService = {
  load: async (): Promise<MembershipSettings> => {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (isOffline) {
      return getSynchronousInitialSettings();
    }

    let rData: any = null;
    try {
      rData = await getEffectiveRates();
    } catch {
      rData = DEFAULT_RATES_CONFIG;
    }

    let pData: any = null;
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gym profile timeout')), 1500)
      );
      const queryPromise = supabase
        .from('gym_profile')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      const { data } = (await Promise.race([
        queryPromise,
        timeoutPromise,
      ])) as any;
      pData = data;
    } catch {
      try {
        const saved = localStorage.getItem('palomar_gym_profile');
        if (saved) pData = JSON.parse(saved);
      } catch {}
    }

    return {
      ...DEFAULT_SETTINGS,
      gym_name: pData?.gym_name ?? DEFAULT_SETTINGS.gym_name,
      monthly_plan_price: Number(
        rData.monthly_rate ??
          rData.monthly_membership ??
          DEFAULT_RATES_CONFIG.monthly_rate
      ),
      yearly_plan_price: Number(
        rData.yearly_rate ?? DEFAULT_RATES_CONFIG.yearly_rate
      ),
      regular_walkin_fee: Number(
        rData.regular_walk_in ?? DEFAULT_RATES_CONFIG.regular_walk_in
      ),
      student_walkin_fee: Number(
        rData.student_walk_in ?? DEFAULT_RATES_CONFIG.student_walk_in
      ),
      yearly_member_checkin_fee: Number(
        rData.yearly_walk_in ?? DEFAULT_RATES_CONFIG.yearly_walk_in
      ),
      card_printing_fee: Number(
        rData.new_card_fee ?? DEFAULT_RATES_CONFIG.new_card_fee
      ),
      card_replacement_fee: Number(
        rData.new_card_fee ?? DEFAULT_RATES_CONFIG.new_card_fee
      ),
      gcash_fee: Number(rData.gcash_fee ?? DEFAULT_RATES_CONFIG.gcash_fee),
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
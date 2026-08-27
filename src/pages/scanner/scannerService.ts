// src/pages/scanner/scannerService.ts
import { supabase } from '../../lib/supabase/client';
import { memberService, subscriptionService, cardService } from '../members/memberService';
import type { Member, Subscription, OnlineRegistration } from '../../types/members';

export interface HybridMemberResult {
  id: string;
  memberId: string;
  fullName: string;
  phone: string;
  email?: string;
  avatarUrl?: string | null;
  status: 'Active' | 'Expires Soon' | 'Expired' | 'Suspended';
  membershipPlan: string;
  startDate: string;
  expDate: string;
  remainingDays: number;
  alreadyCheckedInToday: boolean;
  todayCheckInTime?: string;
}

export interface HybridProductResult {
  id: string;
  barcodeId: string;
  manufacturerBarcode?: string | null;
  productName: string;
  sellingPrice: number;
  stockQuantity: number;
  hasStockLimit: boolean;
  status: 'Active' | 'Inactive';
  isHidden?: boolean;
  imageUrl?: string | null;
}

export interface HybridScanResult {
  type: 'member' | 'product' | 'registration' | 'unknown';
  rawCode: string;
  member?: HybridMemberResult;
  product?: HybridProductResult;
  registration?: OnlineRegistration;
}

export const generateUniqueWalkInName = (baseName: string, existingLogs: any[]) => {
  const cleanBase = baseName.replace(/\s*\(\d+\)$/, '').trim().toUpperCase();

  const matchingWalkIns = existingLogs.filter((log: any) => {
    if (log.customer_type !== 'Walk-In') return false;
    const name = (log.customer_name || '').toUpperCase().trim();
    const logCleanBase = name.replace(/\s*\(\d+\)$/, '').trim();
    return logCleanBase === cleanBase;
  });

  if (matchingWalkIns.length === 0) {
    return cleanBase;
  }

  const nextNumber = matchingWalkIns.length + 1;
  return `${cleanBase} (${nextNumber})`;
};

export const parseScannedMemberCode = (rawCode: string): { fullCode: string; memberIdPart: string } => {
  let fullCode = (rawCode || '').trim();

  // 1. Unwrap JSON payload if present
  if (fullCode.startsWith('{') && fullCode.endsWith('}')) {
    try {
      const parsed = JSON.parse(fullCode);
      fullCode = 
        parsed.token ||
        parsed.security_token ||
        parsed.securityToken ||
        parsed.cardNumber ||
        parsed.card_number ||
        parsed.registrationId ||
        parsed.memberId ||
        parsed.member_id ||
        parsed.id ||
        parsed.barcode ||
        parsed.code ||
        fullCode;
    } catch (e) {
      // raw string
    }
  }

  // 2. Unwrap URL if present (e.g. https://.../members/MEM-000015 or ?id=MEM-000015)
  if (fullCode.startsWith('http://') || fullCode.startsWith('https://')) {
    try {
      const url = new URL(fullCode);
      const queryId = url.searchParams.get('id') || url.searchParams.get('memberId') || url.searchParams.get('token');
      if (queryId) {
        fullCode = queryId;
      } else {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length > 0) {
          fullCode = segments[segments.length - 1];
        }
      }
    } catch (_) {}
  }

  let memberIdPart = fullCode.trim();

  // 3. Extract actual ID when prefixed (e.g., "MEMBER:MEM-000015" -> "MEM-000015")
  if (fullCode.toUpperCase().startsWith('MFG:')) {
    memberIdPart = fullCode.substring(4).trim();
  } else if (fullCode.toUpperCase().startsWith('MFG-')) {
    memberIdPart = fullCode.substring(4).trim();
  } else if (fullCode.toUpperCase().startsWith('MEMBER:')) {
    memberIdPart = fullCode.substring(7).trim();
  } else if (fullCode.toUpperCase().startsWith('CARD:')) {
    memberIdPart = fullCode.substring(5).trim();
  } else if (fullCode.toUpperCase().startsWith('TOKEN:')) {
    memberIdPart = fullCode.substring(6).trim();
  } else if (fullCode.toUpperCase().startsWith('REG:')) {
    memberIdPart = fullCode.substring(4).trim();
  } else if (fullCode.includes(':')) {
    const parts = fullCode.split(':');
    // Grab the value on the right of the colon, NOT the prefix
    memberIdPart = parts[parts.length - 1].trim();
  }

  return { fullCode, memberIdPart };
};

export const scannerService = {
  async processHybridScan(rawCode: string): Promise<HybridScanResult> {
    const { fullCode, memberIdPart } = parseScannedMemberCode(rawCode);
    if (!fullCode && !memberIdPart) return { type: 'unknown', rawCode };

    const searchIdUpper = memberIdPart.toUpperCase();
    const fullCodeUpper = fullCode.toUpperCase();

    // 1. LOOKUP ONLINE LOBBY PRE-REGISTRATION TICKET (REG-XXXXXXXXX)
    try {
      if (searchIdUpper.startsWith('REG-') || fullCodeUpper.startsWith('REG-')) {
        const { data: regData } = await supabase
          .from('online_registrations')
          .select('*')
          .is('deleted_at', null)
          .or(`id.ilike.${searchIdUpper},id.ilike.${fullCodeUpper}`)
          .maybeSingle();

        if (regData) {
          return {
            type: 'registration',
            rawCode,
            registration: regData
          };
        }
      }
    } catch (e) {
      console.warn('Online registration lookup warning:', e);
    }

    // 2. LOOKUP MEMBER, CARDS, & SUBSCRIPTIONS
    try {
      const [allCards, allMembers, allSubscriptions] = await Promise.all([
        cardService.getAll(),
        memberService.getAll(),
        subscriptionService.getAll(),
      ]);

      // Match card by card_number, token, security_token, qr_code, or id
      const cardMatch = (allCards || []).find((c: any) => {
        const cNum = (c.card_number || '').toLowerCase();
        const cTok = (c.security_token || c.token || c.card_token || c.qr_code || c.id || '').toLowerCase();
        const fc = fullCode.toLowerCase();
        const mid = memberIdPart.toLowerCase();

        return (
          (cNum && (cNum === fc || cNum === mid)) ||
          (cTok && (cTok === fc || cTok === mid))
        );
      });

      const targetMemberId = cardMatch ? cardMatch.member_id : memberIdPart;

      const member = (allMembers || []).find((m: Member) => {
        const mId = (m.member_id || '').toLowerCase();
        const mDbId = (m.id || '').toLowerCase();
        const mPhone = (m.phone || '').trim();
        const mName = (m.full_name || '').toLowerCase();
        const tId = targetMemberId.toLowerCase();
        const fc = fullCode.toLowerCase();
        const mid = memberIdPart.toLowerCase();

        return (
          mId === tId ||
          mId === fc ||
          mId === mid ||
          mDbId === fc ||
          mDbId === mid ||
          (mPhone && (mPhone === fullCode || mPhone === memberIdPart)) ||
          (mName && (mName === fc || mName === mid))
        );
      });

      if (member) {
        const activeSub = (allSubscriptions || []).find(
          (s: Subscription) => s.member_id === member.member_id && s.status === 'Active'
        );

        const now = new Date();
        let calculatedStatus: HybridMemberResult['status'] = 'Expired';
        let planName = 'No Active Plan';
        let startDateStr = 'N/A';
        let expDateStr = 'N/A';
        let remainingDays = 0;

        if (member.status === 'Suspended') {
          calculatedStatus = 'Suspended';
        } else if (activeSub) {
          planName = activeSub.plan_name || 'Active Membership';
          startDateStr = new Date(activeSub.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          expDateStr = new Date(activeSub.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

          const endDate = new Date(activeSub.end_date);
          remainingDays = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

          if (remainingDays <= 0) {
            calculatedStatus = 'Expired';
          } else if (remainingDays <= 7) {
            calculatedStatus = 'Expires Soon';
          } else {
            calculatedStatus = 'Active';
          }
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const { data: todayAtt } = await supabase
          .from('attendance')
          .select('check_in_time')
          .is('deleted_at', null)
          .eq('member_id', member.member_id)
          .gte('check_in_time', `${todayStr}T00:00:00Z`)
          .order('check_in_time', { ascending: false })
          .limit(1);

        const alreadyCheckedInToday = Boolean(todayAtt && todayAtt.length > 0);

        return {
          type: 'member',
          rawCode,
          member: {
            id: member.id,
            memberId: member.member_id,
            fullName: member.full_name,
            phone: member.phone || '',
            email: member.email || '',
            avatarUrl: member.avatar_url || null,
            status: calculatedStatus,
            membershipPlan: planName,
            startDate: startDateStr,
            expDate: expDateStr,
            remainingDays,
            alreadyCheckedInToday,
            todayCheckInTime: todayAtt?.[0]?.check_in_time
          }
        };
      }
    } catch (e) {
      console.warn('Member hybrid lookup warning:', e);
    }

    // 3. FALLBACK: CHECK REGISTRATION WITHOUT "REG-" PREFIX
    try {
      const { data: fallbackReg } = await supabase
        .from('online_registrations')
        .select('*')
        .is('deleted_at', null)
        .or(`id.ilike.${searchIdUpper},id.ilike.${fullCodeUpper}`)
        .maybeSingle();

      if (fallbackReg) {
        return {
          type: 'registration',
          rawCode,
          registration: fallbackReg
        };
      }
    } catch (e) {
      // ignore
    }

    // 4. LOOKUP PRODUCT (PR-XXXX OR MANUFACTURER / OPEN FOOD FACTS BARCODE)
    try {
      const codeRaw = fullCode.trim();
      let cleanMfg = codeRaw;
      if (cleanMfg.toUpperCase().startsWith('MFG:')) {
        cleanMfg = cleanMfg.substring(4).trim();
      } else if (cleanMfg.toUpperCase().startsWith('MFG-')) {
        cleanMfg = cleanMfg.substring(4).trim();
      } else if (cleanMfg.toUpperCase().startsWith('MFG')) {
        cleanMfg = cleanMfg.substring(3).trim();
      }

      const idPart = memberIdPart.trim();

      const { data: product } = await supabase
        .from('products')
        .select('*')
        .is('deleted_at', null)
        .or(`barcode_id.ilike.${codeRaw},manufacturer_barcode.ilike.${codeRaw},barcode_id.ilike.${cleanMfg},manufacturer_barcode.ilike.${cleanMfg},barcode_id.ilike.${idPart},manufacturer_barcode.ilike.${idPart}`)
        .maybeSingle();

      if (product) {
        const isHidden = product.status === 'Inactive' || Boolean(product.is_hidden);
        return {
          type: 'product',
          rawCode,
          product: {
            id: product.id,
            barcodeId: product.barcode_id,
            manufacturerBarcode: product.manufacturer_barcode || null,
            productName: product.product_name,
            sellingPrice: Number(product.selling_price || 0),
            stockQuantity: Number(product.stock_quantity ?? 0),
            hasStockLimit: Boolean(product.has_stock_limit),
            status: product.status || (isHidden ? 'Inactive' : 'Active'),
            isHidden,
            imageUrl: product.image_url || null
          }
        };
      }
    } catch (e) {
      console.warn('Product hybrid lookup warning:', e);
    }

    // 5. UNKNOWN CODE
    return {
      type: 'unknown',
      rawCode
    };
  },

  async recordMemberAttendance(
    member: { 
      memberId: string; 
      fullName: string; 
      membershipPlan: string; 
      entryFee?: number;
      basePrice?: number;
      gcashFee?: number;
      paymentMethod?: 'Cash' | 'GCash';
      gcashRefNo?: string | null;
    }, 
    staffEmail?: string
  ) {
    const isYearly = member.membershipPlan.toLowerCase().includes('year');
    const basePrice = member.basePrice ?? (member.entryFee ?? (isYearly ? 50 : 0));
    const gcashFee = member.gcashFee ?? 0;
    const totalEntryFee = member.entryFee ?? (basePrice + gcashFee);
    const paymentMethod = member.paymentMethod || 'Cash';
    const gcashRefNo = member.gcashRefNo || null;

    const { data, error } = await supabase
      .from('attendance')
      .insert([{
        member_id: member.memberId,
        customer_name: member.fullName.toUpperCase(),
        customer_type: 'Existing Member',
        check_in_time: new Date().toISOString(),
        plan_name: member.membershipPlan,
        entry_fee: totalEntryFee,
        base_price: basePrice,
        gcash_fee: gcashFee,
        card_fee: 0,
        gcash_ref_no: gcashRefNo,
        payment_method: paymentMethod,
        staff_name: staffEmail || 'Scanner Station'
      }])
      .select()
      .single();

    if (error) {
      console.error('Database Attendance Insert Error:', error);
      throw new Error(error.message);
    }
    return data;
  }
};
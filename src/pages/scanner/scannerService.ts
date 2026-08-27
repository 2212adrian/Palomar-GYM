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
  status: 'Active' | 'Expires Soon' | 'Expired' | 'Suspended' | 'Scheduled' | 'Voided';
  membershipPlan: string;
  startDate: string;
  expDate: string;
  remainingDays: number;
  alreadyCheckedInToday: boolean;
  todayCheckInTime?: string;
  receiptNumber?: string | null;
  receiptType?: 'subscription' | 'walk_in' | 'sale';
  receiptValidityNote?: string;
  isSpecificReceiptScan?: boolean;
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
        parsed.receipt_no ||
        parsed.receiptNumber ||
        parsed.receipt_number ||
        parsed.receiptId ||
        parsed.rec ||
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

  // 2. Unwrap URL if present (e.g. https://.../?rec=REC-10000000025)
  if (fullCode.startsWith('http://') || fullCode.startsWith('https://')) {
    try {
      const url = new URL(fullCode);
      const queryId = 
        url.searchParams.get('rec') || 
        url.searchParams.get('receipt') || 
        url.searchParams.get('receipt_no') || 
        url.searchParams.get('id') || 
        url.searchParams.get('memberId') || 
        url.searchParams.get('token');

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

  // 3. Extract actual ID when prefixed
  if (fullCode.toUpperCase().startsWith('REC:')) {
    memberIdPart = fullCode.substring(4).trim();
  } else if (fullCode.toUpperCase().startsWith('RECEIPT:')) {
    memberIdPart = fullCode.substring(8).trim();
  } else if (fullCode.toUpperCase().startsWith('MFG:')) {
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

    // =========================================================================
    // 1. STRICT RECEIPT VALIDATION (REC-XXXXXXXXXX)
    // =========================================================================
    if (
      searchIdUpper.startsWith('REC-') || 
      fullCodeUpper.startsWith('REC-') || 
      searchIdUpper.startsWith('REC') || 
      fullCodeUpper.startsWith('REC')
    ) {
      const targetRec = searchIdUpper.startsWith('REC') ? searchIdUpper : fullCodeUpper;
      try {
        // A. Search the SPECIFIC subscription generated for this receipt
        const { data: subData } = await supabase
          .from('subscriptions')
          .select('*, members(*)')
          .or(`receipt_number.ilike.${targetRec},id.ilike.${targetRec}`)
          .maybeSingle();

        if (subData && subData.members) {
          const member = subData.members;
          const now = new Date();
          const startDate = new Date(subData.start_date);
          const endDate = new Date(subData.end_date);

          let calculatedStatus: HybridMemberResult['status'] = 'Active';
          let validityNote = 'Valid subscription receipt.';

          if (subData.status === 'Voided' || subData.voided_at) {
            calculatedStatus = 'Voided';
            validityNote = 'This subscription receipt has been VOIDED.';
          } else if (member.status === 'Suspended') {
            calculatedStatus = 'Suspended';
            validityNote = 'Member account is currently SUSPENDED.';
          } else if (now < startDate) {
            // Future / Scheduled Plan (e.g. Starts next month)
            calculatedStatus = 'Scheduled';
            const daysUntilStart = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            validityNote = `Future Scheduled Plan: Starts on ${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (in ${daysUntilStart} days).`;
          } else if (now > endDate || subData.status === 'Expired') {
            // Expired Plan attached to this specific receipt
            calculatedStatus = 'Expired';
            validityNote = `This receipt EXPIRED on ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. It cannot be reused.`;
          } else {
            // Currently Active validity window
            const remainingDays = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
            if (remainingDays <= 7) {
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

          const remainingDays = (calculatedStatus === 'Active' || calculatedStatus === 'Expires Soon')
            ? Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
            : 0;

          const planName = subData.plan_name 
            || (subData.plan_type ? `${subData.plan_type.toUpperCase()} MEMBERSHIP` : 'Active Membership');

          return {
            type: 'member',
            rawCode,
            member: {
              id: member.id,
              memberId: member.member_id,
              fullName: member.full_name,
              phone: member.phone || '',
              email: member.email || '',
              avatarUrl: member.avatar_url || (member as any).image_url || null,
              status: calculatedStatus,
              membershipPlan: planName,
              startDate: startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
              expDate: endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
              remainingDays,
              alreadyCheckedInToday: Boolean(todayAtt && todayAtt.length > 0),
              todayCheckInTime: todayAtt?.[0]?.check_in_time,
              receiptNumber: subData.receipt_number || targetRec,
              receiptType: 'subscription',
              receiptValidityNote: validityNote,
              isSpecificReceiptScan: true
            }
          };
        }

        // B. Search Invoices / Receipts table (e.g. Walk-in daily receipts)
        const { data: receiptData } = await supabase
          .from('receipts')
          .select('*, members(*)')
          .eq('id', targetRec)
          .maybeSingle();

        if (receiptData && receiptData.members) {
          const member = receiptData.members;
          const createdAt = new Date(receiptData.created_at);
          const todayStr = new Date().toISOString().split('T')[0];
          const receiptDateStr = createdAt.toISOString().split('T')[0];
          const isToday = todayStr === receiptDateStr;

          return {
            type: 'member',
            rawCode,
            member: {
              id: member.id,
              memberId: member.member_id,
              fullName: member.full_name,
              phone: member.phone || '',
              email: member.email || '',
              avatarUrl: member.avatar_url || (member as any).image_url || null,
              status: isToday ? 'Active' : 'Expired',
              membershipPlan: receiptData.item_description || 'Receipt Entry',
              startDate: createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
              expDate: createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
              remainingDays: isToday ? 1 : 0,
              alreadyCheckedInToday: false,
              receiptNumber: receiptData.id,
              receiptType: 'walk_in',
              receiptValidityNote: isToday 
                ? 'Daily pass issued today.' 
                : `Single walk-in pass EXPIRED (Issued on ${receiptDateStr}).`,
              isSpecificReceiptScan: true
            }
          };
        }
      } catch (e) {
        console.warn('Receipt lookup warning:', e);
      }
    }

    // =========================================================================
    // 2. LOOKUP ONLINE LOBBY PRE-REGISTRATION TICKET (REG-XXXXXXXXX)
    // =========================================================================
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

    // =========================================================================
    // 3. LOOKUP MEMBER CARDS & MEMBER PROFILES (Direct Member ID / QR Card)
    // =========================================================================
    try {
      const [allCards, allMembers, allSubscriptions] = await Promise.all([
        cardService.getAll(),
        memberService.getAll(),
        subscriptionService.getAll(),
      ]);

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
          planName = activeSub.plan_name || (activeSub as any).plan_type ? `${(activeSub as any).plan_type.toUpperCase()} MEMBERSHIP` : 'Active Membership';
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
            avatarUrl: member.avatar_url || (member as any).image_url || null,
            status: calculatedStatus,
            membershipPlan: planName,
            startDate: startDateStr,
            expDate: expDateStr,
            remainingDays,
            alreadyCheckedInToday,
            todayCheckInTime: todayAtt?.[0]?.check_in_time,
            receiptNumber: activeSub?.receipt_number || null,
            isSpecificReceiptScan: false
          }
        };
      }
    } catch (e) {
      console.warn('Member hybrid lookup warning:', e);
    }

    // =========================================================================
    // 4. FALLBACK REGISTRATION
    // =========================================================================
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

    // =========================================================================
    // 5. LOOKUP PRODUCT (PR-XXXX OR MFG BARCODE)
    // =========================================================================
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

    // 6. UNKNOWN CODE
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
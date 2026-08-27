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

  // 2. Unwrap URL if present
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
    const now = new Date();

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
        // A. Search SPECIFIC subscription tied to this receipt number
        const { data: subData } = await supabase
          .from('subscriptions')
          .select('*, members(*)')
          .or(`receipt_number.ilike.${targetRec},id.ilike.${targetRec}`)
          .maybeSingle();

        if (subData && subData.members) {
          const member = subData.members;
          const startDate = new Date(subData.start_date);
          const endDate = new Date(subData.end_date);

          let calculatedStatus: HybridMemberResult['status'] = 'Active';
          let validityNote = 'Valid official subscription receipt.';

          if (subData.status === 'Voided' || subData.voided_at) {
            calculatedStatus = 'Voided';
            validityNote = '⛔ VOIDED RECEIPT: This subscription was voided and cannot be used.';
          } else if (member.status === 'Suspended') {
            calculatedStatus = 'Suspended';
            validityNote = '⛔ SUSPENDED ACCOUNT: Member account is currently suspended.';
          } else if (now < startDate) {
            // FUTURE / SCHEDULED SUBSCRIPTION
            calculatedStatus = 'Scheduled';
            const daysUntil = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            validityNote = `⏳ FUTURE RECEIPT: Plan starts on ${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (in ${daysUntil} days). Not active for entry today.`;
          } else if (now > endDate || subData.status === 'Expired') {
            // EXPIRED SUBSCRIPTION
            calculatedStatus = 'Expired';
            validityNote = `❌ EXPIRED RECEIPT: This receipt expired on ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. It cannot be reused.`;
          } else {
            // CURRENTLY ACTIVE
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
              avatarUrl: member.avatar_url || member.image_url || null,
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

        // B. Search Invoices / Receipts Table (Single-day walk-in receipts)
        const { data: receiptData } = await supabase
          .from('receipts')
          .select('*, members(*)')
          .eq('id', targetRec)
          .maybeSingle();

        if (receiptData) {
          const member = receiptData.members;
          const createdAt = new Date(receiptData.created_at);
          const todayStr = new Date().toISOString().split('T')[0];
          const receiptDateStr = createdAt.toISOString().split('T')[0];
          const isToday = todayStr === receiptDateStr;

          return {
            type: 'member',
            rawCode,
            member: {
              id: member?.id || receiptData.id,
              memberId: member?.member_id || 'WALK-IN',
              fullName: member?.full_name || receiptData.customer_name,
              phone: member?.phone || '',
              email: member?.email || '',
              avatarUrl: member?.avatar_url || member?.image_url || null,
              status: isToday ? 'Active' : 'Expired',
              membershipPlan: receiptData.item_description || 'Walk-In Daily Pass',
              startDate: createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
              expDate: createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
              remainingDays: isToday ? 1 : 0,
              alreadyCheckedInToday: false,
              receiptNumber: receiptData.id,
              receiptType: 'walk_in',
              receiptValidityNote: isToday 
                ? '✅ Valid daily walk-in pass (Issued today).' 
                : `❌ EXPIRED RECEIPT: Daily pass was only valid on ${receiptDateStr}.`,
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
    // 3. MEMBER QR / CARD / MEMBER-ID SCAN (Validates Today's Active Plan)
    // =========================================================================
    try {
      const [allCards, allMembers] = await Promise.all([
        cardService.getAll(),
        memberService.getAll(),
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
        // Query ALL non-voided subscriptions for this member
        const { data: memberSubs } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('member_id', member.member_id)
          .is('voided_at', null)
          .neq('status', 'Voided')
          .order('end_date', { ascending: false });

        const subsList = memberSubs || [];

        // Find the subscription that covers TODAY: start_date <= now <= end_date
        const currentActiveSub = subsList.find((s) => {
          const sStart = new Date(s.start_date);
          const sEnd = new Date(s.end_date);
          return s.status === 'Active' && sStart <= now && now <= sEnd;
        });

        // Check if there is an upcoming future subscription
        const upcomingSub = !currentActiveSub
          ? subsList.find((s) => new Date(s.start_date) > now && s.status === 'Active')
          : null;

        // Latest past subscription
        const latestPastSub = !currentActiveSub && !upcomingSub && subsList.length > 0 
          ? subsList[0] 
          : null;

        let calculatedStatus: HybridMemberResult['status'] = 'Expired';
        let planName = 'No Active Plan';
        let startDateStr = 'N/A';
        let expDateStr = 'N/A';
        let remainingDays = 0;
        let validityNote: string | undefined;

        if (member.status === 'Suspended') {
          calculatedStatus = 'Suspended';
          validityNote = 'Member account is currently suspended.';
        } else if (currentActiveSub) {
          planName = currentActiveSub.plan_name || `${currentActiveSub.plan_type.toUpperCase()} MEMBERSHIP`;
          startDateStr = new Date(currentActiveSub.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          expDateStr = new Date(currentActiveSub.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

          const endDate = new Date(currentActiveSub.end_date);
          remainingDays = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

          if (remainingDays <= 7) {
            calculatedStatus = 'Expires Soon';
          } else {
            calculatedStatus = 'Active';
          }
        } else if (upcomingSub) {
          calculatedStatus = 'Scheduled';
          planName = upcomingSub.plan_name || `${upcomingSub.plan_type.toUpperCase()} MEMBERSHIP`;
          startDateStr = new Date(upcomingSub.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          expDateStr = new Date(upcomingSub.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          validityNote = `No active plan for today. Upcoming subscription starts on ${startDateStr}.`;
        } else if (latestPastSub) {
          calculatedStatus = 'Expired';
          planName = latestPastSub.plan_name || `${latestPastSub.plan_type.toUpperCase()} MEMBERSHIP`;
          startDateStr = new Date(latestPastSub.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          expDateStr = new Date(latestPastSub.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          validityNote = `Plan expired on ${expDateStr}.`;
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
            receiptNumber: currentActiveSub?.receipt_number || null,
            receiptValidityNote: validityNote,
            isSpecificReceiptScan: false
          }
        };
      }
    } catch (e) {
      console.warn('Member lookup warning:', e);
    }

    // =========================================================================
    // 4. LOOKUP PRODUCT (PR-XXXX OR MFG BARCODE)
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

    return {
      type: 'unknown',
      rawCode
    };
  }
};
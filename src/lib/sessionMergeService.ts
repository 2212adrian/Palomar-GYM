// src/lib/sessionMergeService.ts
import { supabase } from './supabase/client';
import { getServerISOString, getServerManilaDateString } from './serverTime';
import { logAudit } from './supabase/audit';
import type { CashSession } from '../types/cash';

export interface MergedSessionGroup {
  dateStr: string; // YYYY-MM-DD correlation date
  primarySessionId: string;
  allSessionIds: string[];
  sessionNumber: string;
  openedAt: string;
  closedAt: string | null;
  openedByName: string;
  closedByName: string | null;
  openingFloat: number;
  closingActualCash: number | null;
  closingExpectedCash: number;
  totalCashSales: number;
  totalDigitalSales: number;
  totalCashLogbook: number;
  totalDigitalLogbook: number;
  totalCashIn: number;
  totalCashOut: number;
  totalDigitalIn: number;
  salesCount: number;
  attendanceCount: number;
  receiptsCount: number;
  status: 'open' | 'closed';
  notes: string | null;
}

/**
 * Extracts correlation date (YYYY-MM-DD) from ISO timestamp in Manila timezone.
 */
export function getCorrelationDate(isoString?: string | null): string {
  if (!isoString) return getServerManilaDateString();
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return getServerManilaDateString();
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return getServerManilaDateString();
  }
}

/**
 * Consolidates multiple sessions belonging to the same day into a unified representation.
 * Used for display across Sales, Attendance, and Cash Management.
 */
export function groupSessionsByCorrelationDay(sessions: CashSession[]): MergedSessionGroup[] {
  const groupsByDate = new Map<string, CashSession[]>();

  sessions.forEach((s) => {
    const dateKey = getCorrelationDate(s.opened_at);
    const existing = groupsByDate.get(dateKey) || [];
    existing.push(s);
    groupsByDate.set(dateKey, existing);
  });

  const mergedResults: MergedSessionGroup[] = [];

  groupsByDate.forEach((daySessions, dateStr) => {
    // Sort chronologically by opened_at
    daySessions.sort((a, b) => {
      const timeA = a.opened_at ? new Date(a.opened_at).getTime() : 0;
      const timeB = b.opened_at ? new Date(b.opened_at).getTime() : 0;
      return timeA - timeB;
    });

    const primary = daySessions[0];
    const allSessionIds = daySessions.map((s) => s.id);

    // Earliest opened_at
    const earliestOpened = daySessions.reduce((earliest, s) => {
      if (!s.opened_at) return earliest;
      if (!earliest) return s.opened_at;
      return new Date(s.opened_at).getTime() < new Date(earliest).getTime()
        ? s.opened_at
        : earliest;
    }, primary.opened_at || '');

    // Latest closed_at (if all are closed, or null if any is still open)
    const anyOpen = daySessions.some((s) => s.status === 'open' || !s.closed_at);
    const latestClosed = anyOpen
      ? null
      : daySessions.reduce<string | null>((latest, s) => {
          if (!s.closed_at) return latest;
          if (!latest) return s.closed_at;
          return new Date(s.closed_at).getTime() > new Date(latest).getTime()
            ? s.closed_at
            : latest;
        }, null);

    // Initial opening float comes from the first opened session of the day
    const openingFloat = Number(primary.opening_float || 0);

    // Combine users
    const uniqueOpenedBy = Array.from(
      new Set(daySessions.map((s) => s.opened_by_name).filter(Boolean))
    ).join(', ');

    const uniqueClosedBy = Array.from(
      new Set(daySessions.map((s) => s.closed_by_name).filter(Boolean))
    ).join(', ');

    // Aggregate totals across all sessions for that day
    let totalCashSales = 0;
    let totalDigitalSales = 0;
    let totalCashLogbook = 0;
    let totalDigitalLogbook = 0;
    let closingActualCash: number | null = null;

    daySessions.forEach((s) => {
      totalCashSales += Number(s.total_cash_sales || 0);
      totalDigitalSales += Number(s.total_digital_sales || 0);
      totalCashLogbook += Number(s.total_cash_logbook || 0);
      totalDigitalLogbook += Number(s.total_digital_logbook || 0);
      if (s.closing_actual_cash !== null && s.closing_actual_cash !== undefined) {
        closingActualCash = Number(s.closing_actual_cash);
      }
    });

    const expectedCash =
      openingFloat + totalCashSales + totalCashLogbook;

    mergedResults.push({
      dateStr,
      primarySessionId: primary.id,
      allSessionIds,
      sessionNumber: primary.session_number || `CS-${dateStr.replace(/-/g, '')}`,
      openedAt: earliestOpened,
      closedAt: latestClosed,
      openedByName: uniqueOpenedBy || primary.opened_by_name || 'Staff',
      closedByName: anyOpen ? null : uniqueClosedBy || 'Staff',
      openingFloat,
      closingActualCash,
      closingExpectedCash: expectedCash,
      totalCashSales,
      totalDigitalSales,
      totalCashLogbook,
      totalDigitalLogbook,
      totalCashIn: 0,
      totalCashOut: 0,
      totalDigitalIn: 0,
      salesCount: 0,
      attendanceCount: 0,
      receiptsCount: 0,
      status: anyOpen ? 'open' : 'closed',
      notes: daySessions
        .map((s) => s.notes)
        .filter(Boolean)
        .join(' | ') || null,
    });
  });

  return mergedResults.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
}

/**
 * Merges multiple sessions that occurred on the same day in Supabase into a single ended session.
 * Reassigns all associated sales, logbook attendance records, receipts, and cash transactions.
 */
export async function mergeDailySessionsInSupabase(targetDateStr?: string): Promise<{
  mergedCount: number;
  primarySessionId: string | null;
}> {
  const correlationDate = targetDateStr || getServerManilaDateString();
  const startIso = `${correlationDate}T00:00:00+08:00`;
  const endIso = `${correlationDate}T23:59:59.999+08:00`;

  try {
    // 1. Fetch all sessions that intersect with this correlation date
    const { data: sessions, error } = await supabase
      .from('cash_sessions')
      .select('*')
      .or(`opened_at.gte.${startIso},opened_at.lte.${endIso}`)
      .order('opened_at', { ascending: true });

    if (error || !sessions || sessions.length <= 1) {
      return { mergedCount: 0, primarySessionId: sessions?.[0]?.id || null };
    }

    // Filter sessions that strictly match the correlation date
    const daySessions = sessions.filter(
      (s) => getCorrelationDate(s.opened_at) === correlationDate
    );

    if (daySessions.length <= 1) {
      return { mergedCount: 0, primarySessionId: daySessions[0]?.id || null };
    }

    const primary = daySessions[0];
    const secondaries = daySessions.slice(1);
    const secondaryIds = secondaries.map((s) => s.id);

    console.info(
      `[Session Merge] Found ${secondaries.length} redundant sessions for date ${correlationDate}. Merging into primary session #${primary.session_number} (${primary.id})...`
    );

    // 2. Reassign all sales linked to secondary sessions to primary session
    await supabase
      .from('sales')
      .update({ cash_session_id: primary.id })
      .in('cash_session_id', secondaryIds);

    // 3. Reassign all attendance logs linked to secondary sessions to primary session
    await supabase
      .from('attendance')
      .update({ cash_session_id: primary.id })
      .in('cash_session_id', secondaryIds);

    // 4. Reassign all receipts linked to secondary sessions to primary session
    await supabase
      .from('receipts')
      .update({ cash_session_id: primary.id })
      .in('cash_session_id', secondaryIds);

    // 5. Reassign all cash transactions (cash-in, cash-out, digital-in)
    await supabase
      .from('cash_transactions')
      .update({ session_id: primary.id })
      .in('session_id', secondaryIds);

    // 6. Recalculate combined date range and summary
    const earliestOpened = daySessions.reduce((earliest, s) => {
      if (!s.opened_at) return earliest;
      return new Date(s.opened_at).getTime() < new Date(earliest).getTime()
        ? s.opened_at
        : earliest;
    }, primary.opened_at);

    const latestClosed = daySessions.reduce<string | null>((latest, s) => {
      if (!s.closed_at) return latest;
      if (!latest) return s.closed_at;
      return new Date(s.closed_at).getTime() > new Date(latest).getTime()
        ? s.closed_at
        : latest;
    }, null);

    const combinedNotes = Array.from(
      new Set(daySessions.map((s) => s.notes).filter(Boolean))
    ).join(' | ');

    // 7. Calculate authoritative totals from all transactions now linked to primary
    const [salesRes, attRes, rcptRes, txRes] = await Promise.all([
      supabase.from('sales').select('total_amount, payment_method').eq('cash_session_id', primary.id),
      supabase.from('attendance').select('entry_fee, payment_method, customer_type, plan_name').eq('cash_session_id', primary.id).is('deleted_at', null),
      supabase.from('receipts').select('amount, payment_method').eq('cash_session_id', primary.id),
      supabase.from('cash_transactions').select('amount, type').eq('session_id', primary.id),
    ]);

    let totalCashSales = 0;
    let totalDigitalSales = 0;
    (salesRes.data || []).forEach((s: any) => {
      const amt = Number(s.total_amount || 0);
      const isCash = String(s.payment_method || '').toLowerCase() === 'cash';
      if (isCash) totalCashSales += amt;
      else totalDigitalSales += amt;
    });

    let totalCashLogbook = 0;
    let totalDigitalLogbook = 0;
    (attRes.data || []).forEach((a: any) => {
      const amt = Number(a.entry_fee || 0);
      if (amt <= 0) return;
      const isCash = String(a.payment_method || '').toLowerCase().includes('cash') &&
        !String(a.payment_method || '').toLowerCase().includes('gcash');
      if (isCash) totalCashLogbook += amt;
      else totalDigitalLogbook += amt;
    });

    (rcptRes.data || []).forEach((r: any) => {
      const amt = Number(r.amount || 0);
      if (amt <= 0) return;
      const isCash = String(r.payment_method || '').toLowerCase().includes('cash') &&
        !String(r.payment_method || '').toLowerCase().includes('gcash');
      if (isCash) totalCashLogbook += amt;
      else totalDigitalLogbook += amt;
    });

    let totalCashIn = 0;
    let totalCashOut = 0;
    let totalDigitalIn = 0;
    (txRes.data || []).forEach((t: any) => {
      const amt = Number(t.amount || 0);
      if (t.type === 'cash_in') totalCashIn += amt;
      else if (t.type === 'cash_out') totalCashOut += amt;
      else if (t.type === 'digital_in') totalDigitalIn += amt;
    });

    const initialOpeningFloat = Number(primary.opening_float || 0);
    const expectedDrawerCash =
      initialOpeningFloat +
      totalCashIn -
      totalCashOut +
      totalCashSales +
      totalCashLogbook;

    // 8. Update primary session with the combined data
    await supabase
      .from('cash_sessions')
      .update({
        opened_at: earliestOpened,
        closed_at: latestClosed || getServerISOString(),
        status: 'closed',
        total_cash_sales: totalCashSales,
        total_digital_sales: totalDigitalSales,
        total_cash_logbook: totalCashLogbook,
        total_digital_logbook: totalDigitalLogbook,
        closing_expected_cash: expectedDrawerCash,
        notes: combinedNotes ? `[Consolidated Day Session] ${combinedNotes}` : '[Consolidated Day Session]',
      })
      .eq('id', primary.id);

    // 9. Remove the secondary sessions so only 1 ended session exists for the day
    await supabase.from('cash_sessions').delete().in('id', secondaryIds);

    await logAudit(
      'SESSIONS_MERGED',
      `Merged ${secondaries.length} offline sessions into single ended session #${primary.session_number} for date ${correlationDate}. Combined sales: ${(salesRes.data || []).length} items.`,
      primary.id
    ).catch(() => {});

    return {
      mergedCount: secondaries.length,
      primarySessionId: primary.id,
    };
  } catch (err) {
    console.error('[Session Merge Error]:', err);
    return { mergedCount: 0, primarySessionId: null };
  }
}

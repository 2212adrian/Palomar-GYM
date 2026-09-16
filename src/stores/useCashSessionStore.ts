// src/stores/useCashSessionStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import {
  fetchActiveCashSession,
  fetchCashSessionHistory,
  fetchSessionTransactions,
} from '../lib/supabase/cashService';
import type {
  CashSession,
  CashFlowMetrics,
} from '../types/cash';

export interface UnifiedActivityItem {
  id: string;
  source: 'manual' | 'pos' | 'logbook' | 'receipt';
  type: 'cash_in' | 'cash_out' | 'digital_in';
  displayType: string;
  reason: string;
  reference_number?: string | null;
  performed_by_name: string;
  amount: number;
  created_at: string;
}

interface CashSessionStoreState {
  activeSession: CashSession | null;
  activeSessionId: string | null;
  isInitializing: boolean;
  transactions: UnifiedActivityItem[];
  history: CashSession[];
  metrics: CashFlowMetrics;
  isLoading: boolean;
  isSessionOpen: boolean;
  currentDrawerCash: number | null; // <-- Nullable so UI knows when data isn't ready

  loadActiveSession: () => Promise<void>;
  loadHistory: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  recalculateMetrics: () => Promise<void>;
  setSessionClosed: () => void;
  subscribeRealtime: () => () => void;
}

const INITIAL_METRICS: CashFlowMetrics = {
  openingFloat: 0,
  cashInTotal: 0,
  cashOutTotal: 0,
  digitalInTotal: 0,
  cashSales: 0,
  digitalSales: 0,
  cashLogbook: 0,
  digitalLogbook: 0,
  expectedDrawerCash: 0,
  totalDigitalCollections: 0,
  totalSessionCollections: 0,
};

let globalRealtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let realtimeSubscriberCount = 0;
let debounceRecalculateTimer: ReturnType<typeof setTimeout> | null = null;

export const useCashSessionStore = create<CashSessionStoreState>((set, get) => ({
  activeSession: null,
  activeSessionId: null,
  isInitializing: true,
  transactions: [],
  history: [],
  metrics: INITIAL_METRICS,
  isLoading: true,
  isSessionOpen: false,
  currentDrawerCash: null, // <-- Defaults to null, NEVER 0

  setSessionClosed: () => {
    set({
      activeSession: null,
      activeSessionId: null,
      isSessionOpen: false,
      isInitializing: false,
      transactions: [],
      metrics: INITIAL_METRICS,
      currentDrawerCash: null,
    });
  },

  loadActiveSession: async () => {
    try {
      set({ isLoading: true });
      const session = await fetchActiveCashSession();

      if (!session) {
        set({
          activeSession: null,
          activeSessionId: null,
          isSessionOpen: false,
          isInitializing: false,
          transactions: [],
          metrics: INITIAL_METRICS,
          currentDrawerCash: null,
          isLoading: false,
        });
        return;
      }

      // Immediately seed with the opening float so even if metrics take 200ms, it NEVER drops to 0!
      const initialFloat = Number(session.opening_float || 0);

      set({
        activeSession: session,
        activeSessionId: session.id,
        isSessionOpen: true,
        // If we don't have drawer cash yet, preload the known starting float
        currentDrawerCash: get().currentDrawerCash ?? initialFloat,
      });

      // Await calculations BEFORE marking isInitializing as false
      await get().recalculateMetrics();
    } catch (err) {
      console.error('Failed to load active session:', err);
    } finally {
      set({ isLoading: false, isInitializing: false });
    }
  },

  loadHistory: async () => {
    try {
      const history = await fetchCashSessionHistory(30);
      set({ history });
    } catch (err) {
      console.error('Failed to load session history:', err);
    }
  },

  refreshTransactions: async () => {
    await get().recalculateMetrics();
  },

  recalculateMetrics: async () => {
    const session = get().activeSession;
    if (!session) {
      set({ metrics: INITIAL_METRICS, currentDrawerCash: null, transactions: [] });
      return;
    }

    const openingFloat = Number(session.opening_float || 0);
    const effectiveStart = session.opened_at;

    try {
      // 1. Fetch Manual Drawer Movements (Cash In / Cash Out / Digital In)
      let rawManualTxs: any[] = [];
      try {
        const { data: manualData, error: manualErr } = await supabase
          .from('cash_transactions')
          .select('*')
          .or(`session_id.eq.${session.id},created_at.gte.${effectiveStart}`)
          .order('created_at', { ascending: false });

        if (!manualErr && manualData) {
          rawManualTxs = manualData;
        } else {
          rawManualTxs = await fetchSessionTransactions(session.id);
        }
      } catch (manualQueryErr) {
        console.warn('Error fetching manual cash transactions, retrying service:', manualQueryErr);
        try {
          rawManualTxs = await fetchSessionTransactions(session.id);
        } catch (fallbackErr) {
          console.error('Failed to load manual cash transactions:', fallbackErr);
        }
      }

      let cashInTotal = 0;
      let cashOutTotal = 0;
      let digitalInTotal = 0;

      const mappedManualTxs: UnifiedActivityItem[] = rawManualTxs.map((t: any) => {
        const amt = Number(t.amount || 0);
        const txType = String(t.type || '').trim().toLowerCase();

        if (txType === 'cash_in') cashInTotal += amt;
        else if (txType === 'cash_out') cashOutTotal += amt;
        else if (txType === 'digital_in') digitalInTotal += amt;

        return {
          id: String(t.id),
          source: 'manual',
          type: (txType === 'cash_out' ? 'cash_out' : txType === 'digital_in' ? 'digital_in' : 'cash_in') as 'cash_in' | 'cash_out' | 'digital_in',
          displayType:
            txType === 'cash_in'
              ? 'CASH IN'
              : txType === 'cash_out'
              ? 'CASH OUT'
              : 'DIGITAL IN',
          reason: t.reason || 'Drawer Movement',
          reference_number: t.reference_number || null,
          performed_by_name: t.performed_by_name || 'Staff',
          amount: amt,
          created_at: t.created_at,
        };
      });

      // 2. Fetch POS Sales within Active Session Window
      const { data: salesData, error: salesErr } = await supabase
        .from('sales')
        .select('id, total_amount, payment_method, product_name, items, receipt_no, reference_number, created_at, deleted_at, cash_session_id')
        .is('deleted_at', null)
        .or(`cash_session_id.eq.${session.id},created_at.gte.${effectiveStart}`);

      if (salesErr) {
        console.warn('Error fetching POS sales for cash session:', salesErr);
      }

      let cashSales = 0;
      let digitalSales = 0;

      const mappedSalesTxs: UnifiedActivityItem[] = (salesData || []).map((s: any) => {
        const amt = Number(s.total_amount || 0);
        const method = String(s.payment_method || '').toLowerCase();
        const isCash = method.includes('cash') && !method.includes('gcash');

        if (isCash) {
          cashSales += amt;
        } else {
          digitalSales += amt;
        }

        const itemsDesc =
          s.items && Array.isArray(s.items) && s.items.length > 0
            ? s.items.map((i: any) => `${i.productName || i.product_name} (${i.quantity || 1}x)`).join(', ')
            : s.product_name || 'Product Sale';

        return {
          id: String(s.id),
          source: 'pos',
          type: isCash ? 'cash_in' : 'digital_in',
          displayType: isCash ? 'POS SALE' : 'POS DIGITAL',
          reason: itemsDesc,
          reference_number: s.reference_number || (s.receipt_no ? `Receipt: ${s.receipt_no}` : null),
          performed_by_name: 'Cashier / POS',
          amount: amt,
          created_at: s.created_at,
        };
      });

      // 3. First fetch receipts to avoid ReferenceError when filtering attendance
      const { data: receiptsData, error: rcptErr } = await supabase
        .from('receipts')
        .select('id, customer_name, item_description, amount, payment_method, gcash_ref_no, created_at, cash_session_id')
        .or(`cash_session_id.eq.${session.id},created_at.gte.${effectiveStart}`);

      if (rcptErr) {
        console.warn('Error fetching receipts for cash session:', rcptErr);
      }

      const receiptIdsSet = new Set(
        (receiptsData || []).map((r: any) => String(r.id || '').trim().toLowerCase())
      );

      let cashReceipts = 0;
      let digitalReceipts = 0;

      const mappedReceiptsTxs: UnifiedActivityItem[] = (receiptsData || []).map((r: any) => {
        const amt = Number(r.amount || 0);
        const method = String(r.payment_method || '').trim().toLowerCase();
        const isCash = method.includes('cash') && !method.includes('gcash');

        if (isCash) {
          cashReceipts += amt;
        } else {
          digitalReceipts += amt;
        }

        const desc = String(r.item_description || '').toLowerCase();
        const isCardFee = desc.includes('card');
        const isRenewal = desc.includes('renewal');

        let displayType = isCash ? 'MEMBERSHIP (CASH)' : 'MEMBERSHIP (DIGITAL)';
        if (isCardFee) {
          displayType = isCash ? 'CARD FEE (CASH)' : 'CARD FEE (DIGITAL)';
        } else if (isRenewal) {
          displayType = isCash ? 'RENEWAL (CASH)' : 'RENEWAL (DIGITAL)';
        }

        return {
          id: `rcpt-${r.id}`,
          source: 'receipt',
          type: isCash ? 'cash_in' : 'digital_in',
          displayType,
          reason: `${r.customer_name || 'Member'} - ${r.item_description || 'Subscription Plan'}`,
          reference_number: r.gcash_ref_no || null,
          performed_by_name: 'Reception',
          amount: amt,
          created_at: r.created_at,
        };
      });

      // 4. Fetch Attendance Check-Ins
      const { data: attendanceData, error: attErr } = await supabase
        .from('attendance')
        .select('id, customer_name, customer_type, plan_name, entry_fee, payment_method, gcash_ref_no, receipt_number, staff_name, check_in_time, created_at, deleted_at, cash_session_id')
        .is('deleted_at', null)
        .or(`cash_session_id.eq.${session.id},check_in_time.gte.${effectiveStart},created_at.gte.${effectiveStart}`);

      if (attErr) {
        console.error('Error fetching attendance for cash session:', attErr);
      }

      let cashAttendance = 0;
      let digitalAttendance = 0;

      const mappedAttendanceTxs: UnifiedActivityItem[] = [];

      (attendanceData || []).forEach((a: any) => {
        const amt = Number(a.entry_fee || 0);

        if (amt > 0) {
          const rcptNo = String(a.receipt_number || '').trim().toLowerCase();
          const custType = String(a.customer_type || '').trim().toLowerCase();
          const planName = String(a.plan_name || '').trim().toLowerCase();

          if (
            (rcptNo && receiptIdsSet.has(rcptNo)) ||
            custType === 'card' ||
            planName.includes('card')
          ) {
            return;
          }

          const method = String(a.payment_method || '').trim().toLowerCase();
          const isCash = method.includes('cash') && !method.includes('gcash');

          if (isCash) {
            cashAttendance += amt;
          } else {
            digitalAttendance += amt;
          }

          mappedAttendanceTxs.push({
            id: String(a.id),
            source: 'logbook',
            type: isCash ? 'cash_in' : 'digital_in',
            displayType: isCash ? 'CHECK-IN (CASH)' : 'CHECK-IN (GCASH)',
            reason: `${a.customer_name || 'Guest'} (${a.customer_type || 'Walk-In'} - ${a.plan_name || 'Pass'})`,
            reference_number: a.gcash_ref_no || a.receipt_number || null,
            performed_by_name: a.staff_name || 'Reception',
            amount: amt,
            created_at: a.check_in_time || a.created_at,
          });
        }
      });

      const totalCashLogbook = cashAttendance + cashReceipts;
      const totalDigitalLogbook = digitalAttendance + digitalReceipts;

      // 5. Calculate Metrics Totals
      const totalCashCollections = cashSales + totalCashLogbook;
      const netManualDrawer = cashInTotal - cashOutTotal;

      const expectedDrawerCash =
        openingFloat +
        totalCashCollections +
        netManualDrawer;

      const totalDigitalCollections =
        digitalSales + totalDigitalLogbook + digitalInTotal;

      const totalSessionCollections =
        totalCashCollections + totalDigitalCollections + cashInTotal;

      const computedMetrics: CashFlowMetrics = {
        openingFloat,
        cashInTotal: Math.round(cashInTotal * 100) / 100,      
        cashOutTotal: Math.round(cashOutTotal * 100) / 100,   
        digitalInTotal,
        cashSales: Math.round(cashSales * 100) / 100,
        digitalSales: Math.round(digitalSales * 100) / 100,
        cashLogbook: Math.round(totalCashLogbook * 100) / 100,
        digitalLogbook: Math.round(totalDigitalLogbook * 100) / 100,
        expectedDrawerCash: Math.round(expectedDrawerCash * 100) / 100,
        totalDigitalCollections: Math.round(totalDigitalCollections * 100) / 100,
        totalSessionCollections: Math.round(totalSessionCollections * 100) / 100,
      };

      const allUnifiedActivity = [
        ...mappedManualTxs,
        ...mappedSalesTxs,
        ...mappedAttendanceTxs,
        ...mappedReceiptsTxs,
      ].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      set({
        metrics: computedMetrics,
        currentDrawerCash: computedMetrics.expectedDrawerCash,
        transactions: allUnifiedActivity,
      });
    } catch (error) {
      console.error('Error recalculating cash metrics:', error);
    }
  },

  subscribeRealtime: () => {
    realtimeSubscriberCount += 1;

    const triggerRecalculate = () => {
      if (debounceRecalculateTimer) clearTimeout(debounceRecalculateTimer);
      debounceRecalculateTimer = setTimeout(() => {
        get().recalculateMetrics();
      }, 75);
    };

    if (!globalRealtimeChannel) {
      const channelUniqueKey = `live_cash_sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const channel = supabase.channel(channelUniqueKey);

      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'cash_sessions' },
          () => {
            get().loadActiveSession();
            get().loadHistory();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'cash_transactions' },
          () => {
            triggerRecalculate();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sales' },
          () => {
            triggerRecalculate();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'attendance' },
          () => {
            triggerRecalculate();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'receipts' },
          () => {
            triggerRecalculate();
          }
        );

      channel.subscribe();
      globalRealtimeChannel = channel;
    }

    return () => {
      realtimeSubscriberCount = Math.max(0, realtimeSubscriberCount - 1);
      if (realtimeSubscriberCount === 0 && globalRealtimeChannel) {
        supabase.removeChannel(globalRealtimeChannel);
        globalRealtimeChannel = null;
      }
    };
  },
}));
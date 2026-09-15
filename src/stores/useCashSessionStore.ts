// src/stores/useCashSessionStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import {
  fetchActiveCashSession,
  fetchSessionTransactions,
  fetchCashSessionHistory,
} from '../lib/supabase/cashService';
import type {
  CashSession,
  CashTransaction,
  CashFlowMetrics,
} from '../types/cash';

interface CashSessionState {
  activeSession: CashSession | null;
  transactions: CashTransaction[];
  history: CashSession[];
  metrics: CashFlowMetrics;
  isLoading: boolean;
  isSessionOpen: boolean;
  currentDrawerCash: number;

  // Actions
  loadActiveSession: () => Promise<void>;
  loadHistory: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  recomputeMetrics: () => Promise<void>;
  subscribeRealtime: () => () => void;
}

const DEFAULT_METRICS: CashFlowMetrics = {
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

export const useCashSessionStore = create<CashSessionState>((set, get) => ({
  activeSession: null,
  transactions: [],
  history: [],
  metrics: DEFAULT_METRICS,
  isLoading: true,
  isSessionOpen: false,
  currentDrawerCash: 0,

  loadActiveSession: async () => {
    try {
      set({ isLoading: true });
      const session = await fetchActiveCashSession();
      if (session) {
        set({
          activeSession: session,
          isSessionOpen: session.status === 'open',
        });
        await get().refreshTransactions();
      } else {
        set({
          activeSession: null,
          isSessionOpen: false,
          transactions: [],
          metrics: DEFAULT_METRICS,
          currentDrawerCash: 0,
          isLoading: false,
        });
      }
    } catch (err) {
      console.warn('Failed to load active cash session:', err);
      set({ isLoading: false });
    }
  },

  loadHistory: async () => {
    try {
      const history = await fetchCashSessionHistory(30);
      set({ history });
    } catch (err) {
      console.warn('Failed to load cash session history:', err);
    }
  },

  refreshTransactions: async () => {
    const { activeSession } = get();
    if (!activeSession) return;

    try {
      const txs = await fetchSessionTransactions(activeSession.id);
      set({ transactions: txs });
      await get().recomputeMetrics();
    } catch (err) {
      console.warn('Failed to refresh cash transactions:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  recomputeMetrics: async () => {
    const { activeSession, transactions } = get();
    if (!activeSession) {
      set({ metrics: DEFAULT_METRICS, currentDrawerCash: 0 });
      return;
    }

    const openingFloat = Number(activeSession.opening_float) || 0;

    // 1. Calculate manual cash movements from cash_transactions
    let cashInTotal = 0;
    let cashOutTotal = 0;
    let digitalInTotal = 0;

    for (const tx of transactions) {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'cash_in') cashInTotal += amt;
      else if (tx.type === 'cash_out') cashOutTotal += amt;
      else if (tx.type === 'digital_in') digitalInTotal += amt;
    }

    // 2. Fetch sales created during session window
    let cashSales = 0;
    let digitalSales = 0;

    try {
      const sessionStart = activeSession.opened_at;
      const sessionEnd = activeSession.closed_at || new Date().toISOString();

      const { data: salesData } = await supabase
        .from('sales')
        .select('total_amount, payment_method, created_at, deleted_at')
        .gte('created_at', sessionStart)
        .lte('created_at', sessionEnd)
        .is('deleted_at', null);

      if (salesData && Array.isArray(salesData)) {
        for (const s of salesData) {
          const amt = Number(s.total_amount) || 0;
          const method = String(s.payment_method || '').toLowerCase();
          if (method === 'cash') {
            cashSales += amt;
          } else {
            digitalSales += amt;
          }
        }
      }
    } catch (err) {
      console.warn('Could not query sales for cash session calculation:', err);
    }

    // 3. Fetch logbook attendance created during session window
    let cashLogbook = 0;
    let digitalLogbook = 0;

    try {
      const sessionStart = activeSession.opened_at;
      const sessionEnd = activeSession.closed_at || new Date().toISOString();

      const { data: attData } = await supabase
        .from('attendance')
        .select('entry_fee, payment_method, check_in_time, deleted_at')
        .gte('check_in_time', sessionStart)
        .lte('check_in_time', sessionEnd)
        .is('deleted_at', null);

      if (attData && Array.isArray(attData)) {
        for (const a of attData) {
          const amt = Number(a.entry_fee) || 0;
          const method = String(a.payment_method || '').toLowerCase();
          if (method === 'cash') {
            cashLogbook += amt;
          } else {
            digitalLogbook += amt;
          }
        }
      }
    } catch (err) {
      console.warn('Could not query attendance for cash session calculation:', err);
    }

    // 4. Synthesize Final Metrics
    const expectedDrawerCash = openingFloat + cashSales + cashLogbook + cashInTotal - cashOutTotal;
    const totalDigitalCollections = digitalSales + digitalLogbook + digitalInTotal;
    const totalSessionCollections = cashSales + cashLogbook + totalDigitalCollections;

    const newMetrics: CashFlowMetrics = {
      openingFloat,
      cashInTotal,
      cashOutTotal,
      digitalInTotal,
      cashSales,
      digitalSales,
      cashLogbook,
      digitalLogbook,
      expectedDrawerCash,
      totalDigitalCollections,
      totalSessionCollections,
    };

    set({
      metrics: newMetrics,
      currentDrawerCash: Math.max(0, expectedDrawerCash),
    });
  },

  subscribeRealtime: () => {
    // Initial fetch
    get().loadActiveSession();
    get().loadHistory();

    const channel = supabase
      .channel('cash-management-realtime')
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
          get().refreshTransactions();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales' },
        () => {
          get().recomputeMetrics();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => {
          get().recomputeMetrics();
        }
      )
      .subscribe();

    // Listen to window custom events from client sales/logbook mutations
    const handleSalesUpdate = () => {
      get().recomputeMetrics();
    };
    const handleLogbookUpdate = () => {
      get().recomputeMetrics();
    };

    window.addEventListener('sales-kpi-update', handleSalesUpdate);
    window.addEventListener('logbook-kpi-update', handleLogbookUpdate);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('sales-kpi-update', handleSalesUpdate);
      window.removeEventListener('logbook-kpi-update', handleLogbookUpdate);
    };
  },
}));

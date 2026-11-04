// src/stores/useCashSessionStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import { useAuthStore } from './authStore';
import { isSuperAdmin } from '../constants/auth';
import { stagePendingTransaction, getDecryptedPendingTransactions } from '../lib/offlineVault';
import {
  fetchActiveCashSession,
  fetchCashSessionHistory,
  fetchSessionTransactions,
} from '../lib/supabase/cashService';
import type {
  CashSession,
  CashFlowMetrics,
} from '../types/cash';

const isConnectionError = (err: any): boolean => {
  if (!err) return false;
  const str = (
    (typeof err === 'string' ? err : '') +
    ' ' +
    (err.message || '') +
    ' ' +
    (err.details || '') +
    ' ' +
    (err.name || '')
  ).toLowerCase();
  return (
    str.includes('no internet connection') ||
    str.includes('failed to fetch') ||
    str.includes('network') ||
    str.includes('offline') ||
    str.includes('check your wi-fi') ||
    str.includes('timeout') ||
    str.includes('aborterror')
  );
};

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
  currentDrawerCash: number | null;
  wasSuspendedByOffline: boolean;
  lastKnownSession: CashSession | null;

  canProcessOfflineTransactions: () => boolean;
  getLastKnownSessionId: () => string | null;
  loadActiveSession: () => Promise<void>;
  loadHistory: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  recalculateMetrics: () => Promise<void>;
  setSessionClosed: () => void;
  suspendSessionForOffline: () => void;
  openOfflineCashSession: (params: {
    openingFloat: number;
    notes?: string;
    openedBy?: string | null;
    openedByName: string;
  }) => void;
  restoreSessionAfterOnline: () => Promise<void>;
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

const getInitialOfflineState = () => {
  if (typeof window === 'undefined') {
    return { session: null, isOpen: false, isSuspended: false };
  }
  try {
    const raw = localStorage.getItem('palomar_last_cash_session');
    const wasOpen = localStorage.getItem('palomar_session_was_open_offline') === 'true';
    const parsed = raw ? (JSON.parse(raw) as CashSession) : null;
    const isOffline = !navigator.onLine;
    const shouldBeOpen = Boolean(
      parsed && (wasOpen || parsed.status === 'open' || !parsed.closed_at)
    );
    if (parsed && shouldBeOpen) {
      return {
        session: parsed,
        isOpen: true,
        isSuspended: isOffline,
      };
    }
    return { session: parsed, isOpen: false, isSuspended: false };
  } catch {
    return { session: null, isOpen: false, isSuspended: false };
  }
};

const initialOffline = getInitialOfflineState();

export const useCashSessionStore = create<CashSessionStoreState>((set, get) => ({
  activeSession: initialOffline.session,
  activeSessionId: initialOffline.session?.id || null,
  isInitializing: true,
  transactions: [],
  history: [],
  metrics: INITIAL_METRICS,
  isLoading: true,
  isSessionOpen: initialOffline.isOpen,
  currentDrawerCash: initialOffline.session?.opening_float
    ? Number(initialOffline.session.opening_float)
    : null,
  wasSuspendedByOffline: initialOffline.isSuspended,
  lastKnownSession: initialOffline.session,

  canProcessOfflineTransactions: () => {
    const { wasSuspendedByOffline, lastKnownSession, activeSession, isSessionOpen } = get();
    if (isSessionOpen) return true;
    if (activeSession || lastKnownSession) return true;
    if (wasSuspendedByOffline) return true;
    try {
      const stored = localStorage.getItem('palomar_last_cash_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.id && (!parsed.closed_at || parsed.status === 'open')) {
          return true;
        }
      }
      const wasOpen = localStorage.getItem('palomar_session_was_open_offline') === 'true';
      return Boolean(wasOpen);
    } catch {
      return false;
    }
  },

  getLastKnownSessionId: () => {
    const { lastKnownSession, activeSessionId, activeSession } = get();
    if (activeSessionId) return activeSessionId;
    if (activeSession?.id) return activeSession.id;
    if (lastKnownSession?.id) return lastKnownSession.id;
    try {
      const stored = localStorage.getItem('palomar_last_cash_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed?.id || null;
      }
    } catch {}
    return null;
  },

  setSessionClosed: () => {
    try {
      localStorage.removeItem('palomar_last_cash_session');
      localStorage.setItem('palomar_session_was_open_offline', 'false');
    } catch {}
    set({
      activeSession: null,
      activeSessionId: null,
      isSessionOpen: false,
      isInitializing: false,
      transactions: [],
      metrics: INITIAL_METRICS,
      currentDrawerCash: null,
      wasSuspendedByOffline: false,
      lastKnownSession: null,
    });
  },

  /**
   * Suspends cloud operations during network disconnection while keeping
   * the active session open locally so offline transactions can be safely queued and encrypted.
   */
  suspendSessionForOffline: () => {
    const { activeSession, isSessionOpen, lastKnownSession } = get();
    const effectiveSession = activeSession || lastKnownSession;
    if ((isSessionOpen || effectiveSession) && effectiveSession) {
      try {
        localStorage.setItem('palomar_last_cash_session', JSON.stringify(effectiveSession));
        localStorage.setItem('palomar_session_was_open_offline', 'true');
      } catch {}
      set({
        // Session remains unlocked locally for front-desk offline POS and check-ins
        isSessionOpen: true,
        wasSuspendedByOffline: true,
        lastKnownSession: effectiveSession,
        activeSession: effectiveSession,
        activeSessionId: effectiveSession.id,
      });
    } else {
      try {
        localStorage.setItem('palomar_session_was_open_offline', 'false');
      } catch {}
    }
  },

  /**
   * Resumes the active session to its original state once internet is restored.
   */
  restoreSessionAfterOnline: async () => {
    const { wasSuspendedByOffline } = get();
    await get().loadActiveSession();
    if (wasSuspendedByOffline) {
      set({ wasSuspendedByOffline: false });
    }
  },

  openOfflineCashSession: (params: {
    openingFloat: number;
    notes?: string;
    openedBy?: string | null;
    openedByName: string;
  }) => {
    const offlineId = `offline-session-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const offlineSession: CashSession = {
      id: offlineId,
      session_number: `OFFLINE-${nowIso.slice(0, 10).replace(/-/g, '')}`,
      status: 'open',
      opened_at: nowIso,
      closed_at: null,
      opening_float: params.openingFloat,
      opened_by: params.openedBy || null,
      opened_by_name: params.openedByName,
      closed_by: null,
      closed_by_name: null,
      notes: params.notes || 'Opened in Offline Mode',
      closing_expected_cash: params.openingFloat,
      closing_actual_cash: null,
      discrepancy: null,
      denominations: null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    try {
      localStorage.setItem('palomar_last_cash_session', JSON.stringify(offlineSession));
      localStorage.setItem('palomar_session_was_open_offline', 'true');
    } catch {}

    set({
      activeSession: offlineSession,
      activeSessionId: offlineId,
      isSessionOpen: true,
      wasSuspendedByOffline: true,
      lastKnownSession: offlineSession,
      currentDrawerCash: params.openingFloat,
      metrics: {
        ...INITIAL_METRICS,
        openingFloat: params.openingFloat,
        expectedDrawerCash: params.openingFloat,
      },
    });

    stagePendingTransaction({
      type: 'attendance',
      cashSessionId: offlineId,
      userId: params.openedBy || 'offline-user',
      userName: params.openedByName || 'Staff',
      payload: {
        action: 'CASH_SESSION_OPEN_OFFLINE',
        session_id: offlineId,
        opening_float: params.openingFloat,
        opened_by: params.openedBy,
        opened_by_name: params.openedByName,
        notes: params.notes,
        created_at: nowIso,
      },
    }).catch(() => {});
  },

  loadActiveSession: async () => {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    // In offline mode, strictly PRESERVE the cached session and never close it
    if (isOffline) {
      const { lastKnownSession, activeSession } = get();
      const stored = (() => {
        try {
          const raw = localStorage.getItem('palomar_last_cash_session');
          return raw ? (JSON.parse(raw) as CashSession) : null;
        } catch {
          return null;
        }
      })();

      const effective = activeSession || lastKnownSession || stored;
      if (effective) {
        set({
          activeSession: effective,
          activeSessionId: effective.id,
          isSessionOpen: true,
          wasSuspendedByOffline: true,
          lastKnownSession: effective,
          currentDrawerCash: get().currentDrawerCash ?? Number(effective.opening_float || 0),
          isLoading: false,
          isInitializing: false,
        });
      } else {
        set({
          isLoading: false,
          isInitializing: false,
        });
      }
      return;
    }

    try {
      set({ isLoading: true });
      const session = await fetchActiveCashSession();

      if (!session) {
        try {
          localStorage.removeItem('palomar_last_cash_session');
          localStorage.setItem('palomar_session_was_open_offline', 'false');
        } catch {}
        set({
          activeSession: null,
          activeSessionId: null,
          isSessionOpen: false,
          isInitializing: false,
          transactions: [],
          metrics: INITIAL_METRICS,
          currentDrawerCash: null,
          isLoading: false,
          lastKnownSession: null,
        });
        return;
      }

      const initialFloat = Number(session.opening_float || 0);
      try {
        localStorage.setItem('palomar_last_cash_session', JSON.stringify(session));
        localStorage.setItem('palomar_session_was_open_offline', 'true');
      } catch {}

      set({
        activeSession: session,
        activeSessionId: session.id,
        isSessionOpen: true,
        wasSuspendedByOffline: false,
        lastKnownSession: session,
        currentDrawerCash: get().currentDrawerCash ?? initialFloat,
      });

      await get().recalculateMetrics();
    } catch (err) {
      const isNetworkErr =
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        isConnectionError(err);
      if (!isNetworkErr) {
        console.error('Failed to load active session:', err);
      }
      const canOffline = get().canProcessOfflineTransactions();
      const lastSession = get().lastKnownSession;

      if ((isNetworkErr || canOffline) && lastSession) {
        set({
          activeSession: lastSession,
          activeSessionId: lastSession.id,
          isSessionOpen: true,
          wasSuspendedByOffline: true,
          currentDrawerCash: get().currentDrawerCash ?? Number(lastSession.opening_float || 0),
        });
      }
    } finally {
      set({ isLoading: false, isInitializing: false });
    }
  },

  loadHistory: async () => {
    const auth = useAuthStore.getState();
    const isAdmin = Boolean(
      auth.user?.email &&
        (isSuperAdmin(auth.user.email) ||
          auth.user.email.toLowerCase() === 'wolfpalomargym@gmail.com' ||
          auth.profile?.role === 'admin')
    );
    if (!isAdmin) {
      set({ history: [] });
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        const cached = localStorage.getItem('sales_closed_sessions_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            set({ history: parsed });
          }
        }
      } catch {}
      return;
    }

    try {
      const history = await fetchCashSessionHistory(30);
      set({ history });
      try {
        localStorage.setItem('sales_closed_sessions_cache', JSON.stringify(history));
      } catch {}
    } catch (err) {
      if ((typeof navigator === 'undefined' || navigator.onLine) && !isConnectionError(err)) {
        console.error('Failed to load session history:', err);
      }
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

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (isOffline) {
      // In offline mode, compute metrics from openingFloat + pending vault transactions immediately
      let pendingActivity: UnifiedActivityItem[] = [];
      let pendingCashIn = 0;
      let pendingCashOut = 0;
      let pendingDigitalIn = 0;
      let pendingCashSales = 0;
      let pendingDigitalSales = 0;
      let pendingCashLogbook = 0;
      let pendingDigitalLogbook = 0;

      try {
        const pendingTxs = await getDecryptedPendingTransactions().catch(() => []);
        for (const tx of pendingTxs) {
          if (tx.status === 'conflict') continue;
          const pl = tx.payload || {};
          const isCash =
            String(pl.payment_method || '').toLowerCase().includes('cash') &&
            !String(pl.payment_method || '').toLowerCase().includes('gcash');

          if (tx.type === 'attendance') {
            const fee = Number(pl.entry_fee || 0);
            if (fee > 0) {
              if (isCash) pendingCashLogbook += fee;
              else pendingDigitalLogbook += fee;

              pendingActivity.push({
                id: tx.id,
                source: 'logbook',
                type: isCash ? 'cash_in' : 'digital_in',
                displayType: isCash ? 'CHECK-IN (CASH) [OFFLINE]' : 'CHECK-IN (GCASH) [OFFLINE]',
                reason: `${pl.customer_name || 'Guest'} (${pl.customer_type || 'Walk-In'})`,
                reference_number: pl.gcash_ref_no || null,
                performed_by_name: tx.userName || 'Reception',
                amount: fee,
                created_at: tx.createdAt,
              });
            }
          } else if (tx.type === 'subscription') {
            const amt = Number(pl.price || pl.amount || 0);
            if (amt > 0) {
              if (isCash) pendingCashLogbook += amt;
              else pendingDigitalLogbook += amt;

              pendingActivity.push({
                id: tx.id,
                source: 'receipt',
                type: isCash ? 'cash_in' : 'digital_in',
                displayType: isCash ? 'MEMBERSHIP (CASH) [OFFLINE]' : 'MEMBERSHIP (DIGITAL) [OFFLINE]',
                reason: `${pl.customer_name || 'Member'} - ${pl.plan_name || 'Subscription'}`,
                reference_number: pl.receipt_number || null,
                performed_by_name: tx.userName || 'Reception',
                amount: amt,
                created_at: tx.createdAt,
              });
            }
          } else if (tx.type === 'card_purchase' || tx.type === 'batch_card_purchase') {
            const amt = Number(pl.amount || pl.card_fee || pl.total_amount || 0);
            if (amt > 0) {
              if (isCash) pendingCashLogbook += amt;
              else pendingDigitalLogbook += amt;

              pendingActivity.push({
                id: tx.id,
                source: 'receipt',
                type: isCash ? 'cash_in' : 'digital_in',
                displayType: isCash ? 'CARD FEE (CASH) [OFFLINE]' : 'CARD FEE (DIGITAL) [OFFLINE]',
                reason: pl.item_description || 'Physical Membership Card Fee',
                reference_number: pl.receipt_number || null,
                performed_by_name: tx.userName || 'Reception',
                amount: amt,
                created_at: tx.createdAt,
              });
            }
          } else if (tx.type === 'sale') {
            const amt = Number(pl.total_amount || pl.amount || 0);
            if (amt > 0) {
              if (isCash) pendingCashSales += amt;
              else pendingDigitalSales += amt;

              pendingActivity.push({
                id: tx.id,
                source: 'pos',
                type: isCash ? 'cash_in' : 'digital_in',
                displayType: isCash ? 'POS SALE [OFFLINE]' : 'POS DIGITAL [OFFLINE]',
                reason: pl.product_name || 'Product Sale',
                reference_number: pl.receipt_no || null,
                performed_by_name: tx.userName || 'Cashier',
                amount: amt,
                created_at: tx.createdAt,
              });
            }
          }
        }
      } catch {}

      const totalCashCol = pendingCashSales + pendingCashLogbook;
      const expectedDrawer = openingFloat + totalCashCol + (pendingCashIn - pendingCashOut);
      const totalDigCol = pendingDigitalSales + pendingDigitalLogbook + pendingDigitalIn;

      set(() => ({
        metrics: {
          openingFloat,
          cashInTotal: Math.round(pendingCashIn * 100) / 100,
          cashOutTotal: Math.round(pendingCashOut * 100) / 100,
          digitalInTotal: Math.round(pendingDigitalIn * 100) / 100,
          cashSales: Math.round(pendingCashSales * 100) / 100,
          digitalSales: Math.round(pendingDigitalSales * 100) / 100,
          cashLogbook: Math.round(pendingCashLogbook * 100) / 100,
          digitalLogbook: Math.round(pendingDigitalLogbook * 100) / 100,
          expectedDrawerCash: Math.round(expectedDrawer * 100) / 100,
          totalDigitalCollections: Math.round(totalDigCol * 100) / 100,
          totalSessionCollections: Math.round((totalCashCol + totalDigCol + pendingCashIn) * 100) / 100,
        },
        currentDrawerCash: Math.round(expectedDrawer * 100) / 100,
        transactions: pendingActivity.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
      }));
      return;
    }

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
        if (!isConnectionError(manualQueryErr)) {
          console.warn('Error fetching manual cash transactions, retrying service:', manualQueryErr);
        }
        try {
          rawManualTxs = await fetchSessionTransactions(session.id);
        } catch (fallbackErr) {
          if (!isConnectionError(fallbackErr)) {
            console.error('Failed to load manual cash transactions:', fallbackErr);
          }
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

      if (salesErr && !isConnectionError(salesErr)) {
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

      // 3. Receipts
      const { data: receiptsData, error: rcptErr } = await supabase
        .from('receipts')
        .select('id, customer_name, item_description, amount, payment_method, gcash_ref_no, created_at, cash_session_id')
        .or(`cash_session_id.eq.${session.id},created_at.gte.${effectiveStart}`);

      if (rcptErr && !isConnectionError(rcptErr)) {
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

      // 4. Attendance Check-Ins
      const { data: attendanceData, error: attErr } = await supabase
        .from('attendance')
        .select('id, customer_name, customer_type, plan_name, entry_fee, payment_method, gcash_ref_no, receipt_number, staff_name, check_in_time, created_at, deleted_at, cash_session_id')
        .is('deleted_at', null)
        .or(`cash_session_id.eq.${session.id},check_in_time.gte.${effectiveStart},created_at.gte.${effectiveStart}`);

      if (attErr && !isConnectionError(attErr)) {
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

      // 5. Merge pending offline transactions from vault
      try {
        const pendingTxs = await getDecryptedPendingTransactions().catch(() => []);
        for (const tx of pendingTxs) {
          if (tx.status === 'conflict') continue;
          const pl = tx.payload || {};
          const isCash =
            String(pl.payment_method || '').toLowerCase().includes('cash') &&
            !String(pl.payment_method || '').toLowerCase().includes('gcash');

          if (tx.type === 'attendance') {
            const fee = Number(pl.entry_fee || 0);
            if (fee > 0) {
              if (isCash) cashAttendance += fee;
              else digitalAttendance += fee;

              mappedAttendanceTxs.push({
                id: tx.id,
                source: 'logbook',
                type: isCash ? 'cash_in' : 'digital_in',
                displayType: isCash ? 'CHECK-IN (CASH) [OFFLINE]' : 'CHECK-IN (GCASH) [OFFLINE]',
                reason: `${pl.customer_name || 'Guest'} (${pl.customer_type || 'Walk-In'})`,
                reference_number: pl.gcash_ref_no || null,
                performed_by_name: tx.userName || 'Reception',
                amount: fee,
                created_at: tx.createdAt,
              });
            }
          } else if (tx.type === 'card_purchase' || tx.type === 'batch_card_purchase') {
            const amt = Number(pl.amount || pl.card_fee || pl.total_amount || 0);
            if (amt > 0) {
              if (isCash) cashReceipts += amt;
              else digitalReceipts += amt;

              mappedReceiptsTxs.push({
                id: tx.id,
                source: 'receipt',
                type: isCash ? 'cash_in' : 'digital_in',
                displayType: isCash ? 'CARD FEE (CASH) [OFFLINE]' : 'CARD FEE (DIGITAL) [OFFLINE]',
                reason: pl.item_description || 'Physical Membership Card Fee',
                reference_number: pl.receipt_number || null,
                performed_by_name: tx.userName || 'Reception',
                amount: amt,
                created_at: tx.createdAt,
              });
            }
          }
        }
      } catch {}

      const totalCashLogbook = cashAttendance + cashReceipts;
      const totalDigitalLogbook = digitalAttendance + digitalReceipts;

      // 6. Calculate Metrics Totals
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
      if ((typeof navigator === 'undefined' || navigator.onLine) && !isConnectionError(error)) {
        console.error('Error recalculating cash metrics:', error);
      }
    }
  },

  subscribeRealtime: () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return () => {};
    }

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
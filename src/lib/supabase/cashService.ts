// src/lib/supabase/cashService.ts
import { supabase } from './client';
import { logAudit } from './audit';
import { getServerNow, getServerISOString } from '../serverTime';
import { useOfflineSyncStore } from '../../stores/useOfflineSyncStore';
import type {
  CashSession,
  CashTransaction,
  CashTransactionType,
  DenominationCounts,
} from '../../types/cash';

const OFFLINE_ACTIVE_SESSION_KEY = 'palomar_offline_active_session';

/**
 * Fetches the currently active open cash session.
 */
export async function fetchActiveCashSession(): Promise<CashSession | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    try {
      const saved = localStorage.getItem(OFFLINE_ACTIVE_SESSION_KEY);
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('Error fetching active cash session from Supabase:', error);
      // Fallback to offline active session if network issue
      try {
        const saved = localStorage.getItem(OFFLINE_ACTIVE_SESSION_KEY);
        if (saved) return JSON.parse(saved);
      } catch (_) {}
      return null;
    }

    return (data as CashSession) || null;
  } catch (err) {
    try {
      const saved = localStorage.getItem(OFFLINE_ACTIVE_SESSION_KEY);
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return null;
  }
}

/**
 * Fetches closed sessions history.
 */
export async function fetchCashSessionHistory(limit = 20): Promise<CashSession[]> {
  const { data, error } = await supabase
    .from('cash_sessions')
    .select('*')
    .eq('status', 'closed')
    .order('closed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching cash history from Supabase:', error);
    throw error;
  }

  return (data as CashSession[]) || [];
}

/**
 * Fetches all transactions for a specific session.
 */
export async function fetchSessionTransactions(sessionId: string): Promise<CashTransaction[]> {
  const { data, error } = await supabase
    .from('cash_transactions')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching transactions from Supabase:', error);
    throw error;
  }

  return (data as CashTransaction[]) || [];
}

/**
 * Opens a new cash session safely without triggering unique constraint errors.
 */
export async function openCashSession(params: {
  openingFloat: number;
  notes?: string;
  openedBy?: string | null;
  openedByName?: string;
}): Promise<CashSession> {
  const openingFloatVal = Math.max(0, Number(params.openingFloat) || 0);
  const nowIso = getServerISOString();
  const sessionNum = `CS-${nowIso.slice(0, 10).replace(/-/g, '')}-${Math.floor(
    100 + Math.random() * 900
  )}`;

  // If offline, create local session and queue mutation
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const offlineSession: CashSession = {
      id: `offline-session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      session_number: sessionNum,
      opened_at: nowIso,
      closed_at: null,
      opened_by: params.openedBy || null,
      opened_by_name: params.openedByName || 'Staff',
      closed_by: null,
      closed_by_name: null,
      status: 'open',
      opening_float: openingFloatVal,
      closing_actual_cash: null,
      closing_expected_cash: null,
      discrepancy: null,
      notes: params.notes?.trim() || null,
      denominations: null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    try {
      localStorage.setItem(OFFLINE_ACTIVE_SESSION_KEY, JSON.stringify(offlineSession));
    } catch (_) {}

    try {
      useOfflineSyncStore.getState().enqueueMutation({
        action: 'cash_session_open',
        label: `Open Cash Session #${sessionNum} (₱${openingFloatVal.toFixed(2)})`,
        payload: { session: offlineSession },
      });
    } catch (qErr) {
      console.warn('Queueing offline cash session notice:', qErr);
    }

    return offlineSession;
  }

  // 1. Try atomic RPC first
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'open_cash_session_safe',
      {
        p_opening_float: openingFloatVal,
        p_notes: params.notes?.trim() || null,
        p_opened_by: params.openedBy || null,
        p_opened_by_name: params.openedByName || 'Admin',
      }
    );

    if (!rpcError && rpcData) {
      const session = rpcData as CashSession;
      try {
        localStorage.setItem(OFFLINE_ACTIVE_SESSION_KEY, JSON.stringify(session));
      } catch (_) {}
      await logAudit(
        'CASH_SESSION_OPEN',
        `Opened Cash Session #${session.session_number} with Opening Float of ₱${openingFloatVal.toFixed(2)}${
          params.notes ? ` (Notes: ${params.notes})` : ''
        }.`,
        session.id
      );
      return session;
    }
  } catch (rpcErr) {
    console.warn('RPC open_cash_session_safe not available, using direct fallback:', rpcErr);
  }

  // 2. Direct fallback: close existing open sessions first, then insert
  const now = getServerNow();

  // Close any lingering open session
  await supabase
    .from('cash_sessions')
    .update({
      status: 'closed',
      closed_at: now.toISOString(),
      closed_by_name: params.openedByName || 'Admin',
    })
    .eq('status', 'open');

  // Insert the new session
  const { data, error } = await supabase
    .from('cash_sessions')
    .insert([
      {
        session_number: sessionNum,
        opened_by: params.openedBy || null,
        opened_by_name: params.openedByName || 'Admin',
        status: 'open',
        opening_float: openingFloatVal,
        notes: params.notes?.trim() || null,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Failed to open cash session in Supabase:', error);
    // Offline / network failure fallback
    const offlineSession: CashSession = {
      id: `offline-session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      session_number: sessionNum,
      opened_at: nowIso,
      closed_at: null,
      opened_by: params.openedBy || null,
      opened_by_name: params.openedByName || 'Staff',
      closed_by: null,
      closed_by_name: null,
      status: 'open',
      opening_float: openingFloatVal,
      closing_actual_cash: null,
      closing_expected_cash: null,
      discrepancy: null,
      notes: params.notes?.trim() || null,
      denominations: null,
      created_at: nowIso,
      updated_at: nowIso,
    };
    try {
      localStorage.setItem(OFFLINE_ACTIVE_SESSION_KEY, JSON.stringify(offlineSession));
      useOfflineSyncStore.getState().enqueueMutation({
        action: 'cash_session_open',
        label: `Open Cash Session #${sessionNum} (₱${openingFloatVal.toFixed(2)})`,
        payload: { session: offlineSession },
      });
      return offlineSession;
    } catch (_) {}
    throw new Error(error.message || 'Failed to open cash session in database.');
  }

  if (!data) {
    throw new Error('No cash session record was created.');
  }

  const session = data as CashSession;
  try {
    localStorage.setItem(OFFLINE_ACTIVE_SESSION_KEY, JSON.stringify(session));
  } catch (_) {}

  await logAudit(
    'CASH_SESSION_OPEN',
    `Opened Cash Session #${session.session_number} with Opening Float of ₱${openingFloatVal.toFixed(2)}${
      params.notes ? ` (Notes: ${params.notes})` : ''
    }.`,
    session.id
  );

  return session;
}

/**
 * Records a Cash In, Cash Out, or Digital In transaction.
 */
export async function recordCashTransaction(params: {
  sessionId: string;
  type: CashTransactionType;
  amount: number;
  reason: string;
  referenceNumber?: string;
  performedBy?: string | null;
  performedByName?: string;
}): Promise<CashTransaction> {
  const amountVal = Math.max(0.01, Number(params.amount) || 0);

  let userId = params.performedBy;
  if (!userId) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      userId = authData?.user?.id || null;
    } catch (_) {}
  }

  const payload: any = {
    session_id: params.sessionId,
    type: params.type,
    amount: amountVal,
    reason: params.reason.trim(),
    reference_number: params.referenceNumber?.trim() || null,
    performed_by: userId,
    performed_by_name: params.performedByName || 'Staff',
  };

  // If offline, queue transaction immediately
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const offlineTx: CashTransaction = {
      id: `offline-tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      session_id: params.sessionId,
      type: params.type,
      amount: amountVal,
      reason: params.reason.trim(),
      reference_number: params.referenceNumber?.trim() || null,
      performed_by: userId || null,
      performed_by_name: params.performedByName || 'Staff',
      created_at: getServerISOString(),
    };

    try {
      useOfflineSyncStore.getState().enqueueMutation({
        action: 'cash_transaction_record',
        label: `${params.type.toUpperCase()}: ₱${amountVal.toFixed(2)} (${params.reason})`,
        payload: offlineTx,
      });
    } catch (_) {}

    return offlineTx;
  }

  const { data, error } = await supabase
    .from('cash_transactions')
    .insert([payload])
    .select()
    .maybeSingle();

  if (error) {
    console.error('Failed to record cash transaction:', error);
    // Offline fallback on network error
    const offlineTx: CashTransaction = {
      id: `offline-tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      session_id: params.sessionId,
      type: params.type,
      amount: amountVal,
      reason: params.reason.trim(),
      reference_number: params.referenceNumber?.trim() || null,
      performed_by: userId || null,
      performed_by_name: params.performedByName || 'Staff',
      created_at: getServerISOString(),
    };

    try {
      useOfflineSyncStore.getState().enqueueMutation({
        action: 'cash_transaction_record',
        label: `${params.type.toUpperCase()}: ₱${amountVal.toFixed(2)} (${params.reason})`,
        payload: offlineTx,
      });
      return offlineTx;
    } catch (_) {}
    throw new Error(error.message || 'Database error inserting cash transaction.');
  }

  const tx = (data || payload) as CashTransaction;

  const actionLabel =
    params.type === 'cash_in'
      ? 'CASH_IN'
      : params.type === 'cash_out'
      ? 'CASH_OUT'
      : 'DIGITAL_CASH_IN';

  try {
    await logAudit(
      actionLabel,
      `Recorded ${params.type.toUpperCase()}: ₱${amountVal.toFixed(2)} Reason: ${params.reason}${
        params.referenceNumber ? ` (Ref: ${params.referenceNumber})` : ''
      }.`,
      tx.id
    );
  } catch (auditErr) {
    console.warn('Audit log failed:', auditErr);
  }

  return tx;
}

/**
 * Closes an active cash session with denomination count and reconciliation.
 */
export async function closeCashSession(params: {
  sessionId: string;
  actualCash: number;
  expectedCash: number;
  discrepancy: number;
  notes?: string;
  denominations: Partial<DenominationCounts>;
  closedBy?: string | null;
  closedByName?: string;
}): Promise<CashSession> {
  const now = getServerNow();
  const nowIso = getServerISOString();

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    let savedSession: CashSession | null = null;
    try {
      const saved = localStorage.getItem(OFFLINE_ACTIVE_SESSION_KEY);
      if (saved) savedSession = JSON.parse(saved);
    } catch (_) {}

    const closedSession: CashSession = {
      id: params.sessionId,
      session_number: savedSession?.session_number || `CS-${nowIso.slice(0, 10).replace(/-/g, '')}`,
      opened_at: savedSession?.opened_at || nowIso,
      closed_at: nowIso,
      opened_by: savedSession?.opened_by || null,
      opened_by_name: savedSession?.opened_by_name || 'Staff',
      closed_by: params.closedBy || null,
      closed_by_name: params.closedByName || 'Admin',
      status: 'closed',
      opening_float: savedSession?.opening_float || 0,
      closing_actual_cash: params.actualCash,
      closing_expected_cash: params.expectedCash,
      discrepancy: params.discrepancy,
      discrepancy_reason: null,
      notes: params.notes?.trim() || null,
      denominations: params.denominations || {},
      created_at: savedSession?.created_at || nowIso,
      updated_at: nowIso,
    };

    try {
      localStorage.removeItem(OFFLINE_ACTIVE_SESSION_KEY);
      useOfflineSyncStore.getState().enqueueMutation({
        action: 'cash_session_close',
        label: `Close Cash Session: Actual ₱${params.actualCash.toFixed(2)}, Expected ₱${params.expectedCash.toFixed(2)}`,
        payload: {
          sessionId: params.sessionId,
          actualCash: params.actualCash,
          expectedCash: params.expectedCash,
          discrepancy: params.discrepancy,
          notes: params.notes,
          denominations: params.denominations,
          closedBy: params.closedBy,
          closedByName: params.closedByName,
          closedAt: nowIso,
        },
      });
    } catch (_) {}

    return closedSession;
  }

  // 1. Primary: Atomic RPC close function
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'close_cash_session_safe',
      {
        p_session_id: params.sessionId,
        p_actual_cash: params.actualCash,
        p_expected_cash: params.expectedCash,
        p_discrepancy: params.discrepancy,
        p_notes: params.notes?.trim() || null,
        p_denominations: params.denominations || {},
        p_closed_by: params.closedBy || null,
        p_closed_by_name: params.closedByName || 'Admin',
      }
    );

    if (!rpcError && rpcData) {
      const closedSession = rpcData as CashSession;
      try {
        localStorage.removeItem(OFFLINE_ACTIVE_SESSION_KEY);
      } catch (_) {}
      const discLabel =
        params.discrepancy === 0
          ? 'BALANCED'
          : params.discrepancy > 0
          ? `OVER (+₱${params.discrepancy.toFixed(2)})`
          : `CASH DISCREPANCY (-₱${Math.abs(params.discrepancy).toFixed(2)})`;

      await logAudit(
        'CASH_SESSION_CLOSE',
        `Closed Cash Session #${closedSession.session_number || params.sessionId}: Expected ₱${params.expectedCash.toFixed(
          2
        )}, Actual ₱${params.actualCash.toFixed(2)} [${discLabel}].${
          params.notes ? ` Notes: ${params.notes}` : ''
        }`,
        closedSession.id
      );

      return closedSession;
    }

    if (rpcError) {
      console.warn('RPC close_cash_session_safe failed, attempting direct table update:', rpcError);
    }
  } catch (rpcErr) {
    console.warn('RPC close_cash_session_safe call failed:', rpcErr);
  }

  // 2. Fallback: Direct Table Update via PostgREST
  const updatePayload = {
    status: 'closed' as const,
    closed_at: now.toISOString(),
    closed_by: params.closedBy || null,
    closed_by_name: params.closedByName || 'Admin',
    closing_actual_cash: params.actualCash,
    closing_expected_cash: params.expectedCash,
    discrepancy: params.discrepancy,
    discrepancy_reason: null,
    notes: params.notes?.trim() || null,
    denominations: params.denominations || {},
  };

  const { data, error } = await supabase
    .from('cash_sessions')
    .update(updatePayload)
    .eq('id', params.sessionId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Failed to close cash session in Supabase:', error);
    // Offline / network fallback
    const closedSession: CashSession = {
      id: params.sessionId,
      session_number: `CS-${nowIso.slice(0, 10).replace(/-/g, '')}`,
      opened_at: nowIso,
      closed_at: nowIso,
      opened_by: null,
      opened_by_name: 'Staff',
      closed_by: params.closedBy || null,
      closed_by_name: params.closedByName || 'Admin',
      status: 'closed',
      opening_float: 0,
      closing_actual_cash: params.actualCash,
      closing_expected_cash: params.expectedCash,
      discrepancy: params.discrepancy,
      discrepancy_reason: null,
      notes: params.notes?.trim() || null,
      denominations: params.denominations || {},
      created_at: nowIso,
      updated_at: nowIso,
    };
    try {
      localStorage.removeItem(OFFLINE_ACTIVE_SESSION_KEY);
      useOfflineSyncStore.getState().enqueueMutation({
        action: 'cash_session_close',
        label: `Close Cash Session: Actual ₱${params.actualCash.toFixed(2)}, Expected ₱${params.expectedCash.toFixed(2)}`,
        payload: {
          sessionId: params.sessionId,
          actualCash: params.actualCash,
          expectedCash: params.expectedCash,
          discrepancy: params.discrepancy,
          notes: params.notes,
          denominations: params.denominations,
          closedBy: params.closedBy,
          closedByName: params.closedByName,
          closedAt: nowIso,
        },
      });
      return closedSession;
    } catch (_) {}
    throw new Error(error.message || 'Database error closing cash session.');
  }

  // If data is null, 0 rows were updated (RLS blockage or non-existent session)
  if (!data) {
    throw new Error(
      'Database failed to close session. You may lack permission, or the session was already closed.'
    );
  }

  const closedSession = data as CashSession;
  try {
    localStorage.removeItem(OFFLINE_ACTIVE_SESSION_KEY);
  } catch (_) {}

  const discLabel =
    params.discrepancy === 0
      ? 'BALANCED'
      : params.discrepancy > 0
      ? `OVER (+₱${params.discrepancy.toFixed(2)})`
      : `CASH DISCREPANCY (-₱${Math.abs(params.discrepancy).toFixed(2)})`;

  await logAudit(
    'CASH_SESSION_CLOSE',
    `Closed Cash Session #${closedSession.session_number || params.sessionId}: Expected ₱${params.expectedCash.toFixed(
      2
    )}, Actual ₱${params.actualCash.toFixed(2)} [${discLabel}].${
      params.notes ? ` Notes: ${params.notes}` : ''
    }`,
    closedSession.id
  );

  return closedSession;
}
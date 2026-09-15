// src/lib/supabase/cashService.ts
import { supabase } from './client';
import { logAudit } from './audit';
import type {
  CashSession,
  CashTransaction,
  CashTransactionType,
  DenominationCounts,
} from '../../types/cash';

const LOCAL_STORAGE_KEY_ACTIVE = 'wolf_palomar_cash_active_session';
const LOCAL_STORAGE_KEY_HISTORY = 'wolf_palomar_cash_history_sessions';
const LOCAL_STORAGE_KEY_TXS = 'wolf_palomar_cash_transactions';

function getLocalActiveSession(): CashSession | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_ACTIVE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setLocalActiveSession(session: CashSession | null) {
  try {
    if (session) {
      localStorage.setItem(LOCAL_STORAGE_KEY_ACTIVE, JSON.stringify(session));
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEY_ACTIVE);
    }
  } catch {}
}

function getLocalHistory(): CashSession[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addLocalHistory(session: CashSession) {
  try {
    const history = getLocalHistory().filter((s) => s.id !== session.id);
    history.unshift(session);
    localStorage.setItem(LOCAL_STORAGE_KEY_HISTORY, JSON.stringify(history.slice(0, 50)));
  } catch {}
}

function getLocalTransactions(sessionId?: string): CashTransaction[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_TXS);
    const list: CashTransaction[] = raw ? JSON.parse(raw) : [];
    if (sessionId) {
      return list.filter((t) => t.session_id === sessionId);
    }
    return list;
  } catch {
    return [];
  }
}

function addLocalTransaction(tx: CashTransaction) {
  try {
    const list = getLocalTransactions();
    list.unshift(tx);
    localStorage.setItem(LOCAL_STORAGE_KEY_TXS, JSON.stringify(list.slice(0, 200)));
  } catch {}
}

/**
 * Fetches the currently active open cash session.
 */
export async function fetchActiveCashSession(): Promise<CashSession | null> {
  try {
    const { data, error } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // If table does not exist or network failed, fallback to local storage
      console.warn('Could not fetch active cash session from Supabase, checking local cache:', error.message);
      return getLocalActiveSession();
    }

    if (data) {
      setLocalActiveSession(data as CashSession);
      return data as CashSession;
    }

    // No open session in DB
    setLocalActiveSession(null);
    return null;
  } catch (err) {
    console.warn('Active cash session fetch error:', err);
    return getLocalActiveSession();
  }
}

/**
 * Fetches closed sessions history.
 */
export async function fetchCashSessionHistory(limit = 20): Promise<CashSession[]> {
  try {
    const { data, error } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('Could not fetch cash history from Supabase, using local cache:', error.message);
      return getLocalHistory().slice(0, limit);
    }

    return (data as CashSession[]) || [];
  } catch (err) {
    return getLocalHistory().slice(0, limit);
  }
}

/**
 * Fetches all transactions for a specific session.
 */
export async function fetchSessionTransactions(sessionId: string): Promise<CashTransaction[]> {
  try {
    const { data, error } = await supabase
      .from('cash_transactions')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Could not fetch transactions from Supabase, using local cache:', error.message);
      return getLocalTransactions(sessionId);
    }

    return (data as CashTransaction[]) || [];
  } catch (err) {
    return getLocalTransactions(sessionId);
  }
}

/**
 * Opens a new cash session with opening float.
 */
export async function openCashSession(params: {
  openingFloat: number;
  notes?: string;
  openedBy?: string | null;
  openedByName?: string;
}): Promise<CashSession> {
  const openingFloatVal = Math.max(0, Number(params.openingFloat) || 0);
  const nowStr = new Date().toISOString();
  const sessionNum = `CS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

  try {
    const { data, error } = await supabase
      .from('cash_sessions')
      .insert([
        {
          session_number: sessionNum,
          opened_at: nowStr,
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
      console.warn('DB session open failed, creating local fallback session:', error.message);
      const fallbackSession: CashSession = {
        id: `local-session-${Date.now()}`,
        session_number: sessionNum,
        opened_at: nowStr,
        closed_at: null,
        opened_by: params.openedBy || null,
        opened_by_name: params.openedByName || 'Admin',
        closed_by: null,
        closed_by_name: null,
        status: 'open',
        opening_float: openingFloatVal,
        closing_actual_cash: null,
        closing_expected_cash: null,
        discrepancy: null,
        discrepancy_reason: null,
        notes: params.notes?.trim() || null,
        denominations: null,
        created_at: nowStr,
        updated_at: nowStr,
      };
      setLocalActiveSession(fallbackSession);

      await logAudit(
        'CASH_SESSION_OPEN',
        `Opened Cash Session #${sessionNum} with Opening Float of ₱${openingFloatVal.toFixed(2)}${params.notes ? ` (Notes: ${params.notes})` : ''}.`,
        fallbackSession.id
      );

      return fallbackSession;
    }

    const session = data as CashSession;
    setLocalActiveSession(session);

    await logAudit(
      'CASH_SESSION_OPEN',
      `Opened Cash Session #${session.session_number} with Opening Float of ₱${openingFloatVal.toFixed(2)}${params.notes ? ` (Notes: ${params.notes})` : ''}.`,
      session.id
    );

    return session;
  } catch (err: any) {
    console.error('Failed to open cash session:', err);
    throw err;
  }
}

/**
 * Records a Cash In, Cash Out, or Digital In transaction.
 */
export async function recordCashTransaction(params: {
  sessionId: string;
  type: CashTransactionType;
  category: string;
  amount: number;
  reason: string;
  referenceNumber?: string;
  performedBy?: string | null;
  performedByName?: string;
}): Promise<CashTransaction> {
  const amountVal = Math.max(0.01, Number(params.amount) || 0);
  const nowStr = new Date().toISOString();

  try {
    const { data, error } = await supabase
      .from('cash_transactions')
      .insert([
        {
          session_id: params.sessionId,
          type: params.type,
          category: params.category,
          amount: amountVal,
          reason: params.reason.trim(),
          reference_number: params.referenceNumber?.trim() || null,
          performed_by: params.performedBy || null,
          performed_by_name: params.performedByName || 'Staff',
          created_at: nowStr,
        },
      ])
      .select()
      .single();

    if (error) {
      console.warn('DB transaction insert failed, falling back to local storage:', error.message);
      const fallbackTx: CashTransaction = {
        id: `local-tx-${Date.now()}`,
        session_id: params.sessionId,
        type: params.type,
        category: params.category,
        amount: amountVal,
        reason: params.reason.trim(),
        reference_number: params.referenceNumber?.trim() || null,
        performed_by: params.performedBy || null,
        performed_by_name: params.performedByName || 'Staff',
        created_at: nowStr,
      };
      addLocalTransaction(fallbackTx);

      const actionLabel =
        params.type === 'cash_in'
          ? 'CASH_IN'
          : params.type === 'cash_out'
            ? 'CASH_OUT'
            : 'DIGITAL_CASH_IN';

      await logAudit(
        actionLabel,
        `Recorded ${params.type.toUpperCase()}: ₱${amountVal.toFixed(2)} [Category: ${params.category}] Reason: ${params.reason}${params.referenceNumber ? ` (Ref: ${params.referenceNumber})` : ''}.`,
        fallbackTx.id
      );

      return fallbackTx;
    }

    const tx = data as CashTransaction;
    addLocalTransaction(tx);

    const actionLabel =
      params.type === 'cash_in'
        ? 'CASH_IN'
        : params.type === 'cash_out'
          ? 'CASH_OUT'
          : 'DIGITAL_CASH_IN';

    await logAudit(
      actionLabel,
      `Recorded ${params.type.toUpperCase()}: ₱${amountVal.toFixed(2)} [Category: ${params.category}] Reason: ${params.reason}${params.referenceNumber ? ` (Ref: ${params.referenceNumber})` : ''}.`,
      tx.id
    );

    return tx;
  } catch (err: any) {
    console.error('Failed to record cash transaction:', err);
    throw err;
  }
}

/**
 * Closes an active cash session with denomination count and reconciliation.
 */
export async function closeCashSession(params: {
  sessionId: string;
  actualCash: number;
  expectedCash: number;
  discrepancy: number;
  discrepancyReason?: string;
  notes?: string;
  denominations: Partial<DenominationCounts>;
  closedBy?: string | null;
  closedByName?: string;
}): Promise<CashSession> {
  const nowStr = new Date().toISOString();

  try {
    const updatePayload = {
      status: 'closed' as const,
      closed_at: nowStr,
      closed_by: params.closedBy || null,
      closed_by_name: params.closedByName || 'Admin',
      closing_actual_cash: params.actualCash,
      closing_expected_cash: params.expectedCash,
      discrepancy: params.discrepancy,
      discrepancy_reason: params.discrepancyReason?.trim() || null,
      notes: params.notes?.trim() || null,
      denominations: params.denominations,
      updated_at: nowStr,
    };

    const { data, error } = await supabase
      .from('cash_sessions')
      .update(updatePayload)
      .eq('id', params.sessionId)
      .select()
      .single();

    let closedSession: CashSession;

    if (error) {
      console.warn('DB session close failed, updating local cache:', error.message);
      const active = getLocalActiveSession();
      closedSession = {
        ...(active || {
          id: params.sessionId,
          session_number: 'CS-UNKNOWN',
          opened_at: nowStr,
          opened_by: null,
          opened_by_name: 'Admin',
          opening_float: 0,
          created_at: nowStr,
        }),
        ...updatePayload,
      } as CashSession;
    } else {
      closedSession = data as CashSession;
    }

    setLocalActiveSession(null);
    addLocalHistory(closedSession);

    const discLabel =
      params.discrepancy === 0
        ? 'BALANCED'
        : params.discrepancy > 0
          ? `OVER (+₱${params.discrepancy.toFixed(2)})`
          : `SHORT (-₱${Math.abs(params.discrepancy).toFixed(2)})`;

    await logAudit(
      'CASH_SESSION_CLOSE',
      `Closed Cash Session #${closedSession.session_number}: Expected ₱${params.expectedCash.toFixed(2)}, Actual ₱${params.actualCash.toFixed(2)} [${discLabel}].${params.discrepancyReason ? ` Discrepancy Reason: ${params.discrepancyReason}` : ''}`,
      closedSession.id
    );

    return closedSession;
  } catch (err: any) {
    console.error('Failed to close cash session:', err);
    throw err;
  }
}

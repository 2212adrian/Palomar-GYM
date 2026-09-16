// src/lib/supabase/cashService.ts
import { supabase } from './client';
import { logAudit } from './audit';
import type {
  CashSession,
  CashTransaction,
  CashTransactionType,
  DenominationCounts,
} from '../../types/cash';

/**
 * Fetches the currently active open cash session.
 */
export async function fetchActiveCashSession(): Promise<CashSession | null> {
  const { data, error } = await supabase
    .from('cash_sessions')
    .select('*')
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching active cash session from Supabase:', error);
    throw error;
  }

  return (data as CashSession) || null;
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
  const nowStr = new Date().toISOString();
  const sessionNum = `CS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
    100 + Math.random() * 900
  )}`;

  // Close any lingering open session
  await supabase
    .from('cash_sessions')
    .update({
      status: 'closed',
      closed_at: nowStr,
      closed_by_name: params.openedByName || 'Admin',
      updated_at: nowStr,
    })
    .eq('status', 'open');

  // Insert the new session
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
    console.error('Failed to open cash session in Supabase:', error);
    throw error;
  }

  const session = data as CashSession;

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
  const nowStr = new Date().toISOString();

  // Get current auth user if not provided
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
    created_at: nowStr,
  };

  const { data, error } = await supabase
    .from('cash_transactions')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('Failed to record cash transaction:', error);
    throw new Error(error.message || 'Database error inserting cash transaction.');
  }

  const tx = data as CashTransaction;

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
  const nowStr = new Date().toISOString();

  const updatePayload = {
    status: 'closed' as const,
    closed_at: nowStr,
    closed_by: params.closedBy || null,
    closed_by_name: params.closedByName || 'Admin',
    closing_actual_cash: params.actualCash,
    closing_expected_cash: params.expectedCash,
    discrepancy: params.discrepancy,
    discrepancy_reason: null,
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

  if (error) {
    console.error('Failed to close cash session:', error);
    throw error;
  }

  const closedSession = data as CashSession;

  const discLabel =
    params.discrepancy === 0
      ? 'BALANCED'
      : params.discrepancy > 0
      ? `OVER (+₱${params.discrepancy.toFixed(2)})`
      : `CASH DISCREPANCY (-₱${Math.abs(params.discrepancy).toFixed(2)})`;

  await logAudit(
    'CASH_SESSION_CLOSE',
    `Closed Cash Session #${closedSession.session_number}: Expected ₱${params.expectedCash.toFixed(
      2
    )}, Actual ₱${params.actualCash.toFixed(2)} [${discLabel}].${
      params.notes ? ` Notes: ${params.notes}` : ''
    }`,
    closedSession.id
  );

  return closedSession;
}
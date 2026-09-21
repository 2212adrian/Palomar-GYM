// src/lib/supabase/cashService.ts
import { supabase } from './client';
import { logAudit } from './audit';
import { getServerNow } from '../serverTime';
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

  if (error && error.code !== 'PGRST116') {
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
  const now = getServerNow();
  const sessionNum = `CS-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
    100 + Math.random() * 900
  )}`;

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
    throw new Error(error.message || 'Failed to open cash session in database.');
  }

  if (!data) {
    throw new Error('No cash session record was created.');
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

  const { data, error } = await supabase
    .from('cash_transactions')
    .insert([payload])
    .select()
    .maybeSingle();

  if (error) {
    console.error('Failed to record cash transaction:', error);
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
    throw new Error(error.message || 'Database error closing cash session.');
  }

  // If data is null, 0 rows were updated (RLS blockage or non-existent session)
  if (!data) {
    throw new Error(
      'Database failed to close session. You may lack permission, or the session was already closed.'
    );
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
    `Closed Cash Session #${closedSession.session_number || params.sessionId}: Expected ₱${params.expectedCash.toFixed(
      2
    )}, Actual ₱${params.actualCash.toFixed(2)} [${discLabel}].${
      params.notes ? ` Notes: ${params.notes}` : ''
    }`,
    closedSession.id
  );

  return closedSession;
}
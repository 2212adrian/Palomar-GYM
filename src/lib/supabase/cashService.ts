import { supabase } from './client';
import { logAudit } from './audit';
import { stagePendingTransaction } from '../offlineVault';
import type {
  CashSession,
  CashTransaction,
  CashTransactionType,
  CashTransactionStatus,
  DenominationCounts,
} from '../../types/cash';

const assertOnline = () => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('No internet connection. Cash drawer operations require an active network connection.');
  }
};

/**
 * Fetches the currently active open cash session.
 */
export async function fetchActiveCashSession(): Promise<CashSession | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return null;
  }

  const { data, error } = await supabase
    .from('cash_sessions')
    .select('*')
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.warn('Error fetching active cash session from Supabase:', error);
    return null;
  }

  return (data as CashSession) || null;
}

/**
 * Fetches closed sessions history.
 */
export async function fetchCashSessionHistory(limit = 20): Promise<CashSession[]> {
  assertOnline();
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
  assertOnline();
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
 * Opens a new cash session safely. Fails if offline.
 */
export async function openCashSession(params: {
  openingFloat: number;
  notes?: string;
  openedBy?: string | null;
  openedByName?: string;
}): Promise<CashSession> {
  assertOnline();

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
  } catch (rpcErr: any) {
    throw new Error(rpcErr?.message || 'Failed to open cash session via secure RPC.');
  }

  throw new Error('Failed to open cash session in database.');
}

/**
 * Records a Cash In, Cash Out, or Digital In transaction.
 * Queues in encrypted local vault if offline during an active session.
 */
export async function recordCashTransaction(params: {
  sessionId: string;
  type: CashTransactionType;
  amount: number;
  reason: string;
  referenceNumber?: string;
  performedBy?: string | null;
  performedByName?: string;
  status?: CashTransactionStatus;
  approvedBy?: string | null;
  approvedByName?: string | null;
}): Promise<CashTransaction> {
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  const amountVal = Math.max(0.01, Number(params.amount) || 0);

  let userId = params.performedBy;
  if (!userId) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      userId = authData?.user?.id || null;
    } catch (_) {}
  }

  const txStatus: CashTransactionStatus = params.status || 'completed';

  const payload: any = {
    session_id: params.sessionId,
    type: params.type,
    amount: amountVal,
    reason: params.reason.trim(),
    reference_number: params.referenceNumber?.trim() || null,
    performed_by: userId,
    performed_by_name: params.performedByName || 'Staff',
    status: txStatus,
    approved_by: params.approvedBy || null,
    approved_by_name: params.approvedByName || null,
    approved_at: params.approvedBy ? new Date().toISOString() : null,
    is_voided: false,
  };

  if (isOffline) {
    const offlineId = `offline_tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const nowIso = new Date().toISOString();
    const offlineTx: CashTransaction = {
      id: offlineId,
      session_id: params.sessionId,
      type: params.type,
      amount: amountVal,
      reason: params.reason.trim(),
      reference_number: params.referenceNumber?.trim() || null,
      performed_by: userId || null,
      performed_by_name: params.performedByName || 'Staff',
      status: txStatus,
      approved_by: params.approvedBy || null,
      approved_by_name: params.approvedByName || null,
      approved_at: params.approvedBy ? nowIso : null,
      is_voided: false,
      created_at: nowIso,
    };

    await stagePendingTransaction({
      type: 'cash_transaction',
      cashSessionId: params.sessionId,
      userId: userId || 'offline_user',
      userName: params.performedByName || 'Staff',
      payload: {
        ...payload,
        created_at: nowIso,
      },
    });

    return offlineTx;
  }

  const { data, error } = await supabase
    .from('cash_transactions')
    .insert([payload])
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Database error inserting cash transaction.');
  }

  const tx = (data || payload) as CashTransaction;
  const actionLabel =
    txStatus === 'pending'
      ? `${params.type.toUpperCase()}_REQUEST`
      : params.type === 'cash_in'
      ? 'CASH_IN'
      : params.type === 'cash_out'
      ? 'CASH_OUT'
      : 'DIGITAL_CASH_IN';

  try {
    await logAudit(
      actionLabel,
      `${txStatus === 'pending' ? 'Requested' : 'Recorded'} ${params.type.toUpperCase()}: ₱${amountVal.toFixed(2)} Reason: ${params.reason}${
        params.referenceNumber ? ` (Ref: ${params.referenceNumber})` : ''
      }${txStatus === 'pending' ? ' [Awaiting Admin Approval]' : ''}.`,
      tx.id
    );
  } catch (auditErr) {
    console.warn('Audit log failed:', auditErr);
  }

  return tx;
}

/**
 * Approves a pending cash transaction (Admin Only).
 */
export async function approveCashTransaction(params: {
  transactionId: string;
  adminId?: string | null;
  adminName?: string;
}): Promise<void> {
  assertOnline();

  const shortTxId =
    params.transactionId.length > 8
      ? params.transactionId.slice(0, 8).toUpperCase()
      : params.transactionId;

  const { error: rpcError } = await supabase.rpc('approve_cash_transaction', {
    p_transaction_id: params.transactionId,
    p_admin_id: params.adminId || null,
    p_admin_name: params.adminName || 'Admin',
  });

  if (rpcError) {
    throw new Error(rpcError.message || 'Failed to approve cash transaction.');
  }

  await logAudit(
    'CASH_TRANSACTION_APPROVED',
    `Approved Cash Transaction #${shortTxId} by ${params.adminName || 'Admin'}.`,
    params.transactionId
  );
}

/**
 * Rejects a pending cash transaction (Admin Only).
 */
export async function rejectCashTransaction(params: {
  transactionId: string;
  reason: string;
  adminId?: string | null;
  adminName?: string;
}): Promise<void> {
  assertOnline();

  const shortTxId =
    params.transactionId.length > 8
      ? params.transactionId.slice(0, 8).toUpperCase()
      : params.transactionId;

  const { error: rpcError } = await supabase.rpc('reject_cash_transaction', {
    p_transaction_id: params.transactionId,
    p_admin_id: params.adminId || null,
    p_admin_name: params.adminName || 'Admin',
    p_reason: params.reason.trim(),
  });

  if (rpcError) {
    throw new Error(rpcError.message || 'Failed to reject cash transaction.');
  }

  await logAudit(
    'CASH_TRANSACTION_REJECTED',
    `Rejected Cash Transaction #${shortTxId} by ${params.adminName || 'Admin'}: ${params.reason.trim()}`,
    params.transactionId
  );
}

/**
 * Voids an active transaction and reverts its impact on drawer calculations (Admin Only).
 */
export async function voidCashTransaction(params: {
  transactionId: string;
  reason: string;
  adminId?: string | null;
  adminName?: string;
  activityDescription?: string;
  amount?: number;
  type?: string;
}): Promise<void> {
  assertOnline();

  if (!params.reason || params.reason.trim().length < 5) {
    throw new Error('Please provide a specific reason of at least 5 characters for voiding.');
  }

  let activityDesc = params.activityDescription?.trim();
  let txAmount = params.amount;
  let txType = params.type;

  // If activity description was not provided, look it up from database
  if (!activityDesc) {
    try {
      const { data: txData } = await supabase
        .from('cash_transactions')
        .select('reason, amount, type')
        .eq('id', params.transactionId)
        .maybeSingle();

      if (txData) {
        activityDesc = txData.reason;
        if (txAmount === undefined) txAmount = Number(txData.amount);
        if (!txType) txType = txData.type;
      }
    } catch (_) {}
  }

  const shortTxId =
    params.transactionId.length > 8
      ? params.transactionId.slice(0, 8).toUpperCase()
      : params.transactionId;

  const activityPart = activityDesc ? ` • Activity: "${activityDesc}"` : '';
  const amountPart =
    txAmount !== undefined && !isNaN(txAmount)
      ? ` (₱${Number(txAmount).toFixed(2)})`
      : '';
  const logDetails = `Voided cash transaction #${shortTxId} by ${
    params.adminName || 'Admin'
  }${activityPart}${amountPart} — Reason: ${params.reason.trim()}`;

  const { error: rpcError } = await supabase.rpc('void_cash_transaction', {
    p_transaction_id: params.transactionId,
    p_admin_id: params.adminId || null,
    p_admin_name: params.adminName || 'Admin',
    p_reason: params.reason.trim(),
  });

  if (rpcError) {
    throw new Error(rpcError.message || 'Failed to void cash transaction.');
  }

  await logAudit(
    'CASH_TRANSACTION_VOIDED',
    logDetails,
    params.transactionId
  );
}

/**
 * Verifies supervisor / admin credentials for on-duty overrides.
 */
export async function verifyAdminPassword(email: string, password: string): Promise<boolean> {
  assertOnline();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  return !error && Boolean(data.user);
}

/**
 * Closes an active cash session. Fails if offline.
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
  assertOnline();

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

  if (rpcError || !rpcData) {
    throw new Error(rpcError?.message || 'Database error closing cash session.');
  }

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
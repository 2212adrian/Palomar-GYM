// src/hooks/useSessionLock.ts
import { useCashSessionStore } from '../stores/useCashSessionStore';
import { supabase } from '../lib/supabase/client';

export const SESSION_LOCKED_REASON =
  'Cash session is closed. Open a cash session in Cash Management to perform transactions or modify revenue.';

export const getSessionLockedMessage = (action: string = 'perform this action'): string =>
  `Cash session is closed. Open a cash session in Cash Management to ${action}.`;

export const useSessionLock = () => {
  const { isSessionOpen, activeSessionId, isInitializing } = useCashSessionStore();
  const isLocked = !isSessionOpen;

  return {
    isSessionOpen,
    isLocked,
    isInitializing,
    activeSessionId,
    lockReason: SESSION_LOCKED_REASON,
    getLockReason: getSessionLockedMessage,
  };
};

/**
 * Backend / Service layer guard to prevent transactions when cash session is closed.
 * Validates that an active cash session exists both in memory and in the database.
 * Throws an Error if the session is closed.
 */
export const assertActiveCashSession = async (actionDesc: string = 'process transaction'): Promise<string> => {
  const storeState = useCashSessionStore.getState();
  if (!storeState.isSessionOpen) {
    throw new Error(
      `Transaction restricted: Cash session is closed. Please open a cash session in Cash Management to ${actionDesc}.`
    );
  }

  const { data, error } = await supabase
    .from('cash_sessions')
    .select('id')
    .eq('status', 'open')
    .is('closed_at', null)
    .maybeSingle();

  if (error || !data) {
    storeState.setSessionClosed();
    throw new Error(
      `Transaction restricted: No active cash drawer session found in database. Please open a cash session in Cash Management to ${actionDesc}.`
    );
  }

  return data.id;
};
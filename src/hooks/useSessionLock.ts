// src/hooks/useSessionLock.ts
import { useCashSessionStore } from '../stores/useCashSessionStore';
import { supabase } from '../lib/supabase/client';

export const SESSION_LOCKED_REASON =
  'Cash session is closed. Open a cash session in Cash Management to perform transactions or modify revenue.';

export const getSessionLockedMessage = (action: string = 'perform this action'): string => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'No internet connection. Cash session is closed until internet is restored.';
  }
  return `Cash session is closed. Open a cash session in Cash Management to ${action}.`;
};

export const useSessionLock = () => {
  const { isSessionOpen, activeSessionId, isInitializing, wasSuspendedByOffline } =
    useCashSessionStore();

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const isLocked = !isSessionOpen || isOffline;

  return {
    isSessionOpen,
    isLocked,
    isInitializing,
    activeSessionId,
    wasSuspendedByOffline,
    lockReason: isOffline
      ? 'No internet connection. Cash session is closed until internet is restored.'
      : SESSION_LOCKED_REASON,
    getLockReason: getSessionLockedMessage,
  };
};

/**
 * Backend / Service layer guard to prevent transactions when cash session is closed or offline.
 */
export const assertActiveCashSession = async (actionDesc: string = 'process transaction'): Promise<string> => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error(
      `Transaction restricted: No internet connection. Cash session is closed until connection is restored.`
    );
  }

  const storeState = useCashSessionStore.getState();
  if (!storeState.isSessionOpen) {
    throw new Error(
      `Transaction restricted: Cash session is closed. Please open a cash session in Cash Management to ${actionDesc}.`
    );
  }

  try {
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
  } catch (err: any) {
    throw err;
  }
};
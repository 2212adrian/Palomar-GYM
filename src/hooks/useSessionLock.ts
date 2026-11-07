// src/hooks/useSessionLock.ts
import { useCallback, useMemo } from 'react';
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
  const {
    isSessionOpen,
    activeSessionId,
    isInitializing,
    wasSuspendedByOffline,
    canProcessOfflineTransactions,
  } = useCashSessionStore();

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const canOffline = canProcessOfflineTransactions ? canProcessOfflineTransactions() : false;
  const effectiveSessionOpen = isSessionOpen || canOffline;
  const isLocked = !effectiveSessionOpen;

  const getLockReason = useCallback(
    (action: string = 'perform this action') => {
      if (isLocked) {
        if (isOffline) {
          return 'No internet connection and no active cash session. Open a session online first.';
        }
        return `Cash session is closed. Open a cash session in Cash Management to ${action}.`;
      }
      return '';
    },
    [isLocked, isOffline]
  );

  return useMemo(
    () => ({
      isSessionOpen: effectiveSessionOpen,
      isLocked,
      isInitializing,
      activeSessionId,
      wasSuspendedByOffline,
      lockReason: isLocked
        ? isOffline
          ? 'No internet connection and no open cash session. Cash drawer must be opened online first.'
          : SESSION_LOCKED_REASON
        : '',
      getLockReason,
    }),
    [effectiveSessionOpen, isLocked, isInitializing, activeSessionId, wasSuspendedByOffline, isOffline, getLockReason]
  );
};

/**
 * Backend / Service layer guard to prevent transactions when cash session is closed or offline without an active session.
 */
export const assertActiveCashSession = async (actionDesc: string = 'process transaction'): Promise<string> => {
  const storeState = useCashSessionStore.getState();
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  if (isOffline) {
    if (storeState.isSessionOpen || storeState.canProcessOfflineTransactions()) {
      const sessionId = storeState.getLastKnownSessionId() || storeState.activeSessionId;
      if (sessionId) {
        return sessionId;
      }
    }
    throw new Error(
      `Transaction restricted: No active cash drawer session found for offline operations. Please connect to internet to open a drawer session.`
    );
  }

  if (!storeState.isSessionOpen) {
    throw new Error(
      `Transaction restricted: Cash session is closed. Please open a cash session in Cash Management to ${actionDesc}.`
    );
  }

  if (storeState.activeSessionId) {
    return storeState.activeSessionId;
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
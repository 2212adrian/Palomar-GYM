// src/lib/backgroundSyncService.ts
import { toast } from 'react-toastify';
import { Network } from '@capacitor/network';
import { supabase } from './supabase/client'; 
import { useCashSessionStore } from '../stores/useCashSessionStore';
import { useAuthStore } from '../stores/authStore';
import {
  getDecryptedPendingTransactions,
  purgeTransactionsByIds,
  markPendingConflict,
} from './offlineVault';

let isInitialized = false;
let isCurrentlyOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
let offlineDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let onlinePollTimer: ReturnType<typeof setInterval> | null = null;
let isHandlingOnline = false;
let lastRestoredToastTimestamp = 0;
const RESTORED_COOLDOWN_MS = 8000;

export interface SyncResult {
  syncedCount: number;
  conflictCount: number;
  droppedCount: number;
}

/**
 * Executes full reconciliation and sync of local encrypted vault against Supabase.
 */
export async function executeOfflineSync(): Promise<SyncResult> {
  const result: SyncResult = { syncedCount: 0, conflictCount: 0, droppedCount: 0 };

  // 1. Check if Supabase has an active, OPEN cash session
  let activeSessionId: string | null = null;
  try {
    const { data: sessionData, error: sessionErr } = await supabase
      .from('cash_sessions')
      .select('id, status, opened_at')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sessionErr && sessionData) {
      activeSessionId = sessionData.id;
    }
  } catch (err) {
    console.warn('Failed to query cloud cash session status:', err);
  }

  // 2. Fetch and decrypt all pending records (automatically verifies SHA-256 integrity)
  const pendingList = await getDecryptedPendingTransactions();
  if (pendingList.length === 0) {
    return result;
  }

  const CASH_TYPES = ['sale', 'attendance', 'subscription', 'card_purchase'];

  // Rule: Cash management only works if opened. If closed, drop pending cash transactions.
  if (!activeSessionId) {
    const cashDropItems = pendingList.filter((p) => CASH_TYPES.includes(p.type));
    if (cashDropItems.length > 0) {
      console.warn('[Sync] No active cash session in cloud database. Dropping cash transactions.');
      const dropIds = cashDropItems.map((p) => p.id);
      await purgeTransactionsByIds(dropIds);
      result.droppedCount += dropIds.length;

      toast.error(
        'Internet connection restored, but no open cash session exists in the system. Offline pending cash transactions have been discarded.',
        { toastId: 'offline-dropped-no-session', autoClose: 7000 }
      );
    }
  }

  const successfullySyncedIds: string[] = [];

  for (const item of pendingList) {
    try {
      if (CASH_TYPES.includes(item.type) && !activeSessionId) {
        continue;
      }
      // ─── A. SALE TRANSACTIONS ───
      if (item.type === 'sale') {
        const payload = item.payload;
        let hasStockConflict = false;
        let conflictCloudStock: any = null;

        // Check stock availability in Supabase if products have tracked stock
        if (payload.items && Array.isArray(payload.items)) {
          for (const lineItem of payload.items) {
            const pId = lineItem.productId || lineItem.product_id;
            if (pId) {
              const { data: cloudProd } = await supabase
                .from('products')
                .select('id, name, stock')
                .eq('id', pId)
                .maybeSingle();

              if (cloudProd && typeof cloudProd.stock === 'number') {
                if (cloudProd.stock < lineItem.quantity) {
                  hasStockConflict = true;
                  conflictCloudStock = {
                    productId: pId,
                    product_name: cloudProd.name,
                    current_stock: cloudProd.stock,
                    requested: lineItem.quantity,
                  };
                  break;
                }
              }
            }
          }
        } else if (payload.product_id) {
          const { data: cloudProd } = await supabase
            .from('products')
            .select('id, name, stock')
            .eq('id', payload.product_id)
            .maybeSingle();

          if (cloudProd && typeof cloudProd.stock === 'number') {
            const reqQty = Number(payload.quantity || 1);
            if (cloudProd.stock < reqQty) {
              hasStockConflict = true;
              conflictCloudStock = {
                productId: payload.product_id,
                product_name: cloudProd.name,
                current_stock: cloudProd.stock,
                requested: reqQty,
              };
            }
          }
        }

        if (hasStockConflict) {
          await markPendingConflict(item.id, 'insufficient_stock', conflictCloudStock);
          result.conflictCount++;
          continue;
        }

        // Clean payload & insert into Supabase sales table
        const saleRecord = {
          ...payload,
          cash_session_id: activeSessionId,
          created_at: payload.created_at || item.createdAt,
        };
        // Remove client-only fields
        delete (saleRecord as any).sync_status;

        const { error: insertErr } = await supabase.from('sales').insert([saleRecord]);
        if (insertErr) throw insertErr;

        successfullySyncedIds.push(item.id);
        result.syncedCount++;
        continue;
      }

      // ─── B. ATTENDANCE & CHECK-INS ───
      if (item.type === 'attendance') {
        const payload = item.payload;

        // Check for duplicate attendance on the same calendar day
        const txDate = (payload.check_in_time || item.createdAt).substring(0, 10);
        let duplicateCheck = null;

        if (payload.customer_name) {
          const { data: existing } = await supabase
            .from('attendance')
            .select('id, customer_name, check_in_time, plan_name')
            .eq('customer_name', payload.customer_name.trim())
            .gte('check_in_time', `${txDate}T00:00:00.000Z`)
            .lte('check_in_time', `${txDate}T23:59:59.999Z`)
            .is('deleted_at', null)
            .limit(1)
            .maybeSingle();

          duplicateCheck = existing;
        }

        if (duplicateCheck) {
          await markPendingConflict(item.id, 'duplicate_attendance', duplicateCheck);
          result.conflictCount++;
          continue;
        }

        const attendanceRecord = {
          ...payload,
          cash_session_id: activeSessionId,
          check_in_time: payload.check_in_time || item.createdAt,
          created_at: payload.created_at || item.createdAt,
        };
        delete (attendanceRecord as any).sync_status;

        const { error: attInsertErr } = await supabase
          .from('attendance')
          .insert([attendanceRecord]);
        if (attInsertErr) throw attInsertErr;

        successfullySyncedIds.push(item.id);
        result.syncedCount++;
        continue;
      }

      // ─── C. SUBSCRIPTIONS ───
      if (item.type === 'subscription') {
        const payload = item.payload;
        const subRecord = {
          ...payload,
          cash_session_id: activeSessionId,
          created_at: payload.created_at || item.createdAt,
        };
        delete (subRecord as any).sync_status;

        const { error: subErr } = await supabase
          .from('subscriptions')
          .insert([subRecord]);
        if (subErr) throw subErr;

        successfullySyncedIds.push(item.id);
        result.syncedCount++;
        continue;
      }

      // ─── D. CARD PURCHASES & BATCH PURCHASES ───
      if (item.type === 'card_purchase') {
        const payload = item.payload;
        const nowIso = new Date().toISOString();
        const feePaid = Number(payload.amount || payload.card_fee || payload.card_fee_paid || 0);

        if (payload.member_id) {
          try {
            const { data: existingCard } = await supabase
              .from('cards')
              .select('id, member_id')
              .eq('member_id', payload.member_id)
              .maybeSingle();

            if (existingCard) {
              await supabase
                .from('cards')
                .update({
                  payment_status: 'PAID',
                  claim_status: 'UNCLAIMED',
                  card_fee_paid: feePaid,
                  receipt_number: payload.receipt_number,
                  updated_at: nowIso,
                })
                .eq('member_id', payload.member_id);
            } else {
              const expDate = new Date();
              expDate.setFullYear(expDate.getFullYear() + 3);
              await supabase.from('cards').insert([
                {
                  member_id: payload.member_id,
                  card_number: payload.card_number || crypto.randomUUID(),
                  card_type: 'QR',
                  status: 'Active',
                  version: 1,
                  payment_status: 'PAID',
                  claim_status: 'UNCLAIMED',
                  card_fee_paid: feePaid,
                  receipt_number: payload.receipt_number,
                  issued_at: nowIso,
                  expires_at: expDate.toISOString(),
                  updated_at: nowIso,
                },
              ]);
            }
          } catch (cardSyncErr) {
            console.warn('Card record sync error:', cardSyncErr);
          }
        }

        if (payload.receipt_number || feePaid > 0) {
          const cardReceipt = {
            id: payload.receipt_number || `RCPT-CARD-${Date.now()}`,
            member_id: payload.member_id,
            customer_name: payload.customer_name || 'Member',
            customer_type: 'Physical Card',
            amount: feePaid,
            base_price: 0,
            gcash_fee: 0,
            card_fee: feePaid,
            gcash_ref_no: payload.gcash_ref_no || null,
            payment_method: payload.payment_method || 'Cash',
            payment_status: 'Paid',
            item_description: payload.item_description || 'Physical Membership Card Fee',
            cash_session_id: activeSessionId,
            created_at: payload.created_at || item.createdAt,
          };
          try {
            await supabase.from('receipts').insert([cardReceipt]);
          } catch (rcptSyncErr) {
            console.warn('Card receipt sync error:', rcptSyncErr);
          }
        }

        successfullySyncedIds.push(item.id);
        result.syncedCount++;
        continue;
      }

      if (item.type === 'batch_card_purchase') {
        const payload = item.payload;
        try {
          await supabase.rpc('batch_purchase_member_cards', {
            p_member_ids: payload.member_ids,
            p_payment_method: payload.payment_method,
            p_card_fee: payload.fee_per_card,
            p_gcash_ref_no: payload.gcash_ref_no || null,
            p_staff_name: payload.staff_name || item.userName || 'Staff',
          });
        } catch (rpcErr) {
          console.warn('Batch card purchase sync notice:', rpcErr);
        }

        successfullySyncedIds.push(item.id);
        result.syncedCount++;
        continue;
      }

      // ─── E. PRODUCT CREATION ───
      if (item.type === 'product_create') {
        const payload = { ...item.payload };
        delete (payload as any).sync_status;
        delete (payload as any).id;
        const { error: prodErr } = await supabase
          .from('products')
          .insert([payload]);
        if (prodErr) throw prodErr;

        successfullySyncedIds.push(item.id);
        result.syncedCount++;
        continue;
      }

      // ─── F. INCIDENT REPORT CREATION ───
      if (item.type === 'incident_create') {
        const payload = { ...item.payload };
        delete (payload as any).sync_status;
        delete (payload as any).id;
        const { error: incErr } = await supabase
          .from('incident_reports')
          .insert([payload]);
        if (incErr) throw incErr;

        successfullySyncedIds.push(item.id);
        result.syncedCount++;
        continue;
      }

      // ─── G. INCIDENT REPORT STATUS UPDATE ───
      if (item.type === 'incident_update') {
        const reportId = item.payload.id;
        const updates = item.payload.updates
          ? { ...item.payload.updates }
          : { ...item.payload };
        delete (updates as any).id;
        delete (updates as any).sync_status;

        if (reportId && Object.keys(updates).length > 0) {
          const { error: updErr } = await supabase
            .from('incident_reports')
            .update(updates)
            .eq('id', reportId);
          if (updErr) {
            console.warn('Incident update sync notice:', updErr);
          }
        }

        successfullySyncedIds.push(item.id);
        result.syncedCount++;
        continue;
      }

      // ─── H. MEMBER PROFILE CREATION ───
      if (item.type === 'member_create') {
        const payload = { ...item.payload };
        delete (payload as any).sync_status;
        const { error: memErr } = await supabase
          .from('members')
          .insert([payload]);
        if (memErr) throw memErr;

        successfullySyncedIds.push(item.id);
        result.syncedCount++;
        continue;
      }

      // ─── I. MEMBER PROFILE UPDATE ───
      if (item.type === 'member_update') {
        const { id: memId, updates } = item.payload;
        if (memId && updates) {
          const isUuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(memId);
          const { error: updErr } = await supabase
            .from('members')
            .update(updates)
            .eq(isUuidFormat ? 'id' : 'member_id', memId);
          if (updErr) throw updErr;
        }

        successfullySyncedIds.push(item.id);
        result.syncedCount++;
        continue;
      }
    } catch (txErr) {
      console.warn(`[Sync] Error syncing transaction ${item.id}:`, txErr);
    }
  }

  // Purge all successfully written items immediately from IndexedDB
  if (successfullySyncedIds.length > 0) {
    await purgeTransactionsByIds(successfullySyncedIds);
  }

  // Dispatch global custom event for reactive UI updates
  window.dispatchEvent(new CustomEvent('palomar:sync-updated'));

  return result;
}

/**
 * Handles Admin conflict resolution action
 */
export async function resolveConflictAction(
  id: string,
  action: 'keep_offline' | 'keep_cloud' | 'drop_both'
): Promise<void> {
  const pending = await getDecryptedPendingTransactions();
  const target = pending.find((p) => p.id === id);

  if (!target) {
    await purgeTransactionsByIds([id]);
    return;
  }

  if (action === 'drop_both' || action === 'keep_cloud') {
    // Drop offline transaction from vault
    await purgeTransactionsByIds([id]);
    toast.info('Offline transaction discarded.');
    window.dispatchEvent(new CustomEvent('palomar:sync-updated'));
    return;
  }

  if (action === 'keep_offline') {
    // Force insert into Supabase
    try {
      const activeSession = useCashSessionStore.getState().activeSession;
      const sessionId = activeSession?.id || target.cashSessionId;

      if (target.type === 'sale') {
        const saleRecord = {
          ...target.payload,
          cash_session_id: sessionId,
        };
        delete (saleRecord as any).sync_status;
        await supabase.from('sales').insert([saleRecord]);
      } else if (target.type === 'attendance') {
        const attRecord = {
          ...target.payload,
          cash_session_id: sessionId,
        };
        delete (attRecord as any).sync_status;
        await supabase.from('attendance').insert([attRecord]);
      }

      await purgeTransactionsByIds([id]);
      toast.success('Offline record synchronized to database.');
      window.dispatchEvent(new CustomEvent('palomar:sync-updated'));
    } catch (err: any) {
      toast.error(`Failed to force sync: ${err.message}`);
    }
  }
}

/**
 * Background network listener & automated sync initialization
 */
export function initBackgroundSyncService(): () => void {
  if (typeof window === 'undefined' || isInitialized) {
    return () => {};
  }
  isInitialized = true;

  const stopPolling = () => {
    if (onlinePollTimer) {
      clearInterval(onlinePollTimer);
      onlinePollTimer = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    onlinePollTimer = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        handleOnline();
      }
    }, 2000);
  };

  const handleOnline = async () => {
    if (offlineDebounceTimer) {
      clearTimeout(offlineDebounceTimer);
      offlineDebounceTimer = null;
    }
    stopPolling();

    toast.dismiss('offline-restricted');

    if (isHandlingOnline) {
      return;
    }

    isHandlingOnline = true;
    isCurrentlyOffline = false;

    try {

      // 1. Restore cash session state
      await useCashSessionStore.getState().restoreSessionAfterOnline();

      // 2. Perform automated offline sync & conflict resolution
      const syncResult = await executeOfflineSync();

      const now = Date.now();
      const isCooldownActive = now - lastRestoredToastTimestamp < RESTORED_COOLDOWN_MS;

      if (!isCooldownActive) {
        lastRestoredToastTimestamp = now;

        if (syncResult.conflictCount > 0) {
          const auth = useAuthStore.getState();
          const isAdmin =
            auth.profile?.role === 'admin' ||
            auth.user?.email?.toLowerCase().includes('admin');

          if (isAdmin) {
            toast.warn(
              `Sync complete: ${syncResult.syncedCount} item(s) synced, ${syncResult.conflictCount} collision(s) require review.`,
              { toastId: 'online-sync-conflicts', autoClose: 6000 }
            );
          } else {
            toast.info(
              `Sync complete: ${syncResult.syncedCount} item(s) synced. ${syncResult.conflictCount} item(s) flagged for Admin review.`,
              { toastId: 'online-sync-staff', autoClose: 6000 }
            );
          }
        } else if (syncResult.syncedCount > 0) {
          toast.success(
            `Internet restored: ${syncResult.syncedCount} offline transaction(s) synchronized to cloud.`,
            { toastId: 'online-sync-success', autoClose: 4000 }
          );
        }
      }
    } catch (err) {
      console.warn('Background sync restore error:', err);
    } finally {
      isHandlingOnline = false;
    }
  };

  const handleOffline = () => {
    if (offlineDebounceTimer) clearTimeout(offlineDebounceTimer);

    offlineDebounceTimer = setTimeout(() => {
      if (isCurrentlyOffline) return;
      isCurrentlyOffline = true;
      startPolling();

      const isSessionOpen = useCashSessionStore.getState().isSessionOpen;
      const canOffline = useCashSessionStore.getState().canProcessOfflineTransactions();
      if (isSessionOpen || canOffline) {
        useCashSessionStore.getState().suspendSessionForOffline();
        toast.info(
          'Internet disconnected. Active cash session active — offline transactions will be queued and encrypted locally.',
          {
            toastId: 'offline-restricted',
            autoClose: 5000,
          }
        );
      } else {
        toast.error(
          'No internet connection and no active cash session. Transactions are restricted.',
          {
            toastId: 'offline-restricted',
            autoClose: 5000,
          }
        );
      }
    }, 1000);
  };

  const handleWindowFocus = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      if (isCurrentlyOffline || toast.isActive('offline-restricted')) {
        handleOnline();
      }
    }
  };

  const handleSyncUpdated = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine && !isHandlingOnline) {
      handleOnline();
    }
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('focus', handleWindowFocus);
  window.addEventListener('palomar:sync-updated', handleSyncUpdated);

  // Initial check on service bootstrap: auto-sync if pending vault items exist and online
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    setTimeout(() => {
      handleOnline().catch(() => {});
    }, 500);
  }

  let capListener: any = null;
  try {
    Network.addListener('networkStatusChange', (status) => {
      if (!status.connected) {
        handleOffline();
      } else {
        handleOnline();
      }
    })
      .then((l) => {
        capListener = l;
      })
      .catch(() => {});
  } catch (_) {}

  return () => {
    isInitialized = false;
    stopPolling();
    if (offlineDebounceTimer) {
      clearTimeout(offlineDebounceTimer);
      offlineDebounceTimer = null;
    }
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('focus', handleWindowFocus);
    window.removeEventListener('palomar:sync-updated', handleSyncUpdated);
    if (capListener && typeof capListener.remove === 'function') {
      capListener.remove();
    }
  };
}
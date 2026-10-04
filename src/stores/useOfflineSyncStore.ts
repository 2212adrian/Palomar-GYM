// src/stores/useOfflineSyncStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import { logAudit } from '../lib/supabase/audit';
import { getServerISOString } from '../lib/serverTime';
import { isCapacitorApp } from '../lib/platform';
import { mergeDailySessionsInSupabase } from '../lib/sessionMergeService';

export type PendingSyncActionType =
  | 'attendance_checkin'
  | 'attendance_payment_status'
  | 'attendance_delete'
  | 'sale_create'
  | 'sale_delete'
  | 'product_create'
  | 'product_update'
  | 'product_delete'
  | 'subscription_create'
  | 'card_issue'
  | 'cash_session_open'
  | 'cash_transaction_record'
  | 'cash_session_close';

export interface PendingSyncItem {
  id: string;
  action: PendingSyncActionType;
  label: string;
  payload: Record<string, any>;
  createdAt: string;
  retryCount: number;
}

interface OfflineSyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingQueue: PendingSyncItem[];
  lastSyncedAt: string | null;
  syncError: string | null;
  setOnlineStatus: (online: boolean) => void;
  markSyncStart: () => void;
  markSyncComplete: (error?: string | null) => void;
  enqueueMutation: (
    item: Omit<PendingSyncItem, 'id' | 'createdAt' | 'retryCount'>
  ) => PendingSyncItem;
  removeQueueItem: (id: string) => void;
  flushQueue: () => Promise<{ synced: number; remaining: number }>;
  refreshQueueFromStorage: () => void;
}

const QUEUE_STORAGE_KEY = 'palomar_offline_sync_queue_v2';
const LAST_SYNC_STORAGE_KEY = 'palomar_last_synced_at_v2';

/**
 * Strict Sales Validator:
 * Sales amounts and quantities cannot be 0 or less than 0 (negative).
 */
export const validateSalePayload = (
  payload: any
): { valid: boolean; reason?: string } => {
  if (!payload) return { valid: false, reason: 'Sale payload is required.' };

  const totalAmount = Number(payload.total_amount);
  const amountReceived = Number(payload.amount_received);
  const changeCalculated = Number(payload.change_calculated ?? 0);

  // Total amount cannot exceed 0 on the negative side and cannot be 0
  if (isNaN(totalAmount) || totalAmount <= 0) {
    return {
      valid: false,
      reason: 'Sale total amount cannot be 0 or negative.',
    };
  }

  // Amount received cannot be 0 or negative
  if (isNaN(amountReceived) || amountReceived <= 0) {
    return {
      valid: false,
      reason: 'Amount received cannot be 0 or negative.',
    };
  }

  // Amount received cannot be less than the total sale amount
  if (amountReceived < totalAmount) {
    return {
      valid: false,
      reason: 'Amount received cannot be less than total amount.',
    };
  }

  // Change calculated cannot be negative
  if (isNaN(changeCalculated) || changeCalculated < 0) {
    return {
      valid: false,
      reason: 'Change calculated cannot be negative.',
    };
  }

  // Items validation
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return {
      valid: false,
      reason: 'Sale must contain at least one item.',
    };
  }

  for (const item of payload.items) {
    const qty = Number(item.quantity);
    const price = Number(
      item.price ?? item.sellingPrice ?? item.selling_price ?? 0
    );
    if (isNaN(qty) || qty <= 0) {
      return {
        valid: false,
        reason: `Item "${item.productName || item.product_name || 'Item'}" quantity cannot be 0 or negative.`,
      };
    }
    if (isNaN(price) || price <= 0) {
      return {
        valid: false,
        reason: `Item "${item.productName || item.product_name || 'Item'}" price cannot be 0 or negative.`,
      };
    }
  }

  return { valid: true };
};

const loadStoredQueue = (): PendingSyncItem[] => {
  if (typeof window === 'undefined' || !isCapacitorApp()) return [];
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveQueueToStorage = (queue: PendingSyncItem[]) => {
  if (typeof window === 'undefined' || !isCapacitorApp()) return;
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('Failed to persist offline sync queue:', e);
  }
};

const loadLastSyncedAt = (): string | null => {
  if (typeof window === 'undefined' || !isCapacitorApp()) return null;
  try {
    return localStorage.getItem(LAST_SYNC_STORAGE_KEY);
  } catch {
    return null;
  }
};

const saveLastSyncedAt = (iso: string) => {
  if (typeof window === 'undefined' || !isCapacitorApp()) return;
  try {
    localStorage.setItem(LAST_SYNC_STORAGE_KEY, iso);
  } catch {
    // ignore
  }
};

export const useOfflineSyncStore = create<OfflineSyncState>((set, get) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncing: false,
  pendingQueue: loadStoredQueue(),
  lastSyncedAt: loadLastSyncedAt(),
  syncError: null,

  setOnlineStatus: (online: boolean) => {
    // Supabase offline sync is exclusive to Capacitor native app only
    if (!isCapacitorApp()) {
      set({ isOnline: true, pendingQueue: [] });
      return;
    }

    set({ isOnline: online });
    if (online && get().pendingQueue.length > 0) {
      get().flushQueue();
    }
  },

  markSyncStart: () => {
    if (!isCapacitorApp()) return;
    set({ isSyncing: true, syncError: null });
  },

  markSyncComplete: (error = null) => {
    if (!isCapacitorApp()) return;
    const nowIso = getServerISOString();
    if (!error) {
      saveLastSyncedAt(nowIso);
      set({ isSyncing: false, lastSyncedAt: nowIso, syncError: null });
    } else {
      set({ isSyncing: false, syncError: error });
    }
  },

  refreshQueueFromStorage: () => {
    if (!isCapacitorApp()) {
      set({ pendingQueue: [], lastSyncedAt: null });
      return;
    }
    set({
      pendingQueue: loadStoredQueue(),
      lastSyncedAt: loadLastSyncedAt(),
    });
  },

  enqueueMutation: (item) => {
    // SECURITY CONSTRAINT: Supabase offline sync is exclusive for Capacitor only!
    if (!isCapacitorApp()) {
      throw new Error(
        'Offline sync is exclusive to the Capacitor app for security purposes. Offline mutation queuing is blocked in browsers.'
      );
    }

    // STRICT CONSTRAINT: Sales validation on enqueue
    if (item.action === 'sale_create') {
      const val = validateSalePayload(item.payload);
      if (!val.valid) {
        throw new Error(`Invalid sale data: ${val.reason}`);
      }
    }

    const newItem: PendingSyncItem = {
      ...item,
      id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: getServerISOString(),
      retryCount: 0,
    };
    const updated = [...get().pendingQueue, newItem];
    saveQueueToStorage(updated);
    set({ pendingQueue: updated });

    // Notify Service Worker to register Background Sync
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'QUEUE_TRANSACTION',
            tag: 'supabase-background-sync',
            timestamp: Date.now(),
          });
        }
      } catch (_) {}
    }

    return newItem;
  },

  removeQueueItem: (id: string) => {
    if (!isCapacitorApp()) return;
    const updated = get().pendingQueue.filter((i) => i.id !== id);
    saveQueueToStorage(updated);
    set({ pendingQueue: updated });
  },

  flushQueue: async () => {
    // SECURITY CONSTRAINT: Exclusive for Capacitor only
    if (!isCapacitorApp()) {
      return { synced: 0, remaining: 0 };
    }

    const state = get();
    if (state.isSyncing) {
      return { synced: 0, remaining: state.pendingQueue.length };
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      set({ isOnline: false });
      return { synced: 0, remaining: state.pendingQueue.length };
    }

    const currentQueue = loadStoredQueue();
    if (currentQueue.length === 0) {
      const nowIso = getServerISOString();
      saveLastSyncedAt(nowIso);
      set({
        pendingQueue: [],
        isSyncing: false,
        lastSyncedAt: nowIso,
        syncError: null,
      });
      return { synced: 0, remaining: 0 };
    }

    set({ isSyncing: true, syncError: null });
    const remainingItems: PendingSyncItem[] = [];
    let syncedCount = 0;
    let lastErr: string | null = null;

    for (const item of currentQueue) {
      try {
        // ─── 1. ATTENDANCE ACTIONS WITH MEMBER VALIDATION ───
        if (item.action === 'attendance_checkin') {
          const { insertPayload, auditDescription } = item.payload;
          const memberId = insertPayload?.member_id;

          // MEMBER VALIDATION: Validate if member was already checked-in today
          if (memberId) {
            const todayDateStr =
              insertPayload.check_in_date ||
              getServerISOString().split('T')[0];

            const { data: existingCheckin } = await supabase
              .from('attendance')
              .select('id, customer_name, check_in_time')
              .eq('member_id', memberId)
              .eq('check_in_date', todayDateStr)
              .is('deleted_at', null)
              .maybeSingle();

            if (existingCheckin) {
              logAudit(
                'ATTENDANCE_CHECKIN_SKIPPED',
                `[Offline Sync] Member "${insertPayload.customer_name || memberId}" was already checked in today at ${existingCheckin.check_in_time}. Skipped duplicate offline check-in.`,
                String(existingCheckin.id)
              ).catch(() => {});
              syncedCount++;
              continue;
            }
          }

          const { data: inserted, error } = await supabase
            .from('attendance')
            .insert([insertPayload])
            .select()
            .single();

          if (error) throw error;

          if (auditDescription && inserted?.id) {
            logAudit(
              'ATTENDANCE_CHECKIN',
              `${auditDescription} [Synced from Offline Cache]`,
              String(inserted.id)
            ).catch(() => {});
          }
          syncedCount++;
        } else if (item.action === 'attendance_payment_status') {
          const { recordId, paymentStatus, updatedAt } = item.payload;
          const { error } = await supabase
            .from('attendance')
            .update({
              payment_status: paymentStatus,
              updated_at: updatedAt || getServerISOString(),
            })
            .eq('id', recordId);

          if (error) throw error;
          syncedCount++;
        } else if (item.action === 'attendance_delete') {
          const { recordId, deletedAt, deletedBy } = item.payload;
          const { error } = await supabase
            .from('attendance')
            .update({
              deleted_at: deletedAt || getServerISOString(),
              deleted_by: deletedBy || null,
            })
            .eq('id', recordId);

          if (error) throw error;
          syncedCount++;
        }

        // ─── 2. SALES ACTIONS WITH STRICT VALIDATION ───
        else if (item.action === 'sale_create') {
          // STRICT VALIDATION: cannot exceed 0 on negative side or be 0
          const saleValidation = validateSalePayload(item.payload);
          if (!saleValidation.valid) {
            logAudit(
              'SALE_OFFLINE_VALIDATION_FAILED',
              `[Offline Sync] Sale rejected due to strict validation: ${saleValidation.reason}`,
              item.id
            ).catch(() => {});
            // Discard invalid transaction without syncing to prevent database corruption
            syncedCount++;
            continue;
          }

          const { data: insertedSale, error } = await supabase
            .from('sales')
            .insert([
              {
                items: item.payload.items,
                product_name: item.payload.product_name || item.payload.productName,
                payment_method: item.payload.payment_method || item.payload.paymentMethod,
                amount_received: item.payload.amount_received || item.payload.amountReceived,
                change_calculated: item.payload.change_calculated ?? item.payload.changeCalculated ?? 0,
                total_amount: item.payload.total_amount || item.payload.totalAmount,
                gcash_fee_applied: item.payload.gcash_fee_applied ?? item.payload.gcashFeeApplied ?? 0,
                reference_number: item.payload.reference_number || item.payload.referenceNumber || null,
                cash_session_id: item.payload.cash_session_id || item.payload.cashSessionId || null,
              },
            ])
            .select()
            .single();

          if (error) throw error;

          if (insertedSale?.id) {
            logAudit(
              'SALE_RECORDED',
              `Recorded sale for ₱${insertedSale.total_amount} [Synced from Offline Cache]`,
              String(insertedSale.id)
            ).catch(() => {});
          }
          syncedCount++;
        } else if (item.action === 'sale_delete') {
          const { recordId, deletedAt, deletedBy } = item.payload;
          const { error } = await supabase
            .from('sales')
            .update({
              deleted_at: deletedAt || getServerISOString(),
              deleted_by: deletedBy || null,
            })
            .eq('id', recordId);

          if (error) throw error;
          syncedCount++;
        }

        // ─── 3. PRODUCT ACTIONS ───
        else if (item.action === 'product_create') {
          const { productPayload } = item.payload;
          const { error } = await supabase
            .from('products')
            .insert(productPayload);

          if (error) throw error;
          logAudit(
            'PRODUCT_CREATED',
            `Product "${productPayload.name}" created [Synced from Offline Cache]`,
            productPayload.id
          ).catch(() => {});
          syncedCount++;
        } else if (item.action === 'product_update') {
          const { productId, updatePayload } = item.payload;
          const { error } = await supabase
            .from('products')
            .update(updatePayload)
            .eq('id', productId);

          if (error) throw error;
          syncedCount++;
        } else if (item.action === 'product_delete') {
          const { productId } = item.payload;
          const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', productId);

          if (error) throw error;
          syncedCount++;
        }

        // ─── 4. MEMBERSHIP PLANS & SUBSCRIPTION VALIDATION ───
        else if (item.action === 'subscription_create') {
          const { memberId, subscriptionPayload } = item.payload;

          // MEMBER VALIDATION: Validate if member was already subscribed
          if (memberId) {
            const { data: existingSubs } = await supabase
              .from('subscriptions')
              .select('*')
              .eq('member_id', memberId)
              .neq('status', 'Voided')
              .order('end_date', { ascending: false });

            const nowMs = Date.now();
            const activeSub = (existingSubs || []).find((s) => {
              const endMs = new Date(s.end_date).getTime();
              return s.status === 'Active' && endMs > nowMs;
            });

            if (
              activeSub &&
              subscriptionPayload.start_date &&
              new Date(subscriptionPayload.start_date).getTime() <
                new Date(activeSub.end_date).getTime()
            ) {
              // Adjust start date to queue after existing active plan to avoid double-charging overlapping days
              subscriptionPayload.start_date = activeSub.end_date;
              const durationDays =
                subscriptionPayload.plan_type === 'yearly' ? 365 : 30;
              const nextEnd = new Date(activeSub.end_date);
              nextEnd.setDate(nextEnd.getDate() + durationDays);
              subscriptionPayload.end_date = nextEnd.toISOString();
              subscriptionPayload.status = 'Queued';

              logAudit(
                'SUBSCRIPTION_OFFLINE_QUEUED',
                `[Offline Sync] Member ${memberId} already actively subscribed. Offline plan queued seamlessly after ${activeSub.end_date}.`,
                memberId
              ).catch(() => {});
            }
          }

          const { data: insertedSub, error } = await supabase
            .from('subscriptions')
            .insert([subscriptionPayload])
            .select()
            .single();

          if (error) throw error;

          if (insertedSub?.id) {
            logAudit(
              'SUBSCRIPTION_CREATED',
              `Membership subscription assigned for member "${memberId}" [Synced from Offline Cache]`,
              String(insertedSub.id)
            ).catch(() => {});
          }
          syncedCount++;
        }

        // ─── 5. CARDS & CARD PAYMENT VALIDATION ───
        else if (item.action === 'card_issue') {
          const { memberId, cardPayload } = item.payload;

          // MEMBER VALIDATION: Validate if member already paid for cards
          if (memberId) {
            const { data: existingCard } = await supabase
              .from('cards')
              .select('*')
              .eq('member_id', memberId)
              .maybeSingle();

            if (existingCard && existingCard.payment_status === 'PAID') {
              logAudit(
                'CARD_PAYMENT_DUPLICATE_PREVENTED',
                `[Offline Sync] Member ${memberId} has already paid for cards (Card #${existingCard.card_number}). Preserved existing payment status.`,
                String(existingCard.id)
              ).catch(() => {});
              // If already paid, keep existing payment status and don't re-bill
              cardPayload.payment_status = 'PAID';
            }
          }

          const { error } = await supabase
            .from('cards')
            .upsert(cardPayload, { onConflict: 'member_id' });

          if (error) throw error;
          syncedCount++;
        }

        // ─── 6. CASH MANAGEMENT ACTIONS (OFFLINE SUPPORT) ───
        else if (item.action === 'cash_session_open') {
          const { session } = item.payload;
          const { data: existing } = await supabase
            .from('cash_sessions')
            .select('id')
            .eq('session_number', session.session_number)
            .maybeSingle();

          if (!existing) {
            const { error } = await supabase.from('cash_sessions').insert([
              {
                session_number: session.session_number,
                opened_at: session.opened_at,
                opened_by: session.opened_by || null,
                opened_by_name: session.opened_by_name || 'Staff',
                status: session.status || 'open',
                opening_float: session.opening_float,
                notes: session.notes || null,
              },
            ]);
            if (error) throw error;
          }
          syncedCount++;
        } else if (item.action === 'cash_transaction_record') {
          const tx = item.payload;
          const { error } = await supabase.from('cash_transactions').insert([
            {
              session_id: tx.session_id,
              type: tx.type,
              amount: tx.amount,
              reason: tx.reason,
              reference_number: tx.reference_number || null,
              performed_by: tx.performed_by || null,
              performed_by_name: tx.performed_by_name || 'Staff',
              created_at: tx.created_at || getServerISOString(),
            },
          ]);
          if (error) throw error;
          syncedCount++;
        } else if (item.action === 'cash_session_close') {
          const {
            sessionId,
            actualCash,
            expectedCash,
            discrepancy,
            notes,
            denominations,
            closedBy,
            closedByName,
            closedAt,
          } = item.payload;

          const { error } = await supabase
            .from('cash_sessions')
            .update({
              status: 'closed',
              closed_at: closedAt || getServerISOString(),
              closing_actual_cash: actualCash,
              closing_expected_cash: expectedCash,
              discrepancy,
              notes: notes || null,
              denominations: denominations || {},
              closed_by: closedBy || null,
              closed_by_name: closedByName || 'Staff',
            })
            .eq('id', sessionId);

          if (error && !sessionId.startsWith('offline-')) throw error;
          syncedCount++;
        }
      } catch (err: any) {
        lastErr = err?.message || 'Pending upload to Supabase';
        remainingItems.push({
          ...item,
          retryCount: (item.retryCount || 0) + 1,
        });
      }
    }

    saveQueueToStorage(remainingItems);
    const nowIso = getServerISOString();
    if (remainingItems.length === 0) {
      saveLastSyncedAt(nowIso);
    }

    set({
      pendingQueue: remainingItems,
      isSyncing: false,
      lastSyncedAt: remainingItems.length === 0 ? nowIso : get().lastSyncedAt,
      syncError: lastErr,
    });

    if (syncedCount > 0) {
      await mergeDailySessionsInSupabase().catch(() => {});
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('palomar_logbook_updated'));
        window.dispatchEvent(new Event('palomar_sales_updated'));
        window.dispatchEvent(new Event('palomar_members_updated'));
        window.dispatchEvent(new Event('palomar_cash_session_updated'));
      }
    }

    return { synced: syncedCount, remaining: remainingItems.length };
  },
}));

// Auto-attach listeners in Capacitor native environment ONLY
if (typeof window !== 'undefined') {
  const handleNetworkChange = () => {
    if (isCapacitorApp()) {
      useOfflineSyncStore.getState().setOnlineStatus(navigator.onLine);
    } else {
      useOfflineSyncStore.getState().setOnlineStatus(true);
    }
  };

  window.addEventListener('online', handleNetworkChange);
  window.addEventListener('offline', handleNetworkChange);
  window.addEventListener('storage', (e) => {
    if (
      isCapacitorApp() &&
      (e.key === QUEUE_STORAGE_KEY || e.key === LAST_SYNC_STORAGE_KEY)
    ) {
      useOfflineSyncStore.getState().refreshQueueFromStorage();
    }
  });
}

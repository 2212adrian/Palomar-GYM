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

function areSalesIdentical(cloudSale: any, offlinePayload: any): boolean {
  if (!cloudSale || !offlinePayload) return false;

  const cloudAmount = Number(cloudSale.total_amount || 0);
  const offlineAmount = Number(offlinePayload.total_amount || offlinePayload.totalAmount || 0);
  if (Math.abs(cloudAmount - offlineAmount) > 0.01) return false;

  const cloudItems = Array.isArray(cloudSale.items) ? cloudSale.items : [];
  const offlineItems = Array.isArray(offlinePayload.items) ? offlinePayload.items : [];

  if (cloudItems.length > 0 && offlineItems.length > 0) {
    if (cloudItems.length !== offlineItems.length) return false;

    const normalizeItem = (item: any) => ({
      id: String(item.productId || item.product_id || item.id || ''),
      quantity: Number(item.quantity || 1),
    });

    const sortedCloud = [...cloudItems].map(normalizeItem).sort((a, b) => a.id.localeCompare(b.id));
    const sortedOffline = [...offlineItems].map(normalizeItem).sort((a, b) => a.id.localeCompare(b.id));

    for (let i = 0; i < sortedCloud.length; i++) {
      if (sortedCloud[i].id !== sortedOffline[i].id) return false;
      if (sortedCloud[i].quantity !== sortedOffline[i].quantity) return false;
    }
    return true;
  }

  const cloudProdId = cloudSale.product_id || cloudSale.productId;
  const offlineProdId = offlinePayload.product_id || offlinePayload.productId;
  if (cloudProdId && offlineProdId && String(cloudProdId) === String(offlineProdId)) {
    const cloudQty = Number(cloudSale.quantity || 1);
    const offlineQty = Number(offlinePayload.quantity || 1);
    return cloudQty === offlineQty;
  }

  return false;
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
  const allVaultItems = await getDecryptedPendingTransactions();

  // Purge any local vault items that were already resolved in the cloud by an Admin on another device
  // Automatically drop conflicts belonging to closed or passed cash sessions
  // Also auto-resolve any pending conflicts in the cloud if the transactions are identical
  try {
    const conflictVaultIds = allVaultItems
      .filter((i) => i.status === 'conflict')
      .map((i) => i.id);

    if (conflictVaultIds.length > 0) {
      const { data: resolvedList } = await supabase
        .from('sync_conflicts')
        .select('second_transaction, resolution, resolved_by_name')
        .eq('status', 'resolved');

      if (resolvedList && resolvedList.length > 0) {
        const purgedIds: string[] = [];
        for (const res of resolvedList) {
          const vId = res.second_transaction?.vault_id;
          if (vId && conflictVaultIds.includes(vId)) {
            purgedIds.push(vId);
          }
        }
        if (purgedIds.length > 0) {
          await purgeTransactionsByIds(purgedIds);
        }
      }
    }

    const { data: pendingConflicts } = await supabase
      .from('sync_conflicts')
      .select('*')
      .eq('status', 'pending');

    if (pendingConflicts && pendingConflicts.length > 0) {
      for (const sc of pendingConflicts) {
        const first = sc.first_transaction || {};
        const second = sc.second_transaction || {};
        const firstSid = first.cash_session_id || first.cashSessionId;
        const secondSid = second.cash_session_id || second.cashSessionId || second.payload?.cash_session_id;

        // Auto-drop rule: If no session is open or the conflict belongs to a closed/passed session, drop both
        const isFromClosedSession =
          !activeSessionId ||
          (firstSid && firstSid !== activeSessionId) ||
          (secondSid && secondSid !== activeSessionId);

        if (isFromClosedSession) {
          await resolveConflictAction(sc.id, 'drop_both');
          continue;
        }

        let isIdentical = false;
        if (sc.conflict_type === 'duplicate_attendance') {
          const firstName = (first.customer_name || '').trim().toLowerCase();
          const secondName = (second.customer_name || '').trim().toLowerCase();
          const firstFee = Number(first.entry_fee || 0);
          const secondFee = Number(second.entry_fee || 0);
          const firstPlan = (first.plan_name || '').trim().toLowerCase();
          const secondPlan = (second.plan_name || '').trim().toLowerCase();
          if (firstName && secondName && firstName === secondName && firstFee === secondFee && firstPlan === secondPlan) {
            isIdentical = true;
          }
        } else if (sc.conflict_type === 'sale_stock_collision') {
          const firstPayload = {
            total_amount: first.total_amount,
            items: first.items,
            product_id: sc.product_id,
            quantity: first.quantity,
          };
          const secondPayload = second.payload || {
            total_amount: second.total_amount,
            items: second.items,
            product_id: sc.product_id,
            quantity: second.quantity,
          };
          if (areSalesIdentical(firstPayload, secondPayload)) {
            isIdentical = true;
          }
        }

        if (isIdentical) {
          await resolveConflictAction(sc.id, 'keep_first');
        }
      }
    }
  } catch (cleanErr) {
    console.warn('Error checking resolved conflicts:', cleanErr);
  }

  // Re-fetch remaining items and only process active pending transactions
  const refreshedVaultItems = await getDecryptedPendingTransactions();
  const pendingList = refreshedVaultItems.filter((item) => item.status === 'pending');
  if (pendingList.length === 0) {
    return result;
  }

  const CASH_TYPES = [
    'sale',
    'sale_restore',
    'sale_delete',
    'attendance',
    'attendance_restore',
    'attendance_delete',
    'subscription',
    'card_purchase',
    'cash_transaction',
  ];

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
  const syncedAttendanceInThisRun = new Set<string>();
  const syncedSalesInThisRun = new Set<string>();

  for (const item of pendingList) {
    try {
      if (CASH_TYPES.includes(item.type) && !activeSessionId) {
        continue;
      }

      // ─── A2. SALE RESTORE TRANSACTIONS (DUAL-OFFLINE CONFLICT RESOLVED) ───
      if (item.type === 'sale_restore') {
        const payload = item.payload;
        const targetSaleId = payload.saleId || payload.id;

        if (!targetSaleId) {
          successfullySyncedIds.push(item.id);
          continue;
        }

        const { data: cloudSale, error: fetchSaleErr } = await supabase
          .from('sales')
          .select('*')
          .eq('id', targetSaleId)
          .maybeSingle();

        if (fetchSaleErr || !cloudSale) {
          console.warn(`[Sync] Sale ${targetSaleId} not found in cloud database for restore:`, fetchSaleErr);
          successfullySyncedIds.push(item.id);
          continue;
        }

        if (cloudSale.deleted_at === null) {
          console.info(
            `[Sync] Sale ${targetSaleId} was already restored by another device/session. Deduplicating restore without double-deduction.`
          );

          try {
            await supabase.from('audit_logs').insert([
              {
                action: 'SALE_RESTORE_DEDUPLICATED',
                details: `Sale #${cloudSale.receipt_no || cloudSale.id} restore by cashier "${item.userName}" merged: record was already restored by "${cloudSale.processed_by || 'another user'}".`,
                target_id: targetSaleId,
                performed_by: item.userId || null,
              },
            ]);
          } catch {
            // ignore audit insert fail
          }

          successfullySyncedIds.push(item.id);
          result.syncedCount++;
          continue;
        }

        let hasRestoreStockConflict = false;
        let conflictRestoreStock: any = null;

        const saleItems =
          cloudSale.items && Array.isArray(cloudSale.items)
            ? cloudSale.items
            : payload.items && Array.isArray(payload.items)
              ? payload.items
              : [];

        for (const lineItem of saleItems) {
          const pId = lineItem.productId || lineItem.product_id || lineItem.id;
          if (pId) {
            const { data: cloudProd } = await supabase
              .from('products')
              .select('id, product_name, has_stock_limit, stock_quantity')
              .eq('id', pId)
              .maybeSingle();

            if (cloudProd && cloudProd.has_stock_limit) {
              const reqQty = Number(lineItem.quantity || 1);
              const currentStock = Number(cloudProd.stock_quantity ?? 0);

              if (currentStock < reqQty) {
                hasRestoreStockConflict = true;
                conflictRestoreStock = {
                  productId: pId,
                  product_name: cloudProd.product_name,
                  current_stock: currentStock,
                  requested: reqQty,
                  conflicting_sale_id: targetSaleId,
                  conflicting_sale_name: cloudSale.product_name || cloudProd.product_name,
                  conflicting_sale_amount: cloudSale.total_amount || 0,
                  conflicting_sale_cashier: item.userName || 'Offline Register',
                  conflicting_sale_time: cloudSale.created_at || null,
                };

                try {
                  await supabase.from('sync_conflicts').insert([
                    {
                      conflict_type: 'sale_stock_collision',
                      product_id: pId,
                      product_name: cloudProd.product_name,
                      status: 'pending',
                      first_transaction: {
                        id: targetSaleId,
                        cashier: cloudSale.processed_by || 'SUPERADMIN',
                        product_name: cloudSale.product_name || cloudProd.product_name,
                        quantity: reqQty,
                        total_amount: cloudSale.total_amount || 0,
                        created_at: cloudSale.created_at || new Date().toISOString(),
                        action: 'restore_insufficient_stock',
                      },
                      second_transaction: {
                        vault_id: item.id,
                        cashier: item.userName || 'Offline Register',
                        product_name: cloudSale.product_name || cloudProd.product_name,
                        quantity: reqQty,
                        total_amount: cloudSale.total_amount || 0,
                        created_at: item.createdAt,
                        payload,
                      },
                    },
                  ]);
                } catch (bcastErr) {
                  console.warn('Failed to broadcast restore stock collision:', bcastErr);
                }
                break;
              }
            }
          }
        }

        if (hasRestoreStockConflict) {
          await markPendingConflict(item.id, 'insufficient_stock', conflictRestoreStock);
          result.conflictCount++;
          continue;
        }

        const { error: restoreErr } = await supabase
          .from('sales')
          .update({
            deleted_at: null,
            deleted_by: null,
          })
          .eq('id', targetSaleId);

        if (restoreErr) throw restoreErr;

        try {
          await supabase.from('audit_logs').insert([
            {
              action: 'SALE_RESTORED',
              details: `Restored sale transaction (₱${Number(cloudSale.total_amount || 0).toFixed(2)}) from Recycle Bin via background sync by ${item.userName}.`,
              target_id: targetSaleId,
              performed_by: item.userId || null,
            },
          ]);
        } catch {}

        successfullySyncedIds.push(item.id);
        result.syncedCount++;
        continue;
      }

      // ─── A3. SALE DELETE TRANSACTIONS ───
      if (item.type === 'sale_delete') {
        const payload = item.payload;
        const targetSaleId = payload.saleId || payload.id;

        if (targetSaleId) {
          const { error: delErr } = await supabase
            .from('sales')
            .update({
              deleted_at: payload.deletedAt || new Date().toISOString(),
            })
            .eq('id', targetSaleId);

          if (delErr) {
            console.warn(`[Sync] Could not apply soft delete to sale ${targetSaleId}:`, delErr);
          }
        }

        successfullySyncedIds.push(item.id);
        result.syncedCount++;
        continue;
      }

      // ─── B2. ATTENDANCE RESTORE TRANSACTIONS ───
      if (item.type === 'attendance_restore') {
        const payload = item.payload;
        const targetAttendanceId = payload.attendanceId || payload.id;

        if (targetAttendanceId) {
          const { error: restoreErr } = await supabase
            .from('attendance')
            .update({
              deleted_at: null,
              deleted_by: null,
            })
            .eq('id', targetAttendanceId);

          if (restoreErr) {
            console.warn(`[Sync] Could not restore attendance ${targetAttendanceId}:`, restoreErr);
          }

          if (payload.receiptNumber) {
            await supabase
              .from('receipts')
              .update({
                payment_status: 'Paid',
                updated_at: new Date().toISOString(),
              })
              .eq('id', payload.receiptNumber);

            await supabase
              .from('cards')
              .update({
                status: 'Active',
                payment_status: 'PAID',
                claim_status: 'UNCLAIMED',
                updated_at: new Date().toISOString(),
              })
              .eq('receipt_number', payload.receiptNumber);
          }
        }

        successfullySyncedIds.push(item.id);
        result.syncedCount++;
        continue;
      }

      // ─── B3. ATTENDANCE DELETE TRANSACTIONS ───
      if (item.type === 'attendance_delete') {
        const payload = item.payload;
        const targetAttendanceId = payload.attendanceId || payload.id;

        if (targetAttendanceId) {
          const { error: delErr } = await supabase
            .from('attendance')
            .update({
              deleted_at: payload.deletedAt || new Date().toISOString(),
            })
            .eq('id', targetAttendanceId);

          if (delErr) {
            console.warn(`[Sync] Could not soft delete attendance ${targetAttendanceId}:`, delErr);
          }

          if (payload.receiptNumber) {
            await supabase
              .from('cards')
              .update({
                payment_status: 'NONE',
                claim_status: 'NOT_APPLICABLE',
                updated_at: new Date().toISOString(),
              })
              .eq('receipt_number', payload.receiptNumber);
          }
        }

        successfullySyncedIds.push(item.id);
        result.syncedCount++;
        continue;
      }

// ─── A. SALE TRANSACTIONS ───
      if (item.type === 'sale') {
        const payload = item.payload;
        let hasStockConflict = false;
        let conflictCloudStock: any = null;

        const saleDedupKey = `${Number(payload.total_amount || payload.totalAmount || 0).toFixed(2)}::${(payload.items || []).map((i: any) => `${i.productId || i.product_id || i.id}_${i.quantity || 1}`).sort().join('|')}`;
        if (syncedSalesInThisRun.has(saleDedupKey)) {
          successfullySyncedIds.push(item.id);
          result.syncedCount++;
          continue;
        }

        // Verify stock against cloud database with exact column names (has_stock_limit, stock_quantity)
        if (payload.items && Array.isArray(payload.items)) {
          for (const lineItem of payload.items) {
            const pId = lineItem.productId || lineItem.product_id || lineItem.id;
            if (pId) {
              const { data: cloudProd } = await supabase
                .from('products')
                .select('id, product_name, has_stock_limit, stock_quantity')
                .eq('id', pId)
                .maybeSingle();

              if (cloudProd && cloudProd.has_stock_limit) {
                const reqQty = Number(lineItem.quantity || 1);
                const currentStock = Number(cloudProd.stock_quantity ?? 0);

                if (currentStock < reqQty) {
                  // Find recent cloud sales in this session that consumed this product's stock
                  let matchedCloudSale: any = null;
                  try {
                    const { data: cloudSales } = await supabase
                      .from('sales')
                      .select('*')
                      .is('deleted_at', null)
                      .neq('is_quarantined', true)
                      .order('created_at', { ascending: false })
                      .limit(10);

                    if (cloudSales) {
                      matchedCloudSale = cloudSales.find((cs: any) => {
                        if (cs.items && Array.isArray(cs.items)) {
                          return cs.items.some(
                            (ci: any) =>
                              (ci.productId || ci.product_id || ci.id) === pId
                          );
                        }
                        return false;
                      });
                    }

                    // Auto-resolve identical sale collision: deduplicate and keep existing cloud sale
                    if (matchedCloudSale && areSalesIdentical(matchedCloudSale, payload)) {
                      successfullySyncedIds.push(item.id);
                      result.syncedCount++;
                      hasStockConflict = false;
                      break;
                    }

                    // Quarantine conflicting cloud sale so NEITHER sale proceeds until admin reviews
                    if (matchedCloudSale) {
                      await supabase
                        .from('sales')
                        .update({
                          is_quarantined: true,
                          quarantine_reason: `Stock collision with offline sale (${item.id})`,
                        })
                        .eq('id', matchedCloudSale.id);
                    }
                  } catch (quarantineErr) {
                    console.warn('Failed to quarantine cloud sale:', quarantineErr);
                  }

                  hasStockConflict = true;
                  conflictCloudStock = {
                    productId: pId,
                    product_name: cloudProd.product_name,
                    current_stock: currentStock,
                    requested: reqQty,
                    conflicting_sale_id: matchedCloudSale?.id || null,
                    conflicting_sale_name: matchedCloudSale?.product_name || cloudProd.product_name,
                    conflicting_sale_amount: matchedCloudSale?.total_amount || 0,
                    conflicting_sale_cashier: matchedCloudSale?.processed_by || 'Other Register',
                    conflicting_sale_time: matchedCloudSale?.created_at || null,
                  };

                  // Publish conflict to cloud database so all admins can inspect & resolve it
                  try {
                    await supabase.from('sync_conflicts').insert([
                      {
                        conflict_type: 'sale_stock_collision',
                        product_id: pId,
                        product_name: cloudProd.product_name,
                        status: 'pending',
                        first_transaction: {
                          id: matchedCloudSale?.id || null,
                          cashier: matchedCloudSale?.processed_by || 'SUPERADMIN',
                          product_name: matchedCloudSale?.product_name || cloudProd.product_name,
                          quantity: matchedCloudSale?.items?.[0]?.quantity || 1,
                          total_amount: matchedCloudSale?.total_amount || 0,
                          created_at: matchedCloudSale?.created_at || new Date().toISOString(),
                          items: matchedCloudSale?.items || [],
                        },
                        second_transaction: {
                          vault_id: item.id,
                          cashier: item.userName || 'Offline Register',
                          product_name: payload.product_name || cloudProd.product_name,
                          quantity: reqQty,
                          total_amount: payload.total_amount || 0,
                          created_at: item.createdAt,
                          payload,
                        },
                      },
                    ]);
                  } catch (broadcastErr) {
                    console.warn('Failed to broadcast sync conflict to cloud:', broadcastErr);
                  }
                  break;
                }
              }
            }
          }
        } else if (payload.product_id || payload.productId) {
          const pId = payload.product_id || payload.productId;
          const { data: cloudProd } = await supabase
            .from('products')
            .select('id, product_name, has_stock_limit, stock_quantity')
            .eq('id', pId)
            .maybeSingle();

          if (cloudProd && cloudProd.has_stock_limit) {
            const reqQty = Number(payload.quantity || 1);
            const currentStock = Number(cloudProd.stock_quantity ?? 0);

            if (currentStock < reqQty) {
              let matchedCloudSale: any = null;
              try {
                const { data: cloudSales } = await supabase
                  .from('sales')
                  .select('*')
                  .is('deleted_at', null)
                  .neq('is_quarantined', true)
                  .order('created_at', { ascending: false })
                  .limit(10);

                if (cloudSales) {
                  matchedCloudSale = cloudSales.find((cs: any) => {
                    if (cs.items && Array.isArray(cs.items)) {
                      return cs.items.some(
                        (ci: any) =>
                          (ci.productId || ci.product_id || ci.id) === pId
                      );
                    }
                    return false;
                  });
                }

                // Auto-resolve identical sale collision: deduplicate and keep existing cloud sale
                if (matchedCloudSale && areSalesIdentical(matchedCloudSale, payload)) {
                  successfullySyncedIds.push(item.id);
                  result.syncedCount++;
                  hasStockConflict = false;
                } else {
                  hasStockConflict = true;
                  if (matchedCloudSale) {
                    await supabase
                      .from('sales')
                      .update({
                        is_quarantined: true,
                        quarantine_reason: `Stock collision with offline sale (${item.id})`,
                      })
                      .eq('id', matchedCloudSale.id);
                  }
                  conflictCloudStock = {
                    productId: pId,
                    product_name: cloudProd.product_name,
                    current_stock: currentStock,
                    requested: reqQty,
                    conflicting_sale_id: matchedCloudSale?.id || null,
                    conflicting_sale_name: matchedCloudSale?.product_name || cloudProd.product_name,
                    conflicting_sale_amount: matchedCloudSale?.total_amount || 0,
                    conflicting_sale_cashier: matchedCloudSale?.processed_by || 'Other Register',
                    conflicting_sale_time: matchedCloudSale?.created_at || null,
                  };
                }
              } catch (quarantineErr) {
                console.warn('Failed to quarantine cloud sale:', quarantineErr);
              }
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
          is_quarantined: false,
        };
        delete (saleRecord as any).sync_status;

        const { error: insertErr } = await supabase.from('sales').insert([saleRecord]);
        if (insertErr) throw insertErr;

        syncedSalesInThisRun.add(saleDedupKey);
        successfullySyncedIds.push(item.id);
        result.syncedCount++;
        continue;
      }

      // ─── B. ATTENDANCE & CHECK-INS ───
      if (item.type === 'attendance') {
        const payload = item.payload;

        const attDedupKey = `${(payload.customer_name || '').trim().toLowerCase()}::${(payload.member_id || '').trim().toLowerCase()}::${(payload.plan_name || '').trim().toLowerCase()}::${Number(payload.entry_fee || 0).toFixed(2)}`;

        // Deduplicate multiple identical records in the same sync batch
        if (syncedAttendanceInThisRun.has(attDedupKey)) {
          successfullySyncedIds.push(item.id);
          result.syncedCount++;
          continue;
        }

        const txDate = (payload.check_in_time || item.createdAt).substring(0, 10);
        let duplicateCheck = null;

        if (payload.customer_name) {
          const { data: existingRows } = await supabase
            .from('attendance')
            .select('id, customer_name, check_in_time, plan_name, entry_fee, staff_name, member_id, cash_session_id')
            .ilike('customer_name', payload.customer_name.trim())
            .gte('check_in_time', `${txDate}T00:00:00.000Z`)
            .lte('check_in_time', `${txDate}T23:59:59.999Z`)
            .is('deleted_at', null)
            .limit(5);

          if (existingRows && existingRows.length > 0) {
            const identicalMatch = existingRows.find((row: any) => {
              const sameName = (row.customer_name || '').trim().toLowerCase() === (payload.customer_name || '').trim().toLowerCase();
              const sameFee = Math.abs(Number(row.entry_fee || 0) - Number(payload.entry_fee || 0)) < 0.01;
              const samePlan = (row.plan_name || '').trim().toLowerCase() === (payload.plan_name || '').trim().toLowerCase();
              const sameMember = (!row.member_id && !payload.member_id) || (row.member_id === payload.member_id);
              return sameName && sameFee && samePlan && sameMember;
            });

            if (identicalMatch) {
              syncedAttendanceInThisRun.add(attDedupKey);
              successfullySyncedIds.push(item.id);
              result.syncedCount++;
              continue;
            }

            duplicateCheck = existingRows[0];
          }
        }

        if (duplicateCheck) {
          const conflictData = {
            id: duplicateCheck.id,
            customer_name: duplicateCheck.customer_name,
            member_id: duplicateCheck.member_id,
            plan_name: duplicateCheck.plan_name,
            entry_fee: duplicateCheck.entry_fee ?? 0,
            staff_name: duplicateCheck.staff_name || 'Counter Staff',
            check_in_time: duplicateCheck.check_in_time,
            cash_session_id: duplicateCheck.cash_session_id || activeSessionId,
          };

          await markPendingConflict(item.id, 'duplicate_attendance', conflictData);
          result.conflictCount++;

          try {
            await supabase.from('sync_conflicts').insert([
              {
                conflict_type: 'duplicate_attendance',
                product_name: payload.customer_name || 'Member Attendance',
                status: 'pending',
                first_transaction: {
                  id: duplicateCheck.id,
                  cashier: duplicateCheck.staff_name || 'SUPERADMIN',
                  customer_name: duplicateCheck.customer_name,
                  member_id: duplicateCheck.member_id,
                  plan_name: duplicateCheck.plan_name || 'Daily Check-in',
                  entry_fee: Number(duplicateCheck.entry_fee || 0),
                  created_at: duplicateCheck.check_in_time,
                  cash_session_id: duplicateCheck.cash_session_id || activeSessionId,
                },
                second_transaction: {
                  vault_id: item.id,
                  cashier: item.userName || 'Offline Register',
                  customer_name: payload.customer_name,
                  member_id: payload.member_id,
                  plan_name: payload.plan_name || 'Daily Check-in',
                  entry_fee: Number(payload.entry_fee || 0),
                  created_at: payload.check_in_time || item.createdAt,
                  cash_session_id: activeSessionId,
                  payload,
                },
              },
            ]);
          } catch (broadcastErr) {
            console.warn('Failed to broadcast attendance conflict to cloud:', broadcastErr);
          }
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

        syncedAttendanceInThisRun.add(attDedupKey);
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

      // ─── D2. MANUAL CASH DRAWER TRANSACTIONS (CASH IN / CASH OUT / DIGITAL IN) ───
      if (item.type === 'cash_transaction') {
        const payload = item.payload;
        const txRecord = {
          session_id: activeSessionId || payload.session_id,
          type: payload.type,
          amount: Number(payload.amount || 0),
          reason: payload.reason || 'Manual Movement',
          reference_number: payload.reference_number || null,
          performed_by: payload.performed_by || item.userId || null,
          performed_by_name: payload.performed_by_name || item.userName || 'Staff',
          created_at: payload.created_at || item.createdAt,
        };

        const { data: insertedTx, error: txInsertErr } = await supabase
          .from('cash_transactions')
          .insert([txRecord])
          .select()
          .maybeSingle();

        if (txInsertErr) throw txInsertErr;

        try {
          const actionLabel =
            payload.type === 'cash_in'
              ? 'CASH_IN'
              : payload.type === 'cash_out'
              ? 'CASH_OUT'
              : 'DIGITAL_CASH_IN';

          await supabase.from('audit_logs').insert([
            {
              action: actionLabel,
              details: `Synced offline ${String(payload.type).toUpperCase()}: ₱${Number(payload.amount || 0).toFixed(2)} Reason: ${payload.reason}${
                payload.reference_number ? ` (Ref: ${payload.reference_number})` : ''
              } by ${item.userName}.`,
              target_id: insertedTx?.id || null,
              performed_by: item.userId || null,
            },
          ]);
        } catch (auditErr) {
          console.warn('Audit log for synced cash transaction failed:', auditErr);
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
  action: 'keep_first' | 'keep_second' | 'drop_both' | 'keep_cloud' | 'keep_offline'
): Promise<void> {
  const normalizedAction =
    action === 'keep_cloud' ? 'keep_first' : action === 'keep_offline' ? 'keep_second' : action;

  const auth = useAuthStore.getState();
  const currentUserName = auth.profile?.username || auth.user?.email || 'Admin';

  // 1. Check if resolving via cloud sync_conflicts record
  let cloudConflict: any = null;
  try {
    const { data } = await supabase
      .from('sync_conflicts')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    cloudConflict = data;
  } catch (err) {
    console.warn('Could not read cloud conflict:', err);
  }

  const pending = await getDecryptedPendingTransactions();
  const target = pending.find(
    (p) => p.id === id || p.id === cloudConflict?.second_transaction?.vault_id
  );

  const isAttendanceConflict =
    cloudConflict?.conflict_type === 'duplicate_attendance' ||
    target?.type === 'attendance' ||
    target?.conflictReason === 'duplicate_attendance';

  const firstRecordId =
    cloudConflict?.first_transaction?.id ||
    target?.conflictCloudData?.conflicting_sale_id ||
    target?.conflictCloudData?.id;
  const secondPayload =
    cloudConflict?.second_transaction?.payload || target?.payload;
  const targetVaultId = target?.id || cloudConflict?.second_transaction?.vault_id;

  if (normalizedAction === 'drop_both') {
    try {
      if (firstRecordId) {
        const targetTable = isAttendanceConflict ? 'attendance' : 'sales';
        await supabase
          .from(targetTable)
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', firstRecordId);
      }
      if (cloudConflict) {
        await supabase
          .from('sync_conflicts')
          .update({
            status: 'resolved',
            resolution: 'drop_both',
            resolved_by_name: currentUserName,
            resolved_at: new Date().toISOString(),
          })
          .eq('id', cloudConflict.id);
      }
      if (targetVaultId) {
        await purgeTransactionsByIds([targetVaultId]);
      }
      toast.info('Both conflicting transactions dropped.');
      window.dispatchEvent(new CustomEvent('palomar:sync-updated'));
    } catch (err: any) {
      toast.error(`Failed to drop transactions: ${err.message}`);
    }
    return;
  }

  if (normalizedAction === 'keep_first') {
    try {
      if (firstRecordId && !isAttendanceConflict) {
        const { error: unquarantineErr } = await supabase
          .from('sales')
          .update({
            is_quarantined: false,
            quarantine_reason: null,
          })
          .eq('id', firstRecordId);

        if (unquarantineErr) throw unquarantineErr;
      }
      if (cloudConflict) {
        await supabase
          .from('sync_conflicts')
          .update({
            status: 'resolved',
            resolution: 'keep_first',
            resolved_by_name: currentUserName,
            resolved_at: new Date().toISOString(),
          })
          .eq('id', cloudConflict.id);
      }
      if (targetVaultId) {
        await purgeTransactionsByIds([targetVaultId]);
      }
      toast.success('Approved 1st transaction. 2nd transaction dropped.');
      window.dispatchEvent(new CustomEvent('palomar:sync-updated'));
    } catch (err: any) {
      toast.error(`Failed to approve 1st transaction: ${err.message}`);
    }
    return;
  }

  if (normalizedAction === 'keep_second') {
    try {
      const activeSession = useCashSessionStore.getState().activeSession;
      const sessionId = activeSession?.id || target?.cashSessionId;

      if (firstRecordId) {
        const targetTable = isAttendanceConflict ? 'attendance' : 'sales';
        await supabase
          .from(targetTable)
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', firstRecordId);
      }

      if (secondPayload) {
        if (isAttendanceConflict) {
          const attRecord = {
            ...secondPayload,
            cash_session_id: sessionId,
          };
          delete (attRecord as any).sync_status;
          const { error: attErr } = await supabase.from('attendance').insert([attRecord]);
          if (attErr) throw attErr;
        } else {
          const saleRecord = {
            ...secondPayload,
            cash_session_id: sessionId,
            is_quarantined: false,
          };
          delete (saleRecord as any).sync_status;
          const { error: insertErr } = await supabase.from('sales').insert([saleRecord]);
          if (insertErr) throw insertErr;
        }
      }

      if (cloudConflict) {
        await supabase
          .from('sync_conflicts')
          .update({
            status: 'resolved',
            resolution: 'keep_second',
            resolved_by_name: currentUserName,
            resolved_at: new Date().toISOString(),
          })
          .eq('id', cloudConflict.id);
      }

      if (targetVaultId) {
        await purgeTransactionsByIds([targetVaultId]);
      }
      toast.success('Approved 2nd transaction. 1st transaction dropped.');
      window.dispatchEvent(new CustomEvent('palomar:sync-updated'));
    } catch (err: any) {
      toast.error(`Failed to approve 2nd transaction: ${err.message}`);
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
          'No Internet Connection, please check your connection.',
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
// src/pages/system/DatabaseManager.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase/client';
import { logAudit } from '../../lib/supabase/audit';
import { useAuthStore } from '../../stores/authStore';
import { useCashSessionStore } from '../../stores/useCashSessionStore';
import { isSuperAdmin } from '../../constants/auth';
import { SalesDialog } from '../sales/components/SalesDialog';
import { LogbookRecordAttendance } from '../logbook/components/LogbookRecordAttendance';
import { SalesManager } from './SystemInformation/SalesManager';
import { AttendanceManager } from './SystemInformation/AttendanceManager';
import { AuditLogsManager } from './SystemInformation/AuditLogsManager';
import { Table, type Column } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useResponsiveItemsPerPage } from '../../lib/useResponsiveItemsPerPage';
import { subscriptionService } from '../members/memberService';
import { toast } from 'react-toastify';
import {
  HardDrive,
  ShieldAlert,
  RefreshCw,
  Calendar,
  Trash2,
  Loader2,
  UserX,
  Search,
  AlertTriangle,
  Lock,
  Banknote,
  ArrowUpDown,
  AlertOctagon,
  Clock,
  CheckCircle2,
} from 'lucide-react';

const MIN_ALLOWED_DATE = '2024-01-01';
const POSTGRES_FREE_TIER_BYTES = 500 * 1024 * 1024; // 500 MB Supabase limit

type TerminalTab =
  | 'attendance'
  | 'sales'
  | 'subscriptions'
  | 'cash_sessions'
  | 'cash_transactions'
  | 'audit_logs'
  | 'sync_conflicts';

const getTodayDateString = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatPhtDateTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export const DatabaseManager: React.FC = () => {
  const { user, profile } = useAuthStore() as any;
  const { activeSession } = useCashSessionStore();
  const responsiveItemsPerPage = useResponsiveItemsPerPage();

  const isSuperAdminOnly = useMemo(() => {
    return isSuperAdmin(user?.email || profile?.email);
  }, [user?.email, profile?.email]);

  const todayStr = useMemo(() => getTodayDateString(), []);
  const [startDate, setStartDate] = useState<string>(MIN_ALLOWED_DATE);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [activeTab, setActiveTab] = useState<TerminalTab>('attendance');
  const [tabLoading, setTabLoading] = useState<boolean>(false);

  // Storage Quota Telemetry
  const [dbSizeBytes, setDbSizeBytes] = useState<number | null>(null);
  const [bucketSizeBytes, setBucketSizeBytes] = useState<number | null>(null);
  const [loadingStorage, setLoadingStorage] = useState<boolean>(false);

  // Domain Datasets
  const [attendanceList, setAttendanceList] = useState<any[]>([]);
  const [salesList, setSalesList] = useState<any[]>([]);
  const [auditLogsList, setAuditLogsList] = useState<any[]>([]);
  const [subscriptionsList, setSubscriptionsList] = useState<any[]>([]);
  const [subscriptionSearch, setSubscriptionSearch] = useState<string>('');
  const [products, setProducts] = useState<any[]>([]);
  const [cashSessionsList, setCashSessionsList] = useState<any[]>([]);
  const [cashTransactionsList, setCashTransactionsList] = useState<any[]>([]);
  const [syncConflictsList, setSyncConflictsList] = useState<any[]>([]);

  // Modal States for Attendance & Sales creation
  const [isSalesDialogOpen, setIsSalesDialogOpen] = useState<boolean>(false);
  const [isAttendanceDialogOpen, setIsAttendanceDialogOpen] =
    useState<boolean>(false);

  // Drop Subscription Modal States
  const [isDropModalOpen, setIsDropModalOpen] = useState<boolean>(false);
  const [dropTarget, setDropTarget] = useState<any | null>(null);
  const [dropReason, setDropReason] = useState<string>('');
  const [isDropping, setIsDropping] = useState<boolean>(false);

  // Single-row Delete Confirmation Modal (cash_sessions / cash_transactions / sync_conflicts)
  const [deleteTarget, setDeleteTarget] = useState<{
    table: 'cash_sessions' | 'cash_transactions' | 'sync_conflicts';
    row: any;
    title: string;
    warning: string;
  } | null>(null);
  const [isDeletingRow, setIsDeletingRow] = useState<boolean>(false);

  // Bulk Storage Purge Modal States
  const [purgeModalTarget, setPurgeModalTarget] = useState<
    | 'attendance'
    | 'sales'
    | 'subscriptions'
    | 'cash_sessions'
    | 'cash_transactions'
    | null
  >(null);
  const [purgeOption, setPurgeOption] = useState<string>('90days');
  const [isPurging, setIsPurging] = useState<boolean>(false);
  const [isPurgingConflicts, setIsPurgingConflicts] = useState<boolean>(false);

  const fetchStorageMetrics = useCallback(async () => {
    if (!isSuperAdminOnly) return;
    setLoadingStorage(true);
    try {
      const [dbRes, storageRes] = await Promise.allSettled([
        supabase.rpc('get_database_size_bytes'),
        supabase.rpc('get_storage_size_bytes'),
      ]);

      if (dbRes.status === 'fulfilled' && !dbRes.value.error) {
        const val = Number(dbRes.value.data);
        if (!isNaN(val)) setDbSizeBytes(val);
      }
      if (storageRes.status === 'fulfilled' && !storageRes.value.error) {
        const val = Number(storageRes.value.data);
        if (!isNaN(val)) setBucketSizeBytes(val);
      }
    } catch {
      // Fail quietly if RPC unavailable
    } finally {
      setLoadingStorage(false);
    }
  }, [isSuperAdminOnly]);

  const fetchProducts = useCallback(async () => {
    if (!isSuperAdminOnly) return;
    try {
      const { data } = await supabase
        .from('products')
        .select('*')
        .is('deleted_at', null)
        .order('product_name', { ascending: true });
      setProducts(data || []);
    } catch (e) {
      console.warn('Error loading products for sales dialog:', e);
    }
  }, [isSuperAdminOnly]);

  const fetchTabData = useCallback(async () => {
    if (!isSuperAdminOnly) return;
    setTabLoading(true);

    const startIso = new Date(`${startDate}T00:00:00+08:00`).toISOString();
    const endIso = new Date(`${endDate}T23:59:59.999+08:00`).toISOString();

    try {
      if (activeTab === 'attendance') {
        const { data, error } = await supabase
          .from('attendance')
          .select('*')
          .is('deleted_at', null)
          .gte('check_in_time', startIso)
          .lte('check_in_time', endIso)
          .order('check_in_time', { ascending: false });

        if (error) throw error;
        setAttendanceList(data || []);
      } else if (activeTab === 'sales') {
        const { data, error } = await supabase
          .from('sales')
          .select('*')
          .is('deleted_at', null)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const normalized = (data || []).map((s: any) => {
          const parsedItems: Array<{
            productName: string;
            quantity: number;
            price: number;
          }> = [];
          if (s.items && Array.isArray(s.items) && s.items.length > 0) {
            s.items.forEach((it: any) => {
              parsedItems.push({
                productName: it.productName || it.product_name || 'Item',
                quantity: Number(it.quantity || 1),
                price: Number(it.price || 0),
              });
            });
          } else if (s.product_name) {
            parsedItems.push({
              productName: s.product_name,
              quantity: 1,
              price: Number(s.total_amount || 0),
            });
          }

          const itemsText = parsedItems
            .map((i) => `${i.quantity}x ${i.productName}`)
            .join(', ');

          return {
            ...s,
            parsed_items: parsedItems,
            searchable_items: `${s.product_name || ''} ${itemsText} ${s.receipt_no || ''}`,
            total_amount: Number(s.total_amount || 0),
            amount_received: Number(s.amount_received || s.total_amount || 0),
            payment_method: s.payment_method || 'Cash',
          };
        });

        setSalesList(normalized);
      } else if (activeTab === 'audit_logs') {
        const { data, error } = await supabase
          .from('audit_logs')
          .select('*')
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setAuditLogsList(data || []);
      } else if (activeTab === 'subscriptions') {
        let mems: any[] = [];
        const { data: fetchedMems, error: memsErr } = await supabase
          .from('members')
          .select('*')
          .order('full_name', { ascending: true });

        if (!memsErr && fetchedMems) {
          mems = fetchedMems;
        }

        const memberLookup = new Map<string, any>();
        mems.forEach((m: any) => {
          const name =
            m.full_name ||
            [m.first_name, m.last_name].filter(Boolean).join(' ') ||
            [m.last_name, m.first_name].filter(Boolean).join(', ') ||
            m.name ||
            '';

          const normalizedMember = {
            ...m,
            computed_name: name,
          };

          const registerKey = (val: any) => {
            if (
              val !== undefined &&
              val !== null &&
              String(val).trim() !== ''
            ) {
              const k = String(val).trim();
              memberLookup.set(k, normalizedMember);
              memberLookup.set(k.toLowerCase(), normalizedMember);
            }
          };

          registerKey(m.id);
          registerKey(m.member_id);
          registerKey(m.yearly_member_id);
          registerKey(m.user_id);
          registerKey(m.membership_id);
          registerKey(m.custom_id);
          registerKey(m.card_number);
          registerKey(m.qr_code);
          registerKey(m.email);
          registerKey(m.phone);
        });

        let subsRaw: any[] = [];
        try {
          const { data: joinedData, error: joinErr } = await supabase
            .from('subscriptions')
            .select('*, members(*)')
            .order('created_at', { ascending: false });

          if (!joinErr && joinedData && joinedData.length > 0) {
            subsRaw = joinedData;
          }
        } catch {
          // Fallback to unjoined query
        }

        if (!subsRaw || subsRaw.length === 0) {
          const { data: rawData, error: rawErr } = await supabase
            .from('subscriptions')
            .select('*')
            .order('created_at', { ascending: false });

          if (rawErr) throw rawErr;
          subsRaw = rawData || [];
        }

        const combined = subsRaw.map((s: any) => {
          let m = s.members || s.member || null;
          if (Array.isArray(m) && m.length > 0) {
            m = m[0];
          }

          if (!m || !m.full_name) {
            const candidateKeys = [
              s.member_id,
              s.user_id,
              s.members_id,
              s.member_uuid,
              s.memberId,
              s.userId,
              s.card_number,
              s.qr_code,
            ];
            for (const key of candidateKeys) {
              if (key !== undefined && key !== null) {
                const found =
                  memberLookup.get(String(key).trim()) ||
                  memberLookup.get(String(key).trim().toLowerCase());
                if (found) {
                  m = found;
                  break;
                }
              }
            }
          }

          const memberName =
            m?.computed_name ||
            m?.full_name ||
            (m?.first_name || m?.last_name
              ? [m.first_name, m.last_name].filter(Boolean).join(' ')
              : '') ||
            s.member_name ||
            s.full_name ||
            s.customer_name ||
            s.name ||
            'Unknown Member';

          const memberPhone = m?.phone || s.phone || s.member_phone || '—';
          const memberEmail = m?.email || s.email || s.member_email || '—';
          const memberStatus =
            m?.membership_status || m?.status || s.status || 'inactive';

          return {
            ...s,
            member_id: s.member_id || m?.id || m?.member_id,
            resolved_member: m,
            member_name: memberName,
            member_email: memberEmail,
            member_phone: memberPhone,
            member_status: memberStatus,
          };
        });

        const nowMs = Date.now();
        const seenSubKeys = new Set<string>();

        const activeOnly = combined.filter((s: any) => {
          const statusLower = String(s.status || '').toLowerCase();
          if (
            statusLower === 'cancelled' ||
            statusLower === 'voided' ||
            s.deleted_at
          ) {
            return false;
          }

          if (s.end_date) {
            const endMs = new Date(s.end_date).getTime();
            if (!isNaN(endMs) && endMs <= nowMs) {
              return false;
            }
          }

          const memberKey = String(
            s.member_id || s.resolved_member?.id || s.member_name || ''
          )
            .trim()
            .toLowerCase();
          const planKey = String(s.plan_type || '').trim().toLowerCase();
          const dateKey = s.end_date
            ? new Date(s.end_date).toISOString().slice(0, 10)
            : '';
          const dedupKey = `${memberKey}_${planKey}_${dateKey}`;

          if (seenSubKeys.has(dedupKey)) {
            return false;
          }
          seenSubKeys.add(dedupKey);

          return true;
        });

        setSubscriptionsList(activeOnly);
      } else if (activeTab === 'cash_sessions') {
        const { data, error } = await supabase
          .from('cash_sessions')
          .select('*')
          .gte('opened_at', startIso)
          .lte('opened_at', endIso)
          .order('opened_at', { ascending: false });

        if (error) throw error;
        setCashSessionsList(data || []);
      } else if (activeTab === 'cash_transactions') {
        const [txRes, sessRes] = await Promise.all([
          supabase
            .from('cash_transactions')
            .select('*')
            .gte('created_at', startIso)
            .lte('created_at', endIso)
            .order('created_at', { ascending: false }),
          supabase
            .from('cash_sessions')
            .select('id, session_number, status'),
        ]);

        if (txRes.error) throw txRes.error;
        const sessMap = new Map<string, any>();
        (sessRes.data || []).forEach((s: any) => sessMap.set(s.id, s));

        const enriched = (txRes.data || []).map((tx: any) => {
          const parentSession = sessMap.get(tx.session_id);
          return {
            ...tx,
            session_number: parentSession?.session_number || '—',
            session_status: parentSession?.status || 'closed',
          };
        });
        setCashTransactionsList(enriched);
      } else if (activeTab === 'sync_conflicts') {
        const { data, error } = await supabase
          .from('sync_conflicts')
          .select('*')
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setSyncConflictsList(data || []);
      }
    } catch (err: any) {
      toast.error(
        `Error loading ${activeTab.replace('_', ' ')}: ` +
          (err.message || 'Database error')
      );
    } finally {
      setTabLoading(false);
    }
  }, [activeTab, isSuperAdminOnly, startDate, endDate]);

  useEffect(() => {
    if (isSuperAdminOnly) {
      fetchStorageMetrics();
      fetchProducts();
    }
  }, [isSuperAdminOnly, fetchStorageMetrics, fetchProducts]);

  useEffect(() => {
    if (isSuperAdminOnly) {
      fetchTabData();
    }
  }, [isSuperAdminOnly, activeTab, fetchTabData]);

  const handlePresetDate = (preset: 'today' | '7days' | 'month' | 'all') => {
    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      const s = d.toISOString().split('T')[0];
      setStartDate(s < MIN_ALLOWED_DATE ? MIN_ALLOWED_DATE : s);
      setEndDate(todayStr);
    } else if (preset === 'month') {
      const d = new Date();
      const startOfMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      setStartDate(
        startOfMonth < MIN_ALLOWED_DATE ? MIN_ALLOWED_DATE : startOfMonth
      );
      setEndDate(todayStr);
    } else {
      setStartDate(MIN_ALLOWED_DATE);
      setEndDate(todayStr);
    }
  };

  const handleExistingSaleSuccess = async (
    newTx: any,
    updatedProducts: any[]
  ) => {
    try {
      const { data: insertedSale, error } = await supabase
        .from('sales')
        .insert([
          {
            items: newTx.items,
            product_name: newTx.productName,
            payment_method: newTx.paymentMethod,
            amount_received: newTx.amountReceived,
            change_calculated: newTx.changeCalculated,
            total_amount: newTx.totalAmount,
            reference_number: newTx.referenceNumber || null,
            cash_session_id: activeSession?.id || null,
            created_at: newTx.createdAt || new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) throw error;

      if (updatedProducts && Array.isArray(updatedProducts)) {
        for (const p of updatedProducts) {
          if (p.has_stock_limit) {
            await supabase
              .from('products')
              .update({
                stock_quantity: p.stock_quantity,
                updated_at: new Date().toISOString(),
              })
              .eq('id', p.id);
          }
        }
      }

      await logAudit(
        'SUPERADMIN_TERMINAL_SALE_CREATED',
        `SuperAdmin Terminal created sale: ₱${newTx.totalAmount.toFixed(2)} via ${newTx.paymentMethod} — Items: ${newTx.productName}`,
        insertedSale?.id || newTx.id
      );

      toast.success('Sale successfully logged!');
      fetchProducts();
      fetchTabData();
      fetchStorageMetrics();
      setIsSalesDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save sale transaction');
    }
  };

  const handleOpenDropModal = (item: any, isFromRow: boolean = false) => {
    setDropTarget({
      ...item,
      fromRow: isFromRow,
    });
    setDropReason('');
    setIsDropModalOpen(true);
  };

  const handleConfirmDropSubscription = async () => {
    if (!dropTarget) return;

    try {
      setIsDropping(true);
      const nowIso = new Date().toISOString();
      const memberId =
        dropTarget.resolved_member?.id ||
        dropTarget.member_id ||
        dropTarget.id;
      const memberName =
        dropTarget.member_name ||
        dropTarget.full_name ||
        dropTarget.display_name ||
        'Member';

      if (dropTarget.id) {
        await subscriptionService.drop(
          dropTarget.id,
          dropReason.trim() || 'Immediate Administrative Termination',
          user?.email || profile?.username || 'SuperAdmin'
        );
      }

      const memberKeys = [
        memberId,
        dropTarget.member_id,
        dropTarget.resolved_member?.id,
        dropTarget.resolved_member?.member_id,
      ].filter(Boolean);

      for (const mKey of memberKeys) {
        await supabase
          .from('subscriptions')
          .delete()
          .eq('member_id', mKey)
          .in('status', ['cancelled', 'Voided', 'voided']);

        await supabase
          .from('members')
          .update({
            status: 'Expired',
            membership_status: 'expired',
            expiry_date: null,
            updated_at: nowIso,
          })
          .or(`id.eq.${mKey},member_id.eq.${mKey}`);
      }

      try {
        sessionStorage.removeItem('members_sanitized_cache');
        localStorage.removeItem('members_sanitized_cache');
        Object.keys(sessionStorage).forEach((k) => {
          if (k.startsWith('logbook_sanitized_')) sessionStorage.removeItem(k);
        });
      } catch {}

      window.dispatchEvent(new Event('member-refresh'));
      window.dispatchEvent(new Event('palomar_logbook_updated'));

      toast.success(
        `Subscription dropped and member record updated successfully for ${memberName}.`
      );
      setIsDropModalOpen(false);
      setDropTarget(null);
      setDropReason('');
      setSubscriptionsList((prev) =>
        prev.filter((s) => s.id !== dropTarget.id)
      );
      await fetchTabData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to drop member subscription.');
    } finally {
      setIsDropping(false);
    }
  };

  const handleConfirmSingleDelete = async () => {
    if (!isSuperAdminOnly || !deleteTarget) return;

    // Extra runtime safety lock: never touch open cash sessions or their transactions
    if (
      deleteTarget.table === 'cash_sessions' &&
      String(deleteTarget.row.status || '').toLowerCase() === 'open'
    ) {
      toast.error('Cannot delete an open cash session. Close the drawer first.');
      setDeleteTarget(null);
      return;
    }
    if (
      deleteTarget.table === 'cash_transactions' &&
      String(deleteTarget.row.session_status || '').toLowerCase() === 'open'
    ) {
      toast.error(
        'Cannot delete cash transactions belonging to an active open session.'
      );
      setDeleteTarget(null);
      return;
    }

    setIsDeletingRow(true);
    try {
      let delQuery = supabase
        .from(deleteTarget.table)
        .delete()
        .eq('id', deleteTarget.row.id);

      if (deleteTarget.table === 'cash_sessions') {
        delQuery = delQuery.eq('status', 'closed');
      }

      const { error } = await delQuery;
      if (error) throw error;

      await logAudit(
        `SUPERADMIN_DB_MANAGER_DELETE_${deleteTarget.table.toUpperCase()}`,
        `SuperAdmin deleted ${deleteTarget.table} record (${deleteTarget.title}) to reclaim database storage.`,
        deleteTarget.row.id
      );

      toast.success(`Deleted ${deleteTarget.title} cleanly.`);
      setDeleteTarget(null);
      await Promise.all([fetchTabData(), fetchStorageMetrics()]);
    } catch (err: any) {
      toast.error(err?.message || `Failed to delete record.`);
    } finally {
      setIsDeletingRow(false);
    }
  };

  const openPurgeModal = (
    target:
      | 'attendance'
      | 'sales'
      | 'subscriptions'
      | 'cash_sessions'
      | 'cash_transactions'
  ) => {
    setPurgeModalTarget(target);
    if (target === 'attendance' || target === 'sales') {
      setPurgeOption('soft_deleted');
    } else if (target === 'subscriptions') {
      setPurgeOption('ended_all');
    } else if (target === 'cash_transactions') {
      setPurgeOption('voided_rejected');
    } else {
      setPurgeOption('180days');
    }
  };

  const handleExecuteBulkPurge = async () => {
    if (!isSuperAdminOnly || !purgeModalTarget) return;
    setIsPurging(true);
    try {
      const daysCutoff = (days: number) => {
        const d = new Date();
        d.setDate(d.getDate() - days);
        return d.toISOString();
      };

      let removedCount = 0;
      let summaryLabel = '';

      if (purgeModalTarget === 'attendance') {
        if (purgeOption === 'soft_deleted') {
          const { data, error } = await supabase
            .from('attendance')
            .delete()
            .not('deleted_at', 'is', null)
            .select('id');
          if (error) throw error;
          removedCount = data?.length || 0;
          summaryLabel = 'soft-deleted (Recycle Bin) attendance records';
        } else {
          const days =
            purgeOption === '90days' ? 90 : purgeOption === '180days' ? 180 : 365;
          const cutoff = daysCutoff(days);
          const { data, error } = await supabase
            .from('attendance')
            .delete()
            .lt('check_in_time', cutoff)
            .select('id');
          if (error) throw error;
          removedCount = data?.length || 0;
          summaryLabel = `attendance records older than ${days} days`;
        }
      } else if (purgeModalTarget === 'sales') {
        if (purgeOption === 'soft_deleted') {
          const { data, error } = await supabase
            .from('sales')
            .delete()
            .not('deleted_at', 'is', null)
            .select('id');
          if (error) throw error;
          removedCount = data?.length || 0;
          summaryLabel = 'soft-deleted (Recycle Bin) sales records';
        } else {
          const days =
            purgeOption === '90days' ? 90 : purgeOption === '180days' ? 180 : 365;
          const cutoff = daysCutoff(days);
          const { data, error } = await supabase
            .from('sales')
            .delete()
            .lt('created_at', cutoff)
            .select('id');
          if (error) throw error;
          removedCount = data?.length || 0;
          summaryLabel = `sales records older than ${days} days`;
        }
      } else if (purgeModalTarget === 'subscriptions') {
        if (purgeOption === 'ended_all') {
          const { data: softData, error: softErr } = await supabase
            .from('subscriptions')
            .delete()
            .not('deleted_at', 'is', null)
            .select('id');
          if (softErr) throw softErr;
          const { data: statusData, error: statusErr } = await supabase
            .from('subscriptions')
            .delete()
            .in('status', ['cancelled', 'Voided', 'voided', 'Expired', 'expired'])
            .select('id');
          if (statusErr) throw statusErr;
          removedCount = (softData?.length || 0) + (statusData?.length || 0);
          summaryLabel = 'soft-deleted, cancelled, voided, and expired subscriptions';
        } else {
          const days = purgeOption === '90days' ? 90 : 180;
          const cutoff = daysCutoff(days);
          const { data, error } = await supabase
            .from('subscriptions')
            .delete()
            .in('status', ['cancelled', 'Voided', 'voided', 'Expired', 'expired'])
            .lt('end_date', cutoff)
            .select('id');
          if (error) throw error;
          removedCount = data?.length || 0;
          summaryLabel = `ended/cancelled subscriptions older than ${days} days`;
        }
      } else if (purgeModalTarget === 'cash_sessions') {
        const days =
          purgeOption === '90days' ? 90 : purgeOption === '180days' ? 180 : 365;
        const cutoff = daysCutoff(days);
        const { data, error } = await supabase
          .from('cash_sessions')
          .delete()
          .eq('status', 'closed')
          .lt('closed_at', cutoff)
          .select('id');
        if (error) throw error;
        removedCount = data?.length || 0;
        summaryLabel = `closed cash_sessions (and cascaded cash_transactions) older than ${days} days`;
      } else if (purgeModalTarget === 'cash_transactions') {
        const { data: closedSessions, error: sessErr } = await supabase
          .from('cash_sessions')
          .select('id')
          .eq('status', 'closed');
        if (sessErr) throw sessErr;
        const closedIds = (closedSessions || []).map((s: any) => s.id);
        if (closedIds.length === 0) {
          removedCount = 0;
          summaryLabel = 'closed-session cash_transactions (no closed sessions)';
        } else if (purgeOption === 'voided_rejected') {
          let totalDel = 0;
          for (let i = 0; i < closedIds.length; i += 50) {
            const chunk = closedIds.slice(i, i + 50);
            const { data: voidedData, error: vErr } = await supabase
              .from('cash_transactions')
              .delete()
              .in('session_id', chunk)
              .eq('is_voided', true)
              .select('id');
            if (vErr) throw vErr;
            const { data: rejData, error: rErr } = await supabase
              .from('cash_transactions')
              .delete()
              .in('session_id', chunk)
              .eq('status', 'rejected')
              .select('id');
            if (rErr) throw rErr;
            totalDel += (voidedData?.length || 0) + (rejData?.length || 0);
          }
          removedCount = totalDel;
          summaryLabel = 'voided/rejected cash_transactions from closed sessions';
        } else {
          const days =
            purgeOption === '90days' ? 90 : purgeOption === '180days' ? 180 : 365;
          const cutoff = daysCutoff(days);
          let totalDel = 0;
          for (let i = 0; i < closedIds.length; i += 50) {
            const chunk = closedIds.slice(i, i + 50);
            const { data, error } = await supabase
              .from('cash_transactions')
              .delete()
              .in('session_id', chunk)
              .lt('created_at', cutoff)
              .select('id');
            if (error) throw error;
            totalDel += data?.length || 0;
          }
          removedCount = totalDel;
          summaryLabel = `closed-session cash_transactions older than ${days} days`;
        }
      }

      await logAudit(
        'SUPERADMIN_STORAGE_PURGE',
        `Purged ${removedCount} row(s): ${summaryLabel}.`
      );
      toast.success(`Purged ${removedCount} record(s) (${summaryLabel}).`);
      setPurgeModalTarget(null);
      await Promise.all([fetchTabData(), fetchStorageMetrics()]);
    } catch (err: any) {
      toast.error(err?.message || 'Storage purge failed.');
    } finally {
      setIsPurging(false);
    }
  };

  const handleRun24hSyncConflictsPurge = async () => {
    if (!isSuperAdminOnly || isPurgingConflicts) return;
    setIsPurgingConflicts(true);
    try {
      let deletedCount = 0;
      let usedRpc = false;

      try {
        const { data, error } = await supabase.rpc(
          'purge_expired_sync_conflicts'
        );
        if (!error && typeof data === 'number') {
          deletedCount = data;
          usedRpc = true;
        }
      } catch {
        // Fallback if RPC migration hasn't been pushed yet
      }

      if (!usedRpc) {
        const cutoff24h = new Date(
          Date.now() - 24 * 60 * 60 * 1000
        ).toISOString();
        const { data, error } = await supabase
          .from('sync_conflicts')
          .delete()
          .lt('created_at', cutoff24h)
          .select('id');
        if (error) throw error;
        deletedCount = data?.length || 0;
      }

      await logAudit(
        'SUPERADMIN_SYNC_CONFLICTS_24H_PURGE',
        `Executed 24-hour sync_conflicts purge cleanly: removed ${deletedCount} expired conflict record(s).`
      );
      toast.success(
        deletedCount > 0
          ? `Purged ${deletedCount} expired sync conflict(s) (>24h old).`
          : 'No sync conflicts older than 24 hours required removal.'
      );
      await Promise.all([fetchTabData(), fetchStorageMetrics()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to purge expired sync conflicts.');
    } finally {
      setIsPurgingConflicts(false);
    }
  };

  const cashSessionColumns: Column<any>[] = useMemo(
    () => [
      {
        key: 'session_number',
        header: 'Session & Drawer Status',
        sortable: true,
        render: (row) => {
          const isOpen = String(row.status || '').toLowerCase() === 'open';
          return (
            <div className="space-y-1 text-left py-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-black text-(--color-text)">
                  #{row.session_number}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase border ${
                    isOpen
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20'
                  }`}
                >
                  {isOpen ? 'OPEN (PROTECTED)' : 'CLOSED'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Opened by: <strong>{row.opened_by_name || 'Staff'}</strong>
                {row.closed_by_name && (
                  <span> • Closed by: {row.closed_by_name}</span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        key: 'opened_at',
        header: 'Opened / Closed (PHT)',
        sortable: true,
        render: (row) => (
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 space-y-0.5 text-left">
            <div>In: {formatPhtDateTime(row.opened_at)}</div>
            <div>Out: {formatPhtDateTime(row.closed_at)}</div>
          </div>
        ),
      },
      {
        key: 'opening_float',
        header: 'Float & Actual Cash',
        sortable: true,
        render: (row) => (
          <div className="text-xs font-mono tabular-nums space-y-0.5 text-left">
            <div>Float: ₱{Number(row.opening_float || 0).toFixed(2)}</div>
            <div>
              Actual:{' '}
              {row.closing_actual_cash !== null &&
              row.closing_actual_cash !== undefined
                ? `₱${Number(row.closing_actual_cash).toFixed(2)}`
                : '—'}
            </div>
            {row.discrepancy !== null &&
              row.discrepancy !== undefined &&
              Number(row.discrepancy) !== 0 && (
                <div className="text-[11px] text-amber-600 dark:text-amber-400 font-bold">
                  Diff: ₱{Number(row.discrepancy).toFixed(2)}
                </div>
              )}
          </div>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        headerClassName: 'text-right',
        cellClassName: 'text-right',
        render: (row) => {
          const isOpen = String(row.status || '').toLowerCase() === 'open';
          return (
            <div className="flex justify-end">
              <button
                type="button"
                disabled={isOpen}
                onClick={() =>
                  setDeleteTarget({
                    table: 'cash_sessions',
                    row,
                    title: `Cash Session #${row.session_number}`,
                    warning:
                      'Deleting this closed cash session will CASCADE delete all attached cash_transactions rows while keeping sales/attendance/receipts intact (their cash_session_id becomes NULL).',
                  })
                }
                title={
                  isOpen
                    ? 'Protected: Cannot delete an active OPEN cash session'
                    : 'Delete closed session & cascade remove its cash_transactions'
                }
                className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
              >
                {isOpen ? (
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          );
        },
      },
    ],
    []
  );

  const cashTransactionColumns: Column<any>[] = useMemo(
    () => [
      {
        key: 'type',
        header: 'Type & Category',
        sortable: true,
        render: (row) => {
          const typeUpper = String(row.type || '').toUpperCase();
          return (
            <div className="space-y-1 text-left py-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase border ${
                    row.type === 'cash_in'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : row.type === 'cash_out'
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                        : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                  }`}
                >
                  {typeUpper.replace('_', ' ')}
                </span>
                {row.is_voided && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    VOIDED
                  </span>
                )}
                <span className="text-[10px] font-mono text-slate-400">
                  #{row.session_number}
                </span>
              </div>
              <div className="text-xs font-bold text-(--color-text) truncate max-w-[200px]">
                {row.category || 'General'}
              </div>
            </div>
          );
        },
      },
      {
        key: 'amount',
        header: 'Amount & Status',
        sortable: true,
        render: (row) => (
          <div className="space-y-0.5 text-left">
            <div className="font-mono text-xs font-black tabular-nums text-(--color-text)">
              ₱{Number(row.amount || 0).toFixed(2)}
            </div>
            <div className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400">
              {row.status || 'completed'} • {row.performed_by_name || 'Staff'}
            </div>
          </div>
        ),
      },
      {
        key: 'reason',
        header: 'Reason & Time (PHT)',
        render: (row) => (
          <div className="text-left space-y-0.5 max-w-xs">
            <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
              {row.reason || row.reference_number || '—'}
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              {formatPhtDateTime(row.created_at)}
            </div>
          </div>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        headerClassName: 'text-right',
        cellClassName: 'text-right',
        render: (row) => {
          const isOpenSession =
            String(row.session_status || '').toLowerCase() === 'open';
          return (
            <div className="flex justify-end">
              <button
                type="button"
                disabled={isOpenSession}
                onClick={() =>
                  setDeleteTarget({
                    table: 'cash_transactions',
                    row,
                    title: `${String(row.type || '').toUpperCase()} ₱${Number(row.amount || 0).toFixed(2)}`,
                    warning:
                      'Permanently deletes this cash_transactions ledger row from the closed session to reclaim database storage.',
                  })
                }
                title={
                  isOpenSession
                    ? 'Protected: Cannot delete transactions in an active OPEN cash session'
                    : 'Delete cash transaction'
                }
                className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
              >
                {isOpenSession ? (
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          );
        },
      },
    ],
    []
  );

  const syncConflictColumns: Column<any>[] = useMemo(
    () => [
      {
        key: 'product_name',
        header: 'Product & Conflict Type',
        sortable: true,
        render: (row) => (
          <div className="space-y-1 text-left py-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-xs text-(--color-text)">
                {row.product_name || 'Unknown Product'}
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {row.conflict_type || 'stock_collision'}
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              ID: {String(row.id || '').slice(0, 8)}...
            </div>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Resolution Status',
        sortable: true,
        render: (row) => {
          const st = String(row.status || 'pending').toLowerCase();
          return (
            <div className="space-y-0.5 text-left">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase border ${
                  st === 'resolved'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                }`}
              >
                {st === 'resolved' ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <Clock className="w-3 h-3" />
                )}
                <span>{st}</span>
              </span>
              {row.resolution && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {row.resolution}
                  {row.resolved_by_name ? ` (${row.resolved_by_name})` : ''}
                </div>
              )}
            </div>
          );
        },
      },
      {
        key: 'created_at',
        header: 'Created Time (PHT)',
        sortable: true,
        render: (row) => {
          const ageMs = Date.now() - new Date(row.created_at).getTime();
          const isExpired24h = ageMs >= 24 * 60 * 60 * 1000;
          return (
            <div className="text-[11px] font-mono text-left space-y-0.5">
              <div className="text-slate-600 dark:text-slate-300">
                {formatPhtDateTime(row.created_at)}
              </div>
              {isExpired24h && (
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  &gt;24h (Eligible for Purge)
                </span>
              )}
            </div>
          );
        },
      },
      {
        key: 'actions',
        header: 'Actions',
        headerClassName: 'text-right',
        cellClassName: 'text-right',
        render: (row) => (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setDeleteTarget({
                  table: 'sync_conflicts',
                  row,
                  title: `Sync Conflict (${row.product_name || row.id})`,
                  warning:
                    'Permanently removes this offline stock collision record from public.sync_conflicts.',
                })
              }
              title="Delete conflict record"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ),
      },
    ],
    []
  );

  // Derived quota usage percentage
  const dbQuotaPct = useMemo(() => {
    if (dbSizeBytes === null) return 0;
    return Math.min(
      100,
      Math.round((dbSizeBytes / POSTGRES_FREE_TIER_BYTES) * 1000) / 10
    );
  }, [dbSizeBytes]);

  if (!isSuperAdminOnly) {
    return (
      <div className="p-6 sm:p-8 rounded-2xl bg-(--bg-card) border border-rose-500/30 text-center space-y-3 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="font-heading font-black text-base uppercase tracking-wider text-(--color-text)">
          SuperAdmin Clearance Required
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
          Database Manager belongs exclusively to the Superadmin Console.
          Regular Admin and Staff accounts cannot access terminal cleanup or
          storage purge tools.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 font-body text-(--color-text) pb-24 sm:pb-12 text-left">
      {/* HEADER + POSTGRES STORAGE QUOTA CARD */}
      <div className="p-4 sm:p-5 rounded-2xl bg-(--bg-card) border border-(--border-color) shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-heading font-black text-base sm:text-lg uppercase tracking-wider text-(--color-text)">
                  Database Manager
                </h2>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  • SuperAdmin Terminal &amp; Storage Cleanup
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Inspect, manage, and purge high-growth tables (Attendance,
                Sales, Subscriptions, Cash Sessions, Cash Transactions, Audit
                Logs, and 24h Sync Conflicts) to keep Postgres storage within
                quota limits.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              fetchStorageMetrics();
              fetchTabData();
            }}
            disabled={loadingStorage || tabLoading}
            className="self-start sm:self-center px-3.5 py-2 rounded-xl border border-(--border-color) bg-(--bg-page) hover:bg-(--bg-input) text-xs font-heading font-bold uppercase tracking-wider cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-45 shrink-0"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loadingStorage || tabLoading ? 'animate-spin' : ''}`}
            />
            <span>Refresh Telemetry</span>
          </button>
        </div>

        {/* Storage Quota Telemetry Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div className="md:col-span-2 p-3.5 rounded-xl bg-(--bg-page) border border-(--border-color) space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-heading font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Postgres Database Usage (500 MB Tier)
              </span>
              <span className="font-mono font-black text-(--color-text) tabular-nums">
                {dbSizeBytes !== null
                  ? `${formatBytes(dbSizeBytes)} / 500.00 MB (${dbQuotaPct}%)`
                  : 'Telemetry pending...'}
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  dbQuotaPct >= 90
                    ? 'bg-rose-500'
                    : dbQuotaPct >= 75
                      ? 'bg-amber-500'
                      : 'bg-blue-600'
                }`}
                style={{ width: `${Math.max(2, dbQuotaPct)}%` }}
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-(--bg-page) border border-(--border-color) flex flex-col justify-between gap-1">
            <span className="text-[11px] font-heading font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Bucket Object Storage
            </span>
            <span className="text-base font-mono font-black text-blue-600 dark:text-blue-400 tabular-nums">
              {bucketSizeBytes !== null
                ? formatBytes(bucketSizeBytes)
                : 'Unavailable'}
            </span>
          </div>
        </div>
      </div>

      {/* SUPERADMIN TERMINAL MAIN PANEL */}
      <div className="p-3.5 sm:p-5 rounded-2xl bg-(--bg-card) border border-(--border-color) shadow-xs space-y-4">
        {/* Terminal Tab Navigation */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-(--bg-page) border border-(--border-color) overflow-x-auto scrollbar-none">
          {(
            [
              { id: 'attendance', label: 'Attendance' },
              { id: 'sales', label: 'Sales' },
              { id: 'subscriptions', label: 'Subscriptions' },
              { id: 'cash_sessions', label: 'Cash Sessions' },
              { id: 'cash_transactions', label: 'Cash Transactions' },
              { id: 'audit_logs', label: 'Audit Logs' },
              { id: 'sync_conflicts', label: 'Sync Conflicts' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold uppercase tracking-wider cursor-pointer transition-colors shrink-0 whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-(--color-text)'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Date Filter Bar (Shared across date-indexed tables) */}
        {activeTab !== 'subscriptions' && (
          <div className="p-3 sm:p-3.5 rounded-xl bg-(--bg-page) border border-(--border-color) flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs font-heading font-bold uppercase tracking-wider w-full sm:w-auto">
              <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>Range:</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="date"
                  min={MIN_ALLOWED_DATE}
                  max={todayStr}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="flex-1 sm:flex-initial w-full sm:w-auto px-2 py-1.5 sm:py-1 rounded-lg border border-(--border-color) bg-(--bg-card) text-xs font-mono"
                />
                <span className="text-slate-400 font-normal lowercase">to</span>
                <input
                  type="date"
                  min={MIN_ALLOWED_DATE}
                  max={todayStr}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="flex-1 sm:flex-initial w-full sm:w-auto px-2 py-1.5 sm:py-1 rounded-lg border border-(--border-color) bg-(--bg-card) text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 sm:flex items-center gap-1.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handlePresetDate('all')}
                className="px-2.5 py-1.5 sm:py-1 rounded-lg text-[10px] font-heading font-bold uppercase bg-(--bg-card) border border-(--border-color) hover:border-blue-500 cursor-pointer text-center"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => handlePresetDate('month')}
                className="px-2.5 py-1.5 sm:py-1 rounded-lg text-[10px] font-heading font-bold uppercase bg-(--bg-card) border border-(--border-color) hover:border-blue-500 cursor-pointer text-center whitespace-nowrap"
              >
                Month
              </button>
              <button
                type="button"
                onClick={() => handlePresetDate('7days')}
                className="px-2.5 py-1.5 sm:py-1 rounded-lg text-[10px] font-heading font-bold uppercase bg-(--bg-card) border border-(--border-color) hover:border-blue-500 cursor-pointer text-center whitespace-nowrap"
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => handlePresetDate('today')}
                className="px-2.5 py-1.5 sm:py-1 rounded-lg text-[10px] font-heading font-bold uppercase bg-(--bg-card) border border-(--border-color) hover:border-blue-500 cursor-pointer text-center"
              >
                Today
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: ATTENDANCE */}
        {activeTab === 'attendance' && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-(--bg-page) border border-(--border-color)">
              <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold">
                {attendanceList.length} attendance record(s) in selected range
              </span>
              <button
                type="button"
                onClick={() => openPurgeModal('attendance')}
                className="self-start sm:self-auto py-1.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-heading font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clean Storage (Purge Attendance)</span>
              </button>
            </div>
            <AttendanceManager
              attendanceList={attendanceList}
              loading={tabLoading}
              isSuperAdmin={isSuperAdminOnly}
              onRefresh={() => {
                fetchTabData();
                fetchStorageMetrics();
              }}
              onOpenNewModal={() => setIsAttendanceDialogOpen(true)}
            />
          </div>
        )}

        {/* TAB 2: SALES */}
        {activeTab === 'sales' && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-(--bg-page) border border-(--border-color)">
              <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold">
                {salesList.length} sale transaction(s) in selected range
              </span>
              <button
                type="button"
                onClick={() => openPurgeModal('sales')}
                className="self-start sm:self-auto py-1.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-heading font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clean Storage (Purge Sales)</span>
              </button>
            </div>
            <SalesManager
              sales={salesList}
              loading={tabLoading}
              isSuperAdmin={isSuperAdminOnly}
              onRefresh={() => {
                fetchTabData();
                fetchStorageMetrics();
              }}
              onOpenNewModal={() => setIsSalesDialogOpen(true)}
            />
          </div>
        )}

        {/* TAB 3: SUBSCRIPTIONS */}
        {activeTab === 'subscriptions' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-(--bg-page) p-3 rounded-xl border border-(--border-color)">
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  autoCorrect="off"
                  value={subscriptionSearch}
                  onChange={(e) => setSubscriptionSearch(e.target.value)}
                  placeholder="Search member by name, phone, or plan..."
                  className="w-full pl-9 pr-4 py-2 border border-(--border-color) rounded-xl bg-(--bg-card) text-xs text-(--color-text) placeholder:text-slate-400 outline-none focus:border-blue-500 transition-all font-medium"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => openPurgeModal('subscriptions')}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Purge Ended Subs</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (subscriptionsList.length > 0) {
                      setDropTarget({ ...subscriptionsList[0], fromRow: false });
                    } else {
                      setDropTarget({
                        member_name: 'Manual Drop',
                        fromRow: false,
                      });
                    }
                    setDropReason('');
                    setIsDropModalOpen(true);
                  }}
                  className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-heading font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                  title="Drop a member subscription immediately"
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>Drop Subscription</span>
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {tabLoading ? (
                <div className="p-8 text-center text-xs text-slate-400 font-mono flex items-center justify-center gap-2 bg-(--bg-page) rounded-xl border border-(--border-color)">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <span>Loading active subscriptions...</span>
                </div>
              ) : (
                (() => {
                  const filteredSubs = subscriptionsList.filter((s) => {
                    if (!subscriptionSearch.trim()) return true;
                    const q = subscriptionSearch.toLowerCase().trim();
                    return (
                      s.member_name?.toLowerCase().includes(q) ||
                      s.member_email?.toLowerCase().includes(q) ||
                      s.member_phone?.toLowerCase().includes(q) ||
                      s.plan_type?.toLowerCase().includes(q)
                    );
                  });

                  if (filteredSubs.length === 0) {
                    return (
                      <div className="p-8 text-center text-xs text-slate-400 font-mono bg-(--bg-page) rounded-xl border border-(--border-color)">
                        No active subscriptions found.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2.5">
                      {filteredSubs.map((sub) => (
                        <div
                          key={sub.id}
                          className="p-3.5 sm:p-4 rounded-xl border border-(--border-color) bg-(--bg-page) flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left"
                        >
                          <div className="min-w-0 space-y-1.5 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-heading font-black text-xs sm:text-sm uppercase text-(--color-text) truncate">
                                {sub.member_name}
                              </span>
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-heading font-black uppercase tracking-wider border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                                Active Plan
                              </span>
                              {sub.plan_type && (
                                <span className="px-2 py-0.5 rounded-md text-[9px] font-mono uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                  {sub.plan_type}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                              {sub.member_phone && (
                                <span>Phone: {sub.member_phone}</span>
                              )}
                              {sub.member_email && sub.member_email !== '—' && (
                                <span className="truncate max-w-[200px]">
                                  Email: {sub.member_email}
                                </span>
                              )}
                              {sub.end_date && (
                                <span>
                                  Ends:{' '}
                                  {new Date(sub.end_date).toLocaleDateString(
                                    'en-US',
                                    {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                      timeZone: 'Asia/Manila',
                                    }
                                  )}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="pt-2 sm:pt-0 border-t sm:border-t-0 border-(--border-color) shrink-0 flex items-center justify-end">
                            <button
                              type="button"
                              onClick={() => handleOpenDropModal(sub, true)}
                              className="w-full sm:w-auto px-3.5 py-2 sm:py-1.5 rounded-lg text-xs font-heading font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 border bg-rose-600 hover:bg-rose-700 text-white border-rose-600 shadow-xs"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span>Drop Subscription</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}

        {/* TAB 4: CASH SESSIONS */}
        {activeTab === 'cash_sessions' && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-(--bg-page) border border-(--border-color)">
              <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 font-semibold">
                <Banknote className="w-4 h-4 shrink-0" />
                <span>
                  {cashSessionsList.length} cash session(s) • Deleting a closed
                  session cascades to its cash_transactions while keeping sales
                  and logbook intact.
                </span>
              </div>
              <button
                type="button"
                onClick={() => openPurgeModal('cash_sessions')}
                className="self-start sm:self-auto py-1.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-heading font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs transition-all shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Purge Closed Sessions</span>
              </button>
            </div>

            <Table
              data={cashSessionsList}
              columns={cashSessionColumns}
              searchKeys={[
                'session_number',
                'opened_by_name',
                'closed_by_name',
                'status',
              ]}
              searchPlaceholder="Search sessions by number, cashier, status..."
              loading={tabLoading}
              itemsPerPage={responsiveItemsPerPage}
            />
          </div>
        )}

        {/* TAB 5: CASH TRANSACTIONS */}
        {activeTab === 'cash_transactions' && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-(--bg-page) border border-(--border-color)">
              <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 font-semibold">
                <ArrowUpDown className="w-4 h-4 shrink-0" />
                <span>
                  {cashTransactionsList.length} cash transaction(s) • Active
                  open session transactions are write-protected.
                </span>
              </div>
              <button
                type="button"
                onClick={() => openPurgeModal('cash_transactions')}
                className="self-start sm:self-auto py-1.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-heading font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs transition-all shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Purge Closed Cash Ledger</span>
              </button>
            </div>

            <Table
              data={cashTransactionsList}
              columns={cashTransactionColumns}
              searchKeys={[
                'type',
                'category',
                'reason',
                'reference_number',
                'performed_by_name',
                'session_number',
              ]}
              searchPlaceholder="Search transactions by type, category, cashier, reason..."
              loading={tabLoading}
              itemsPerPage={responsiveItemsPerPage}
            />
          </div>
        )}

        {/* TAB 6: AUDIT LOGS */}
        {activeTab === 'audit_logs' && (
          <AuditLogsManager
            auditLogsList={auditLogsList}
            loading={tabLoading}
            isSuperAdmin={isSuperAdminOnly}
            onRefresh={() => {
              fetchTabData();
              fetchStorageMetrics();
            }}
          />
        )}

        {/* TAB 7: SYNC CONFLICTS (WITH 24H AUTOMATED PG_CRON SCHEDULE) */}
        {activeTab === 'sync_conflicts' && (
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 text-xs">
                <AlertOctagon className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <strong className="font-heading uppercase text-[11px] tracking-wider text-blue-700 dark:text-blue-300 block">
                    Automated 24-Hour Sync Conflicts Purge Active (pg_cron)
                  </strong>
                  <span className="text-slate-600 dark:text-slate-300">
                    Hourly pg_cron job (
                    <code className="font-mono">
                      hourly-purge-sync-conflicts-24h
                    </code>
                    ) automatically deletes{' '}
                    <code className="font-mono">sync_conflicts</code> rows older
                    than 24 hours. Use the button to trigger an immediate purge.
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRun24hSyncConflictsPurge}
                disabled={isPurgingConflicts}
                className="self-start sm:self-center py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-heading font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs transition-all shrink-0 disabled:opacity-50"
              >
                {isPurgingConflicts ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Run 24h Purge Now</span>
              </button>
            </div>

            <Table
              data={syncConflictsList}
              columns={syncConflictColumns}
              searchKeys={[
                'product_name',
                'conflict_type',
                'status',
                'resolution',
                'resolved_by_name',
              ]}
              searchPlaceholder="Search sync conflicts by product, status, resolution..."
              loading={tabLoading}
              itemsPerPage={responsiveItemsPerPage}
            />
          </div>
        )}
      </div>

      {/* MODAL: SINGLE RECORD DELETE CONFIRMATION */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => !isDeletingRow && setDeleteTarget(null)}
        title="Confirm Permanent Storage Deletion"
        className="max-w-md w-full p-5 text-left"
      >
        {deleteTarget && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <strong className="font-heading uppercase text-[11px] text-rose-600 dark:text-rose-400 block">
                  {deleteTarget.title}
                </strong>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  {deleteTarget.warning}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-(--border-color)">
              <Button
                type="button"
                variant="secondary"
                disabled={isDeletingRow}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                loading={isDeletingRow}
                loadingLabel="Deleting..."
                onClick={handleConfirmSingleDelete}
                className="!bg-rose-600 hover:!bg-rose-500 !border-rose-600 text-white"
              >
                Permanently Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: BULK STORAGE PURGE */}
      <Modal
        isOpen={Boolean(purgeModalTarget)}
        onClose={() => !isPurging && setPurgeModalTarget(null)}
        title="Reclaim Database Storage (Bulk Purge)"
        className="max-w-md w-full p-5 text-left"
      >
        {purgeModalTarget && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                This permanently deletes matching historical rows in{' '}
                <strong className="text-(--color-text)">
                  {purgeModalTarget.replace('_', ' ')}
                </strong>{' '}
                to reclaim Postgres storage quota. Active open cash sessions are
                strictly excluded.
              </p>
            </div>

            <div className="space-y-2">
              {(purgeModalTarget === 'attendance' ||
                purgeModalTarget === 'sales') && (
                <>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-(--border-color) bg-(--bg-page) cursor-pointer">
                    <input
                      type="radio"
                      name="dbPurgeOpt"
                      value="soft_deleted"
                      checked={purgeOption === 'soft_deleted'}
                      onChange={(e) => setPurgeOption(e.target.value)}
                    />
                    <div>
                      <span className="font-bold text-(--color-text) block">
                        Empty Recycle Bin (Soft-Deleted Only)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Safest option: permanently removes rows already moved to
                        trash.
                      </span>
                    </div>
                  </label>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-(--border-color) bg-(--bg-page) cursor-pointer">
                    <input
                      type="radio"
                      name="dbPurgeOpt"
                      value="90days"
                      checked={purgeOption === '90days'}
                      onChange={(e) => setPurgeOption(e.target.value)}
                    />
                    <span className="font-bold text-(--color-text)">
                      Older than 90 Days
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-(--border-color) bg-(--bg-page) cursor-pointer">
                    <input
                      type="radio"
                      name="dbPurgeOpt"
                      value="180days"
                      checked={purgeOption === '180days'}
                      onChange={(e) => setPurgeOption(e.target.value)}
                    />
                    <span className="font-bold text-(--color-text)">
                      Older than 180 Days
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-(--border-color) bg-(--bg-page) cursor-pointer">
                    <input
                      type="radio"
                      name="dbPurgeOpt"
                      value="365days"
                      checked={purgeOption === '365days'}
                      onChange={(e) => setPurgeOption(e.target.value)}
                    />
                    <span className="font-bold text-(--color-text)">
                      Older than 1 Year
                    </span>
                  </label>
                </>
              )}

              {purgeModalTarget === 'subscriptions' && (
                <>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-(--border-color) bg-(--bg-page) cursor-pointer">
                    <input
                      type="radio"
                      name="dbPurgeOpt"
                      value="ended_all"
                      checked={purgeOption === 'ended_all'}
                      onChange={(e) => setPurgeOption(e.target.value)}
                    />
                    <div>
                      <span className="font-bold text-(--color-text) block">
                        All Cancelled, Voided, Expired &amp; Soft-Deleted
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Active member plans remain completely untouched.
                      </span>
                    </div>
                  </label>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-(--border-color) bg-(--bg-page) cursor-pointer">
                    <input
                      type="radio"
                      name="dbPurgeOpt"
                      value="90days"
                      checked={purgeOption === '90days'}
                      onChange={(e) => setPurgeOption(e.target.value)}
                    />
                    <span className="font-bold text-(--color-text)">
                      Ended / Cancelled Over 90 Days Ago
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-(--border-color) bg-(--bg-page) cursor-pointer">
                    <input
                      type="radio"
                      name="dbPurgeOpt"
                      value="180days"
                      checked={purgeOption === '180days'}
                      onChange={(e) => setPurgeOption(e.target.value)}
                    />
                    <span className="font-bold text-(--color-text)">
                      Ended / Cancelled Over 180 Days Ago
                    </span>
                  </label>
                </>
              )}

              {purgeModalTarget === 'cash_sessions' && (
                <>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-(--border-color) bg-(--bg-page) cursor-pointer">
                    <input
                      type="radio"
                      name="dbPurgeOpt"
                      value="90days"
                      checked={purgeOption === '90days'}
                      onChange={(e) => setPurgeOption(e.target.value)}
                    />
                    <span className="font-bold text-(--color-text)">
                      Closed Sessions Older than 90 Days (+ Cascaded Ledger)
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-(--border-color) bg-(--bg-page) cursor-pointer">
                    <input
                      type="radio"
                      name="dbPurgeOpt"
                      value="180days"
                      checked={purgeOption === '180days'}
                      onChange={(e) => setPurgeOption(e.target.value)}
                    />
                    <span className="font-bold text-(--color-text)">
                      Closed Sessions Older than 180 Days (+ Cascaded Ledger)
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-(--border-color) bg-(--bg-page) cursor-pointer">
                    <input
                      type="radio"
                      name="dbPurgeOpt"
                      value="365days"
                      checked={purgeOption === '365days'}
                      onChange={(e) => setPurgeOption(e.target.value)}
                    />
                    <span className="font-bold text-(--color-text)">
                      Closed Sessions Older than 1 Year (+ Cascaded Ledger)
                    </span>
                  </label>
                </>
              )}

              {purgeModalTarget === 'cash_transactions' && (
                <>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-(--border-color) bg-(--bg-page) cursor-pointer">
                    <input
                      type="radio"
                      name="dbPurgeOpt"
                      value="voided_rejected"
                      checked={purgeOption === 'voided_rejected'}
                      onChange={(e) => setPurgeOption(e.target.value)}
                    />
                    <div>
                      <span className="font-bold text-(--color-text) block">
                        Voided &amp; Rejected Entries (Closed Sessions Only)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Removes voided/rejected rows without deleting approved
                        entries.
                      </span>
                    </div>
                  </label>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-(--border-color) bg-(--bg-page) cursor-pointer">
                    <input
                      type="radio"
                      name="dbPurgeOpt"
                      value="90days"
                      checked={purgeOption === '90days'}
                      onChange={(e) => setPurgeOption(e.target.value)}
                    />
                    <span className="font-bold text-(--color-text)">
                      Closed-Session Ledger Older than 90 Days
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-(--border-color) bg-(--bg-page) cursor-pointer">
                    <input
                      type="radio"
                      name="dbPurgeOpt"
                      value="180days"
                      checked={purgeOption === '180days'}
                      onChange={(e) => setPurgeOption(e.target.value)}
                    />
                    <span className="font-bold text-(--color-text)">
                      Closed-Session Ledger Older than 180 Days
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-(--border-color) bg-(--bg-page) cursor-pointer">
                    <input
                      type="radio"
                      name="dbPurgeOpt"
                      value="365days"
                      checked={purgeOption === '365days'}
                      onChange={(e) => setPurgeOption(e.target.value)}
                    />
                    <span className="font-bold text-(--color-text)">
                      Closed-Session Ledger Older than 1 Year
                    </span>
                  </label>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-(--border-color)">
              <Button
                type="button"
                variant="secondary"
                disabled={isPurging}
                onClick={() => setPurgeModalTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                loading={isPurging}
                loadingLabel="Purging..."
                onClick={handleExecuteBulkPurge}
                className="!bg-rose-600 hover:!bg-rose-500 !border-rose-600 text-white"
              >
                Confirm Purge
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: DROP MEMBER SUBSCRIPTION */}
      <Modal
        isOpen={isDropModalOpen}
        onClose={() => {
          if (!isDropping) {
            setIsDropModalOpen(false);
            setDropTarget(null);
            setDropReason('');
          }
        }}
        title="Drop Member's Subscription Immediately"
      >
        {dropTarget && (
          <div className="space-y-4 font-body text-left">
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3.5 text-xs font-bold leading-snug">
              <AlertTriangle className="w-6 h-6 shrink-0 text-rose-600 dark:text-rose-500 mt-0.5" />
              <div className="space-y-1">
                <span className="block font-heading tracking-wider uppercase text-[10px] text-rose-700 dark:text-rose-400 font-extrabold">
                  SUPERADMIN TERMINATION WARNING
                </span>
                <span className="block text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                  Dropping this subscription affects check-in eligibility.
                  Existing logbook and cash session records remain untouched.
                </span>
              </div>
            </div>

            {dropTarget.fromRow ? (
              <div className="p-3.5 rounded-xl bg-(--bg-page) border border-(--border-color) space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-heading uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
                    Target Member
                  </span>
                  {dropTarget.plan_type && (
                    <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md uppercase">
                      {dropTarget.plan_type}
                    </span>
                  )}
                </div>
                <div className="text-sm font-heading font-black text-(--color-text) uppercase">
                  {dropTarget.member_name || dropTarget.full_name || 'Member'}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label
                  htmlFor="dbMgrTargetMemberSelect"
                  className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                >
                  Select Active Subscription
                </label>
                {subscriptionsList.length > 0 ? (
                  <select
                    id="dbMgrTargetMemberSelect"
                    value={dropTarget.id}
                    onChange={(e) => {
                      const found = subscriptionsList.find(
                        (s) => s.id === e.target.value
                      );
                      if (found) {
                        setDropTarget({ ...found, fromRow: true });
                      }
                    }}
                    className="w-full px-3 py-2.5 rounded-lg border border-(--border-color) bg-(--bg-page) text-sm font-semibold text-(--color-text)"
                  >
                    {subscriptionsList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.member_name} — {s.plan_type?.toUpperCase()}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-2.5 rounded-lg border border-(--border-color) bg-(--bg-page) text-xs font-bold text-(--color-text)">
                    {dropTarget.member_name || dropTarget.full_name}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="dbMgrDropReasonInput"
                className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
              >
                Reason for Immediate Drop (Optional)
              </label>
              <input
                id="dbMgrDropReasonInput"
                type="text"
                autoComplete="off"
                spellCheck={false}
                autoCorrect="off"
                disabled={isDropping}
                value={dropReason}
                onChange={(e) => setDropReason(e.target.value)}
                placeholder="e.g. Refund issued, early exit..."
                className="w-full px-3.5 py-2.5 border border-(--border-color) rounded-lg text-sm bg-(--bg-page) text-(--color-text) placeholder:text-slate-400 outline-none focus:border-rose-500 transition-all font-medium disabled:opacity-50"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                disabled={isDropping}
                onClick={() => {
                  setIsDropModalOpen(false);
                  setDropTarget(null);
                  setDropReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDropSubscription}
                loading={isDropping}
                loadingLabel="DROPPING SUBSCRIPTION..."
                className="!bg-rose-600 hover:!bg-rose-700 !border-rose-600 text-white"
              >
                Drop Subscription Now
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* SHARED CREATE MODALS FOR ATTENDANCE & SALES */}
      {isSalesDialogOpen && (
        <SalesDialog
          isOpen={isSalesDialogOpen}
          onClose={() => setIsSalesDialogOpen(false)}
          products={products}
          onSaleSuccess={handleExistingSaleSuccess}
        />
      )}

      {isAttendanceDialogOpen && (
        <LogbookRecordAttendance
          isOpen={isAttendanceDialogOpen}
          onClose={() => setIsAttendanceDialogOpen(false)}
          onCheckInSuccess={() => {
            fetchTabData();
            fetchStorageMetrics();
            setIsAttendanceDialogOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default DatabaseManager;

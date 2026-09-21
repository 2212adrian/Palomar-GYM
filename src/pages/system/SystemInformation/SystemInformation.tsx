import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Scale,
  RefreshCw,
  Code2,
  Phone,
  Mail,
  CheckCircle2,
  Database,
  Cloud,
  ChevronRight,
  Lock,
  ShieldAlert,
  Calendar,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../../../components/ui/Modal';
import { AgreementDocumentViewer } from '../../../components/ui/AgreementDocumentViewer';

import pkg from '../../../../package.json';

import { useAuthStore } from '../../../stores/authStore';
import { isSuperAdmin } from '../../../constants/auth';
import { useCashSessionStore } from '../../../stores/useCashSessionStore';
import { supabase } from '../../../lib/supabase/client';
import { logAudit } from '../../../lib/supabase/audit';
import { formatBytes } from '../../../lib/appUpdateService';

// Integrated Existing Shared Dialogs
import { SalesDialog } from '../../sales/components/SalesDialog';
import { LogbookRecordAttendance } from '../../logbook/components/LogbookRecordAttendance';

// SuperAdmin Module Managers
import { SalesManager } from './SalesManager';
import { AttendanceManager } from './AttendanceManager';
import { AuditLogsManager } from './AuditLogsManager';

const MIN_ALLOWED_DATE = '2024-01-01';

const getTodayDateString = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const SystemInformation: React.FC = () => {
  const { user, profile } = useAuthStore() as any;
  const { activeSession } = useCashSessionStore();

  // Strict superadmin verification
  const isSuperAdminOnly = useMemo(() => {
    return isSuperAdmin(user?.email || profile?.email);
  }, [user?.email, profile?.email]);

  const APP_VERSION = pkg.version;
  const [activeModal, setActiveModal] = useState<
    'terms' | 'privacy' | 'developer' | null
  >(null);

  // Storage and DB Gauges
  const [totalDbBytes] = useState<number>(17.6 * 1024 * 1024);
  const totalStorageBytes = 207.6 * 1024;
  const maxDbBytes = 500 * 1024 * 1024;
  const maxStorageBytes = 1 * 1024 * 1024 * 1024;

  const dbUsagePercent = Math.min(100, (totalDbBytes / maxDbBytes) * 100);
  const storageUsagePercent = Math.min(
    100,
    (totalStorageBytes / maxStorageBytes) * 100
  );

  // Date Range Filter
  const todayStr = useMemo(() => getTodayDateString(), []);
  const [startDate, setStartDate] = useState<string>(MIN_ALLOWED_DATE);
  const [endDate, setEndDate] = useState<string>(todayStr);

  // Terminal Tab State
  const [activeTab, setActiveTab] = useState<
    'attendance' | 'sales' | 'audit_logs'
  >('attendance');
  const [tabLoading, setTabLoading] = useState<boolean>(false);
  const [attendanceList, setAttendanceList] = useState<any[]>([]);
  const [salesList, setSalesList] = useState<any[]>([]);
  const [auditLogsList, setAuditLogsList] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  // Reusable Dialog Visibility States
  const [isSalesDialogOpen, setIsSalesDialogOpen] = useState<boolean>(false);
  const [isAttendanceDialogOpen, setIsAttendanceDialogOpen] =
    useState<boolean>(false);

  // Fetch product catalog for the existing SalesDialog
  const fetchProducts = useCallback(async () => {
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
  }, []);

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
      }
    } catch (err: any) {
      toast.error(
        `Error loading ${activeTab}: ` + (err.message || 'Database error')
      );
    } finally {
      setTabLoading(false);
    }
  }, [activeTab, isSuperAdminOnly, startDate, endDate]);

  useEffect(() => {
    if (isSuperAdminOnly) {
      fetchProducts();
      fetchTabData();
    }
  }, [isSuperAdminOnly, activeTab, fetchProducts, fetchTabData]);

  // Integrated SalesDialog success callback (commits to sales ledger and updates stock)
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

      // Update product stocks
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
        'SALE_CREATED',
        `SuperAdmin Terminal created sale: ₱${newTx.totalAmount.toFixed(2)} via ${newTx.paymentMethod} — Items: ${newTx.productName}`,
        insertedSale?.id || newTx.id
      );

      toast.success('Sale successfully logged!');
      fetchProducts();
      fetchTabData();
      setIsSalesDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save sale transaction');
    }
  };

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

  return (
    <div className="space-y-6 font-body text-slate-800 dark:text-slate-100 p-0 sm:p-1 relative max-w-7xl mx-auto">
      {/* Header */}
      <div className="space-y-1">
        <span className="text-[10px] font-heading tracking-widest text-[#123c73] dark:text-red-500 uppercase font-black">
          SYSTEM / CONFIGURATIONS
        </span>
        <h1 className="text-2xl sm:text-3xl font-heading font-black tracking-wider uppercase text-slate-900 dark:text-slate-100">
          SYSTEM INFORMATION
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {isSuperAdminOnly
            ? 'SuperAdmin Master Terminal: Master database CRUD, storage optimization, and records administration.'
            : 'Application specifications, version metadata, and facility legal documentation.'}
        </p>
      </div>

      {/* System Status Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading font-black text-sm uppercase tracking-wider text-slate-900 dark:text-white">
                SYSTEM UP TO DATE
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                v{APP_VERSION} STABLE
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Wolf Palomar Gym Terminal is running the production build.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            fetchTabData();
            toast.success('Terminal data refreshed');
          }}
          disabled={tabLoading}
          className="py-2.5 px-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-neutral-800 hover:bg-slate-100 dark:hover:bg-neutral-700 text-slate-700 dark:text-slate-200 font-heading font-black text-xs tracking-wider uppercase flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${tabLoading ? 'animate-spin' : ''}`}
          />
          <span>REFRESH TERMINAL</span>
        </button>
      </div>

      {/* Storage Gauges for SuperAdmin */}
      {isSuperAdminOnly && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Database className="w-5 h-5" />
              </div>
              <div className="text-right">
                <span className="text-base sm:text-lg font-heading font-black tracking-wider text-slate-900 dark:text-white">
                  {formatBytes(totalDbBytes)}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {' '}
                  / 500 MB
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-[11px] font-heading font-bold uppercase tracking-wider text-slate-400">
                DATABASE USAGE
              </span>
              <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-neutral-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${Math.max(2, dbUsagePercent)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                <Cloud className="w-5 h-5" />
              </div>
              <div className="text-right">
                <span className="text-base sm:text-lg font-heading font-black tracking-wider text-slate-900 dark:text-white">
                  {formatBytes(totalStorageBytes)}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {' '}
                  / 1 GB
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-[11px] font-heading font-bold uppercase tracking-wider text-slate-400">
                STORAGE BUCKETS
              </span>
              <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-neutral-800 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${Math.max(1, storageUsagePercent)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SuperAdmin Master Terminal */}
      {isSuperAdminOnly ? (
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-white/5">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              <div>
                <h3 className="font-heading font-black text-xs uppercase tracking-wider text-slate-900 dark:text-white">
                  SUPERADMIN MASTER TERMINAL
                </h3>
                <p className="text-[10px] text-slate-400">
                  Full CRUD database control with multi-product &amp; batch
                  cards editing.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10">
              {(['attendance', 'sales', 'audit_logs'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-heading font-bold uppercase tracking-wider cursor-pointer transition-all ${
                    activeTab === tab
                      ? 'bg-[#123c73] dark:bg-red-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Date Filter Bar */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-black/25 border border-slate-200 dark:border-white/5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-heading font-bold uppercase tracking-wider">
              <Calendar className="w-4 h-4 text-blue-600 dark:text-red-500" />
              <span>Range:</span>
              <input
                type="date"
                min={MIN_ALLOWED_DATE}
                max={todayStr}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-800 text-xs font-mono"
              />
              <span>to</span>
              <input
                type="date"
                min={MIN_ALLOWED_DATE}
                max={todayStr}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-800 text-xs font-mono"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handlePresetDate('all')}
                className="px-2.5 py-1 rounded-lg text-[10px] font-heading font-bold uppercase bg-white dark:bg-neutral-800 border border-slate-200 dark:border-white/10 cursor-pointer"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => handlePresetDate('month')}
                className="px-2.5 py-1 rounded-lg text-[10px] font-heading font-bold uppercase bg-white dark:bg-neutral-800 border border-slate-200 dark:border-white/10 cursor-pointer"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => handlePresetDate('7days')}
                className="px-2.5 py-1 rounded-lg text-[10px] font-heading font-bold uppercase bg-white dark:bg-neutral-800 border border-slate-200 dark:border-white/10 cursor-pointer"
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => handlePresetDate('today')}
                className="px-2.5 py-1 rounded-lg text-[10px] font-heading font-bold uppercase bg-white dark:bg-neutral-800 border border-slate-200 dark:border-white/10 cursor-pointer"
              >
                Today
              </button>
            </div>
          </div>

          {/* Active Tab Managers */}
          {activeTab === 'sales' && (
            <SalesManager
              sales={salesList}
              loading={tabLoading}
              isSuperAdmin={isSuperAdminOnly}
              onRefresh={fetchTabData}
              onOpenNewModal={() => setIsSalesDialogOpen(true)}
            />
          )}

          {activeTab === 'attendance' && (
            <AttendanceManager
              attendanceList={attendanceList}
              loading={tabLoading}
              isSuperAdmin={isSuperAdminOnly}
              onRefresh={fetchTabData}
              onOpenNewModal={() => setIsAttendanceDialogOpen(true)}
            />
          )}

          {activeTab === 'audit_logs' && (
            <AuditLogsManager
              auditLogsList={auditLogsList}
              loading={tabLoading}
              isSuperAdmin={isSuperAdminOnly}
              onRefresh={fetchTabData}
            />
          )}
        </div>
      ) : (
        <div className="p-8 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 text-center space-y-2">
          <Lock className="w-6 h-6 text-slate-400 mx-auto" />
          <h3 className="font-heading font-bold text-sm uppercase text-slate-900 dark:text-white">
            SuperAdmin Terminal Guarded
          </h3>
          <p className="text-xs text-slate-500">
            Live database terminal requires SuperAdministrator access.
          </p>
        </div>
      )}

      {/* Policies & Links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        <div
          onClick={() => setActiveModal('terms')}
          className="p-4 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-between cursor-pointer hover:border-blue-500 transition-all"
        >
          <div className="flex items-center gap-3">
            <Scale className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-bold">Terms of Service</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        </div>

        <div
          onClick={() => setActiveModal('privacy')}
          className="p-4 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-between cursor-pointer hover:border-emerald-500 transition-all"
        >
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-bold">Privacy Policy</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        </div>

        <div
          onClick={() => setActiveModal('developer')}
          className="p-4 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-between cursor-pointer hover:border-amber-500 transition-all"
        >
          <div className="flex items-center gap-3">
            <Code2 className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-bold">About Developer</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        </div>
      </div>

      {/* Shared Modals */}
      <AgreementDocumentViewer
        isOpen={activeModal === 'terms' || activeModal === 'privacy'}
        onClose={() => setActiveModal(null)}
        initialDocument={activeModal === 'terms' ? 'terms' : 'privacy'}
      />

      <Modal
        isOpen={activeModal === 'developer'}
        onClose={() => setActiveModal(null)}
        title="About Developer"
        className="max-w-md p-6 text-left"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-white/10">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              Adrian R. Angeles
            </h4>
            <p className="text-blue-600 dark:text-red-400 font-semibold text-xs">
              Lead Software Developer
            </p>
          </div>
          <div className="space-y-2">
            <a
              href="tel:09762607481"
              className="flex items-center gap-2 text-slate-600 dark:text-slate-300"
            >
              <Phone className="w-4 h-4 text-blue-500" />
              <span>09762607481</span>
            </a>
            <a
              href="mailto:adrianangeles2213@gmail.com"
              className="flex items-center gap-2 text-slate-600 dark:text-slate-300"
            >
              <Mail className="w-4 h-4 text-emerald-500" />
              <span>adrianangeles2213@gmail.com</span>
            </a>
          </div>
        </div>
      </Modal>

      {/* Existing Shared Sales Dialog */}
      {isSalesDialogOpen && (
        <SalesDialog
          isOpen={isSalesDialogOpen}
          onClose={() => setIsSalesDialogOpen(false)}
          products={products}
          onSaleSuccess={handleExistingSaleSuccess}
        />
      )}

      {/* Existing Shared Logbook Record Attendance Dialog */}
      {isAttendanceDialogOpen && (
        <LogbookRecordAttendance
          isOpen={isAttendanceDialogOpen}
          onClose={() => setIsAttendanceDialogOpen(false)}
          onCheckInSuccess={() => {
            fetchTabData();
            setIsAttendanceDialogOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default SystemInformation;

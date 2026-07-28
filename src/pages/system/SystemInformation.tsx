import React, { useState, useMemo, useEffect } from 'react';
import { 
  Database, 
  FileText, 
  ShieldCheck, 
  Scale, 
  Info, 
  HardDrive,
  Cpu,
  ChevronRight,
  RefreshCw,
  Cloud,
  Gauge,
  Monitor,
  Calendar
} from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Table } from '../../components/ui/Table';
import type { Column } from '../../components/ui/Table';

// Dynamic version retrieval from package.json
import pkg from '../../../package.json';

interface StorageMetric {
  title: string;
  value: string;
  subtext: string;
  progress: number;
  limitText?: string;
  estimatedBadge?: boolean;
  icon: React.ReactNode;
  colorClass: string;
  barColorClass: string;
}

interface AppInfo {
  label: string;
  value: string;
}

interface RecordBreakdownItem {
  id: string;
  tableName: string;
  recordCount: number;
  sizeBytes: number;
  purpose: string;
  status: 'Active' | 'Operational' | 'System';
}

type LegalModalType = 'terms' | 'privacy' | 'licenses' | null;

const tableDisplayMapping: Record<string, { label: string; purpose: string; status: 'Active' | 'Operational' | 'System' }> = {
  profiles: { label: "Staff & Members", purpose: "Member registration, account states, and basic trainer metadata", status: "Active" },
  database_backups: { label: "Backup Archives", purpose: "Historical ledger exports, manual backups, and recovery archives", status: "Active" },
  rates_config: { label: "Rates & Pricing", purpose: "Pricing models, membership walk-in fees, tax configuration rates", status: "System" },
  audit_logs: { label: "Audit History", purpose: "Encrypted system-wide audit logging and transaction records", status: "Operational" },
  gym_profile: { label: "Gym Profile", purpose: "Gym metadata configuration, addresses, logos, and support directories", status: "System" },
  incident_reports: { label: "Incident Reports", purpose: "Incident logging directories, status parameters, and safety tracking files", status: "Active" },
  products: { label: "Product Catalog", purpose: "Retail catalog mappings (excluding product quantity thresholds)", status: "Active" },
  sales: { label: "Sales Transactions", purpose: "Completed transactions, invoice logs, reference data, and billing history", status: "Active" }
};

const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const SystemInformation: React.FC = () => {
  const [activeModal, setActiveModal] = useState<LegalModalType>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showSqlGuide, setShowSqlGuide] = useState<boolean>(false);

  // Storage RPC telemetry states
  const [rpcSupported, setRpcSupported] = useState<boolean>(false);
  const [dbSizeBytes, setDbSizeBytes] = useState<number | null>(null);
  const [storageSizeBytes, setStorageSizeBytes] = useState<number | null>(null);

  // Dynamic values parsed from database catalog statistics
  const [dbTables, setDbTables] = useState<Array<{ table_name: string; record_count: number; size_bytes: number }>>([]);

  const APP_VERSION = pkg.version;

  // Compute Build Metadata
  const buildNumber = useMemo(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}.${mm}.${dd}`;
  }, []);

  // Compute Monthly Billing Cycle Parameters (Monthly Reset Tracking)
  const billingCycleInfo = useMemo(() => {
    const now = new Date();
    const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const daysRemaining = totalDaysInMonth - dayOfMonth;
    const monthProgress = dayOfMonth / totalDaysInMonth; // 0.0 to 1.0

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const currentMonthLabel = `${monthNames[now.getMonth()]} 1 - ${totalDaysInMonth}`;

    return {
      monthProgress,
      dayOfMonth,
      daysRemaining,
      currentMonthLabel
    };
  }, []);

  const detectedEnvironment = useMemo(() => {
    if (typeof window === 'undefined') return 'Production';
    const hostname = window.location.hostname;
    
    if (hostname.includes('localhost') || hostname.includes('dev-wolfpalomar')) {
      return 'Development';
    }
    if (hostname === 'wolfpalomar.vercel.app') {
      return 'Production';
    }
    
    return hostname.includes('vercel.app') && !hostname.includes('dev-') ? 'Production' : 'Development';
  }, []);

  const fetchSystemStats = async () => {
    try {
      setLoading(true);
      setError(null);

      try {
        const [dbSizeRpc, storageSizeRpc, tableStatsRpc] = await Promise.all([
          supabase.rpc('get_database_size_bytes'),
          supabase.rpc('get_storage_size_bytes'),
          supabase.rpc('get_table_registry_stats')
        ]);

        if (!dbSizeRpc.error && !storageSizeRpc.error && !tableStatsRpc.error) {
          setDbSizeBytes(Number(dbSizeRpc.data));
          setStorageSizeBytes(Number(storageSizeRpc.data));
          setDbTables(tableStatsRpc.data || []);
          setRpcSupported(true);
        } else {
          setRpcSupported(false);
        }
      } catch (rpcErr) {
        setRpcSupported(false);
      }

    } catch (err: any) {
      console.error('System synchronization exception:', err);
      setError(err.message || 'Error occurred while syncing latest metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemStats();
  }, []);

  const displayedMetrics = useMemo<StorageMetric[]>(() => {
    const dbSize = dbSizeBytes ?? 0;
    const storageSize = storageSizeBytes ?? 0;

    // Database Capacity (Standard Supabase Free Tier: 500 MB)
    const dbAllocatedCap = 500 * 1024 * 1024;
    const dbPct = Math.min(100, parseFloat(((dbSize / dbAllocatedCap) * 100).toFixed(2)));

    // File Storage Capacity (Standard Supabase Free Tier: 1 GB)
    const bucketAllocatedCap = 1024 * 1024 * 1024;
    const bucketPct = Math.min(100, parseFloat(((storageSize / bucketAllocatedCap) * 100).toFixed(2)));

    // Monthly Egress Calculation (Resets every 1st of the month)
    // Baseline monthly system traffic (e.g. 2 MB - 15 MB) scaled by current billing cycle month progress
    const salesCount = dbTables.find(t => t.table_name === 'sales')?.record_count || 0;
    const profilesCount = dbTables.find(t => t.table_name === 'profiles')?.record_count || 0;
    const logsCount = dbTables.find(t => t.table_name === 'audit_logs')?.record_count || 0;

    // Monthly egress starts low on Day 1 (~1MB) and grows proportionally over the month
    const monthlyBaseTransfer = (2.5 * 1024 * 1024) * billingCycleInfo.monthProgress;
    const monthlyActivityTransfer = 
      (profilesCount * 12 * 1024) + 
      (salesCount * 8 * 1024) + 
      (logsCount * 3 * 1024);

    const calculatedEgressBytes = Math.round((monthlyBaseTransfer + monthlyActivityTransfer) * (0.8 + (billingCycleInfo.monthProgress * 0.4)));
    
    // Egress Limit (Standard Supabase Free Tier: 5 GB per billing cycle)
    const egressAllocatedCap = 5 * 1024 * 1024 * 1024;
    const egressPct = Math.min(100, parseFloat(((calculatedEgressBytes / egressAllocatedCap) * 100).toFixed(2)));

    return [
      {
        title: "DATABASE SIZE",
        value: formatBytes(dbSize),
        limitText: "500 MB",
        subtext: `${dbPct}% of allocated Postgres capacity used`,
        progress: Math.max(1, dbPct),
        icon: <Database className="w-5.5 h-5.5" />,
        colorClass: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20",
        barColorClass: "bg-emerald-500"
      },
      {
        title: "FILE STORAGE",
        value: formatBytes(storageSize),
        limitText: "1 GB",
        subtext: `${bucketPct}% of total storage space used`,
        progress: Math.max(1, bucketPct),
        icon: <Cloud className="w-5.5 h-5.5" />,
        colorClass: "bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/20",
        barColorClass: "bg-blue-500"
      },
      {
        title: "ESTIMATED MONTHLY EGRESS",
        value: formatBytes(calculatedEgressBytes),
        limitText: "5 GB",
        subtext: `${egressPct}% of bandwidth used • Resets in ${billingCycleInfo.daysRemaining} days`,
        progress: Math.max(1, egressPct),
        estimatedBadge: true,
        icon: <Gauge className="w-5.5 h-5.5" />,
        colorClass: "bg-amber-500/10 text-amber-500 border-amber-500/20",
        barColorClass: "bg-amber-500"
      }
    ];
  }, [rpcSupported, dbSizeBytes, storageSizeBytes, dbTables, billingCycleInfo]);

  const appDetails: AppInfo[] = [
    { label: "System Version", value: `v${APP_VERSION}` },
    { label: "Build Number", value: buildNumber },
    { label: "Environment", value: detectedEnvironment },
    { label: "Billing Cycle", value: billingCycleInfo.currentMonthLabel }
  ];

  const recordBreakdownData = useMemo<RecordBreakdownItem[]>(() => {
    if (rpcSupported && dbTables.length > 0) {
      return dbTables.map((item, idx) => ({
        id: String(idx + 1),
        tableName: item.table_name,
        recordCount: item.record_count,
        sizeBytes: item.size_bytes,
        purpose: tableDisplayMapping[item.table_name]?.purpose || 'System database relational directory mapping',
        status: tableDisplayMapping[item.table_name]?.status || 'Active'
      }));
    }

    return Object.keys(tableDisplayMapping).map((name, idx) => ({
      id: String(idx + 1),
      tableName: name,
      recordCount: 0,
      sizeBytes: 0,
      purpose: tableDisplayMapping[name].purpose,
      status: tableDisplayMapping[name].status
    }));
  }, [rpcSupported, dbTables]);

  const columns: Column<RecordBreakdownItem>[] = [
    {
      key: 'tableName',
      header: 'DATABASE REGISTRY',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-2.5 py-1">
          <HardDrive className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {tableDisplayMapping[item.tableName]?.label || item.tableName}
          </span>
        </div>
      )
    },
    {
      key: 'recordCount',
      header: 'RECORD COUNT',
      sortable: true,
      render: (item) => (
        loading ? (
          <div className="h-5 w-10 bg-slate-200 dark:bg-white/10 rounded-md animate-pulse" />
        ) : (
          <span className="font-mono text-xs text-slate-900 dark:text-white font-bold bg-slate-100 dark:bg-[#1f232d] px-2.5 py-1 rounded-md border border-slate-200/50 dark:border-white/5">
            {item.recordCount}
          </span>
        )
      )
    },
    {
      key: 'sizeBytes',
      header: 'DISK SIZE',
      sortable: true,
      render: (item) => (
        loading ? (
          <div className="h-4 w-14 bg-slate-200 dark:bg-white/10 rounded-md animate-pulse" />
        ) : (
          <span className="font-mono text-xs text-slate-600 dark:text-slate-400 font-semibold">
            {formatBytes(item.sizeBytes)}
          </span>
        )
      )
    },
    {
      key: 'purpose',
      header: 'PRIMARY PURPOSE',
      sortable: false,
      render: (item) => (
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          {item.purpose}
        </span>
      )
    },
    {
      key: 'status',
      header: 'STATUS',
      sortable: true,
      render: (item) => (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-heading font-black tracking-wider uppercase ${
          item.status === 'Active'
            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
            : item.status === 'Operational'
            ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
            : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            item.status === 'Active' ? 'bg-emerald-500' : item.status === 'Operational' ? 'bg-blue-500' : 'bg-amber-500'
          }`} />
          {item.status}
        </span>
      )
    }
  ];

  const registryItems = useMemo(() => {
    const getCount = (name: string) => dbTables.find(t => t.table_name === name)?.record_count || 0;
    return [
      { name: "Staff & Members", count: getCount('profiles'), label: "Active profiles", icon: <Monitor className="w-4 h-4 text-indigo-500" /> },
      { name: "Audit History", count: getCount('audit_logs'), label: "Preserved logs", icon: <FileText className="w-4 h-4 text-emerald-500" /> },
      { name: "Sales Transactions", count: getCount('sales'), label: "Invoices created", icon: <Database className="w-4 h-4 text-blue-500" /> },
      { name: "Incident Reports", count: getCount('incident_reports'), label: "Logged events", icon: <HardDrive className="w-4 h-4 text-rose-500" /> },
    ];
  }, [dbTables]);

  return (
    <div className="space-y-8 font-body text-slate-800 dark:text-slate-100 p-0 sm:p-2">
      
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-[10px] font-heading tracking-widest text-[#123c73] dark:text-[#bf0202] uppercase">
            System / Configurations
          </span>
          <h1 className="text-2xl sm:text-3xl font-heading tracking-widest uppercase text-slate-900 dark:text-slate-100 mt-1">
            System Information
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            View application architecture specifications, schema parameters, database registry indices, and legal guidelines.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {!rpcSupported && (
            <Button
              onClick={() => setShowSqlGuide(!showSqlGuide)}
              className="text-xs py-2 px-3 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded-xl hover:bg-blue-500/20 transition-all cursor-pointer font-bold"
            >
              Configure Exact Storage Sync
            </Button>
          )}
          <Button 
            onClick={fetchSystemStats} 
            disabled={loading}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-200 text-xs py-2 px-3.5 rounded-xl border border-slate-200 dark:border-white/5 font-bold tracking-wider transition-all duration-200 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'SYNCING...' : 'SYNC STATUS'}
          </Button>
        </div>
      </div>

      {/* SQL Deployment Helper Guide */}
      {showSqlGuide && !rpcSupported && (
        <div className="p-6 bg-blue-500/5 border border-blue-500/20 rounded-3xl space-y-4 text-left animate-fade-in">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-heading font-black text-xs uppercase tracking-wider text-slate-900 dark:text-slate-100">
                LINK EXACT STORAGE TELEMETRY FROM SUPABASE
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                By default, security rules block web clients from inspecting database disk size directly. To link catalog telemetry, copy and execute these SQL helper functions inside your <strong>Supabase SQL Editor</strong>:
              </p>
            </div>
          </div>
          <pre className="p-4 bg-slate-100 dark:bg-black/40 rounded-2xl text-[10px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto border border-slate-200/50 dark:border-white/5 leading-relaxed">
{`CREATE OR REPLACE FUNCTION public.get_database_size_bytes()
RETURNS bigint AS $$
  SELECT pg_database_size(current_database());
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_storage_size_bytes()
RETURNS bigint AS $$
  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
  FROM storage.objects;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_table_registry_stats()
RETURNS TABLE(table_name text, record_count bigint, size_bytes bigint) AS $$
DECLARE
  t_name text;
  r_count bigint;
  s_bytes bigint;
BEGIN
  FOR t_name IN 
    VALUES ('profiles', 'database_backups', 'rates_config', 'audit_logs', 'gym_profile', 'incident_reports', 'products', 'sales')
  LOOP
    EXECUTE format('SELECT count(*) FROM %I', t_name) INTO r_count;
    s_bytes := pg_total_relation_size(quote_ident(t_name));
    table_name := t_name;
    record_count := r_count;
    size_bytes := s_bytes;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`}
          </pre>
          <div className="flex justify-end">
            <Button 
              onClick={() => setShowSqlGuide(false)}
              className="text-xs py-1.5 px-3 bg-slate-200 hover:bg-slate-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-slate-200 font-bold rounded-lg cursor-pointer"
            >
              Dismiss Instructions
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs text-red-500 font-semibold">
          ⚠️ {error}
        </div>
      )}

      {/* SECTION 1: Metrics Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayedMetrics.map((metric, idx) => (
          <div 
            key={idx} 
            className="p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-3xl space-y-4 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <div className={`p-2.5 rounded-xl border shrink-0 ${metric.colorClass}`}>
                {metric.icon}
              </div>
              <div className="flex items-center gap-2">
                {metric.estimatedBadge && (
                  <span className="px-2 py-0.5 bg-amber-500/10 text-[9px] text-amber-500 border border-amber-500/20 rounded-md font-bold tracking-wider uppercase">
                    Estimated
                  </span>
                )}
                <span className="text-xl font-extrabold text-slate-900 dark:text-white font-mono">
                  {loading ? (
                    <span className="inline-block h-6 w-20 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                  ) : (
                    <>
                      {metric.value}
                      {metric.limitText && (
                        <span className="text-xs text-slate-400 font-bold font-sans"> / {metric.limitText}</span>
                      )}
                    </>
                  )}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                {metric.title}
              </span>
              <div className="w-full h-2 bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden p-px shadow-inner relative">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${metric.barColorClass} ${loading ? 'animate-pulse' : ''}`}
                  style={{ width: loading ? '10%' : `${metric.progress}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mt-0.5">
                {loading ? 'Refreshing dynamic network allocations...' : metric.subtext}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* SECTION 2: Application Spec Details & Billing Cycle Banner */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Card: Build Metadata */}
        <div className="lg:col-span-5 p-6 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-3xl space-y-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center gap-3 pb-2 border-b border-slate-100 dark:border-white/5">
            <Cpu className="w-5.5 h-5.5 text-blue-500" />
            <h3 className="font-heading text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
              BUILD METADATA
            </h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {appDetails.map((detail, idx) => (
              <div key={idx} className="flex justify-between py-3 text-xs font-semibold">
                <span className="text-slate-500 dark:text-slate-400">{detail.label}</span>
                <span className="font-mono text-slate-900 dark:text-white">{detail.value}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2 text-[11px] text-slate-400 dark:text-slate-500 font-medium border-t border-slate-100 dark:border-white/5">
            <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Billing cycle resets automatically on the 1st of every month.</span>
          </div>
        </div>

        {/* Right Card: Dynamic UI-Mapped Directory */}
        <div className="lg:col-span-7 p-6 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-3xl space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/5">
            <div className="flex items-center gap-3">
              <Database className="w-5.5 h-5.5 text-amber-500" />
              <h3 className="font-heading text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                DATABASE REGISTRY DIRECTORY
              </h3>
            </div>
            <span className="text-[9px] font-heading font-black tracking-widest px-2 py-0.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-md">
              RELATIONAL SCHEMAS
            </span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {registryItems.map((metric, idx) => (
              <div 
                key={idx} 
                className="p-3 bg-slate-50/50 dark:bg-black/20 border border-slate-200/40 dark:border-white/5 rounded-2xl flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg border bg-slate-100 dark:bg-neutral-900 border-slate-200 dark:border-white/5">
                    {metric.icon}
                  </div>
                  <div className="truncate">
                    <p className="font-bold text-slate-800 dark:text-slate-200">{metric.name}</p>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold font-mono">{metric.label}</p>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 bg-slate-100 dark:bg-neutral-900 text-xs font-mono text-slate-700 dark:text-slate-300 border border-slate-200/50 dark:border-white/5 rounded-md font-bold">
                  {loading ? (
                    <span className="inline-block h-3.5 w-6 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                  ) : (
                    metric.count
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* SECTION 3: Storage Breakdown Table */}
      <div className="p-1 rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-[#161920] overflow-x-auto w-full">
        <Table<RecordBreakdownItem>
          data={recordBreakdownData}
          columns={columns}
          itemsPerPage={8}
          loading={false}
        />
      </div>

      {/* SECTION 4: Legal & Policy Documents */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Terms of Service */}
        <div 
          onClick={() => setActiveModal('terms')}
          className="p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-3xl flex items-center justify-between gap-4 cursor-pointer hover:border-blue-500 dark:hover:border-red-500 transition-all duration-300 group shadow-xs"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded-xl">
              <Scale className="w-5.5 h-5.5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-500 dark:group-hover:text-red-500 transition-colors">
                Terms of Service
              </p>
              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">Usage terms & liability specs</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </div>

        {/* Privacy Policy */}
        <div 
          onClick={() => setActiveModal('privacy')}
          className="p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-3xl flex items-center justify-between gap-4 cursor-pointer hover:border-blue-500 dark:hover:border-red-500 transition-all duration-300 group shadow-xs"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl">
              <ShieldCheck className="w-5.5 h-5.5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-500 dark:group-hover:text-red-500 transition-colors">
                Privacy Policy
              </p>
              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">Data privacy & system parameters</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </div>

        {/* Open Source Licenses */}
        <div 
          onClick={() => setActiveModal('licenses')}
          className="p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-3xl flex items-center justify-between gap-4 cursor-pointer hover:border-blue-500 dark:hover:border-red-500 transition-all duration-300 group shadow-xs"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl">
              <FileText className="w-5.5 h-5.5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-amber-500 transition-colors">
                Open Source Licenses
              </p>
              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">Packages & standard licensing agreements</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </div>

      </div>

      {/* SECTION 5: Branding Footer Banner */}
      <div className="flex items-start gap-4 p-5 bg-slate-50 dark:bg-neutral-900/30 border border-slate-200 dark:border-white/5 rounded-3xl text-xs leading-normal max-w-full text-left">
        <Info className="w-5 h-5 shrink-0 mt-0.5 text-blue-500" />
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-heading tracking-wider uppercase text-slate-900 dark:text-white text-xs">
              Wolf Palomar Fitness Gym Muaythai Boxing Management System
            </p>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-emerald-500/10 text-[9px] text-emerald-500 dark:text-emerald-400 border border-emerald-500/20 rounded font-bold tracking-wider uppercase">
                v{APP_VERSION}
              </span>
              <span className="px-2 py-0.5 bg-blue-500/10 text-[9px] text-blue-500 border border-blue-500/20 rounded font-bold tracking-wider uppercase">
                Active Client
              </span>
            </div>
          </div>
          
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 opacity-90 leading-relaxed">
            This proprietary management dashboard serves as a central registry core. Tablet and mobile touch interfaces are powered by specialized mobile wrapper layers.
          </p>
        </div>
      </div>

      {/* ─── MODALS: Terms of Service ─── */}
      <Modal
        isOpen={activeModal === 'terms'}
        onClose={() => setActiveModal(null)}
        title="Terms of Service"
        className="max-w-xl text-left p-6 sm:p-8"
      >
        <div className="space-y-4 text-xs font-semibold text-slate-600 dark:text-slate-400 overflow-y-auto max-h-[60vh] pr-2 leading-relaxed">
          <p className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-xs">1. ACCEPTANCE OF TERMS</p>
          <p>
            By accessing or using the Wolf Palomar Gym Management Terminal, you agree to comply with and be bound by these standard system Terms of Service.
          </p>
          <p className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-xs">2. AUTHORIZED USE ONLY</p>
          <p>
            This terminal and database is strictly reserved for authorized administrators, staff coaches, and trainers of Wolf Palomar Gym.
          </p>
        </div>
        <div className="flex justify-end pt-3">
          <Button onClick={() => setActiveModal(null)} className="bg-blue-600 dark:bg-red-600 text-white cursor-pointer px-4 font-heading text-xs tracking-wider">
            Close Document
          </Button>
        </div>
      </Modal>

      {/* ─── MODALS: Privacy Policy ─── */}
      <Modal
        isOpen={activeModal === 'privacy'}
        onClose={() => setActiveModal(null)}
        title="Privacy Policy"
        className="max-w-xl text-left p-6 sm:p-8"
      >
        <div className="space-y-4 text-xs font-semibold text-slate-600 dark:text-slate-400 overflow-y-auto max-h-[60vh] pr-2 leading-relaxed">
          <p className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-xs">1. DATA ENCRYPTION & RETENTION</p>
          <p>
            All personal information—including member names, contact numbers, logbook check-in histories, and system credentials—is stored securely behind Row Level Security (RLS) policies.
          </p>
        </div>
        <div className="flex justify-end pt-3">
          <Button onClick={() => setActiveModal(null)} className="bg-blue-600 dark:bg-red-600 text-white cursor-pointer px-4 font-heading text-xs tracking-wider">
            Close Document
          </Button>
        </div>
      </Modal>

      {/* ─── MODALS: Open Source Licenses ─── */}
      <Modal
        isOpen={activeModal === 'licenses'}
        onClose={() => setActiveModal(null)}
        title="Open Source Licenses"
        className="max-w-xl text-left p-6 sm:p-8"
      >
        <div className="space-y-4 text-xs font-semibold text-slate-600 dark:text-slate-400 overflow-y-auto max-h-[60vh] pr-2 leading-relaxed">
          <p className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-xs">STANDARD APPLICATION LIBRARIES</p>
          <p className="font-mono text-[10px] leading-normal bg-slate-100 dark:bg-neutral-900/60 p-3 rounded-xl border border-slate-200 dark:border-white/5">
            - Standard Router DOM<br />
            - Animated UI Components<br />
            - Icon Vector Engines<br />
            - Reactive Form Handling
          </p>
        </div>
        <div className="flex justify-end pt-3">
          <Button onClick={() => setActiveModal(null)} className="bg-blue-600 dark:bg-red-600 text-white cursor-pointer px-4 font-heading text-xs tracking-wider">
            Close Document
          </Button>
        </div>
      </Modal>

    </div>
  );
};
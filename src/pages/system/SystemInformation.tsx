// src/pages/settings/SystemInformation.tsx

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Database, 
  ShieldCheck, 
  Scale, 
  Info, 
  HardDrive, 
  Cpu, 
  ChevronRight, 
  RefreshCw, 
  Cloud, 
  Users, 
  ClipboardList, 
  ShoppingBag, 
  Package, 
  Layers, 
  Code2, 
  Phone, 
  Mail, 
  ExternalLink, 
  AlertTriangle 
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

type LegalModalType = 'terms' | 'privacy' | 'developer' | null;

const tableDisplayMapping: Record<string, { label: string; purpose: string; status: 'Active' | 'Operational' | 'System' }> = {
  members: { label: "Members Directory", purpose: "Enrolled member profiles, contact directories, and security metadata", status: "Active" },
  attendance: { label: "Logbook Attendance", purpose: "Daily check-in logs, walk-in visits, and timestamp telemetry", status: "Active" },
  sales: { label: "Sales Transactions", purpose: "Point-of-sale invoice receipts, retail logs, and cashier history", status: "Active" },
  products: { label: "Product Catalog", purpose: "Inventory merchandise, POS barcodes, stock quantity, and pricing", status: "Active" },
  subscriptions: { label: "Subscription Contracts", purpose: "Active membership contracts, renewals, and expiration schedules", status: "Active" },
  receipts: { label: "Official Receipts", purpose: "Generated payment receipts, GCash references, and transaction proofs", status: "Operational" },
  audit_logs: { label: "Audit History", purpose: "System-wide activity logs, staff actions, and security audit trail", status: "Operational" },
  rates_config: { label: "Rates & Pricing", purpose: "Pricing tiers, membership walk-in fees, tax configuration rates", status: "System" },
  gym_profile: { label: "Gym Profile", purpose: "Gym metadata configuration, addresses, logos, and support directories", status: "System" },
  incident_reports: { label: "Incident Reports", purpose: "Incident logging directories, status parameters, and safety tracking", status: "Active" },
  database_backups: { label: "Backup Archives", purpose: "Historical ledger exports, manual backups, and recovery archives", status: "Operational" },
  profiles: { label: "Staff & User Accounts", purpose: "System user profiles, coach/staff roles, and admin credentials", status: "System" }
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

  // Storage telemetry states
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

  const fetchSystemStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const tableKeys = Object.keys(tableDisplayMapping);

      // 1. Direct table live counts (Guaranteed fallback)
      const countQueries = await Promise.allSettled(
        tableKeys.map(async (table) => {
          let query = supabase.from(table).select('*', { count: 'exact', head: true });
          if (['members', 'products', 'attendance', 'sales'].includes(table)) {
            query = query.is('deleted_at', null);
          }
          const { count, error: qErr } = await query;
          return {
            table_name: table,
            record_count: qErr ? 0 : (count ?? 0),
            size_bytes: 0
          };
        })
      );

      const directCountsMap: Record<string, number> = {};
      countQueries.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          directCountsMap[res.value.table_name] = res.value.record_count;
        } else {
          directCountsMap[tableKeys[i]] = 0;
        }
      });

      // 2. Storage RPC Telemetry Queries
      const [dbSizeRpc, storageSizeRpc, tableStatsRpc] = await Promise.allSettled([
        supabase.rpc('get_database_size_bytes'),
        supabase.rpc('get_storage_size_bytes'),
        supabase.rpc('get_table_registry_stats')
      ]);

      if (
        dbSizeRpc.status === 'fulfilled' && !dbSizeRpc.value.error &&
        storageSizeRpc.status === 'fulfilled' && !storageSizeRpc.value.error
      ) {
        setDbSizeBytes(Number(dbSizeRpc.value.data || 0));
        setStorageSizeBytes(Number(storageSizeRpc.value.data || 0));
        setRpcSupported(true);
      } else {
        setRpcSupported(false);
      }

      if (
        tableStatsRpc.status === 'fulfilled' && 
        !tableStatsRpc.value.error && 
        Array.isArray(tableStatsRpc.value.data)
      ) {
        const rpcData = tableStatsRpc.value.data;
        const merged = tableKeys.map((name) => {
          const match = rpcData.find((r: any) => r.table_name === name);
          return {
            table_name: name,
            record_count: directCountsMap[name] ?? (match ? Number(match.record_count) : 0),
            size_bytes: match ? Number(match.size_bytes) : 0
          };
        });
        setDbTables(merged);
      } else {
        setDbTables(tableKeys.map((name) => ({
          table_name: name,
          record_count: directCountsMap[name] ?? 0,
          size_bytes: 0
        })));
      }

    } catch (err: any) {
      console.error('System synchronization exception:', err);
      setError(err.message || 'Error occurred while syncing latest metrics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSystemStats();
  }, [fetchSystemStats]);

  const displayedMetrics = useMemo<StorageMetric[]>(() => {
    const dbSize = dbSizeBytes ?? 0;
    const storageSize = storageSizeBytes ?? 0;

    // Database Capacity (Standard Supabase Free Tier: 500 MB)
    const dbAllocatedCap = 500 * 1024 * 1024;
    const dbPct = Math.min(100, parseFloat(((dbSize / dbAllocatedCap) * 100).toFixed(2)));

    // File Storage Capacity (Standard Supabase Free Tier: 1 GB)
    const bucketAllocatedCap = 1024 * 1024 * 1024;
    const bucketPct = Math.min(100, parseFloat(((storageSize / bucketAllocatedCap) * 100).toFixed(2)));

    return [
      {
        title: "DATABASE SIZE",
        value: formatBytes(dbSize),
        limitText: "500 MB",
        subtext: `${dbPct}% of allocated Postgres storage capacity used`,
        progress: Math.max(1, dbPct),
        icon: <Database className="w-5.5 h-5.5" />,
        colorClass: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20",
        barColorClass: "bg-emerald-500"
      },
      {
        title: "FILE & MEDIA STORAGE",
        value: formatBytes(storageSize),
        limitText: "1 GB",
        subtext: `${bucketPct}% of allocated bucket storage used`,
        progress: Math.max(1, bucketPct),
        icon: <Cloud className="w-5.5 h-5.5" />,
        colorClass: "bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/20",
        barColorClass: "bg-blue-500"
      }
    ];
  }, [dbSizeBytes, storageSizeBytes]);

  const appDetails: AppInfo[] = [
    { label: "System Version", value: `v${APP_VERSION}` },
    { label: "Build Number", value: buildNumber },
    { label: "Environment", value: detectedEnvironment },
    { label: "Database Provider", value: "PostgreSQL (Supabase Cloud)" }
  ];

  const recordBreakdownData = useMemo<RecordBreakdownItem[]>(() => {
    if (dbTables.length > 0) {
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
  }, [dbTables]);

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
            {item.sizeBytes > 0 ? formatBytes(item.sizeBytes) : '—'}
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

  // Primary 4 Telemetry Directory Items: Members, Logbook, Sales, Products
  const registryItems = useMemo(() => {
    const getCount = (name: string) => dbTables.find(t => t.table_name === name)?.record_count || 0;
    return [
      { 
        name: "Members Directory", 
        count: getCount('members'), 
        label: "Enrolled profiles", 
        icon: <Users className="w-4 h-4 text-indigo-500" /> 
      },
      { 
        name: "Logbook Attendance", 
        count: getCount('attendance'), 
        label: "Recorded check-ins", 
        icon: <ClipboardList className="w-4 h-4 text-emerald-500" /> 
      },
      { 
        name: "Sales Transactions", 
        count: getCount('sales'), 
        label: "POS receipts logged", 
        icon: <ShoppingBag className="w-4 h-4 text-blue-500" /> 
      },
      { 
        name: "Product Catalog", 
        count: getCount('products'), 
        label: "Inventory items", 
        icon: <Package className="w-4 h-4 text-amber-500" /> 
      },
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
            View application architecture specifications, schema parameters, live database record telemetry, and developer contacts.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {!rpcSupported && (
            <button
              type="button"
              onClick={() => setShowSqlGuide(!showSqlGuide)}
              className="text-xs py-2 px-3 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all cursor-pointer font-bold select-none"
            >
              Configure Exact Disk Telemetry
            </button>
          )}
          <button 
            type="button"
            onClick={fetchSystemStats} 
            disabled={loading}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-slate-100 text-xs py-2 px-3.5 rounded-xl border border-slate-300 dark:border-zinc-700 font-bold tracking-wider transition-all duration-200 cursor-pointer shadow-xs select-none disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600 dark:text-red-500' : 'text-slate-600 dark:text-slate-300'}`} />
            <span>{loading ? 'SYNCING...' : 'SYNC STATUS'}</span>
          </button>
        </div>
      </div>

      {/* SQL Deployment Helper Guide */}
      {showSqlGuide && !rpcSupported && (
        <div className="p-6 bg-blue-500/5 border border-blue-500/20 rounded-3xl space-y-4 text-left animate-fade-in">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-heading font-black text-xs uppercase tracking-wider text-slate-900 dark:text-slate-100">
                LINK EXACT STORAGE & DISK TELEMETRY FROM SUPABASE
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                By default, security rules prevent web clients from inspecting Postgres storage size directly. To link catalog disk sizing, execute these SQL helper functions inside your <strong>Supabase SQL Editor</strong>:
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
    VALUES ('members', 'attendance', 'sales', 'products', 'subscriptions', 'receipts', 'audit_logs', 'rates_config', 'gym_profile', 'incident_reports', 'database_backups', 'profiles')
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM %I WHERE deleted_at IS NULL', t_name) INTO r_count;
    EXCEPTION WHEN OTHERS THEN
      EXECUTE format('SELECT count(*) FROM %I', t_name) INTO r_count;
    END;
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

      {/* SECTION 1: Storage Capacity Displays (Clean 2-Column Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                {loading ? 'Refreshing database capacity telemetry...' : metric.subtext}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* SECTION 2: Build Metadata & Core Directory Telemetry */}
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
            <Layers className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Row Level Security (RLS) policies are active across all tables.</span>
          </div>
        </div>

        {/* Right Card: Dynamic Core Directory Telemetry (Members, Logbook, Sales, Products) */}
        <div className="lg:col-span-7 p-6 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-3xl space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/5">
            <div className="flex items-center gap-3">
              <Database className="w-5.5 h-5.5 text-amber-500" />
              <h3 className="font-heading text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                CORE SYSTEM REGISTRY
              </h3>
            </div>
            <span className="text-[9px] font-heading font-black tracking-widest px-2 py-0.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-md">
              LIVE DATA
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

      {/* SECTION 3: Detailed Storage Breakdown Table */}
      <div className="p-1 rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-[#161920] overflow-x-auto w-full">
        <Table<RecordBreakdownItem>
          data={recordBreakdownData}
          columns={columns}
          itemsPerPage={8}
          loading={false}
        />
      </div>

      {/* SECTION 4: Legal & Policy Documents + Developer Information */}
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
              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">Rules, payments, and facility liability</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </div>

        {/* Privacy Policy */}
        <div 
          onClick={() => setActiveModal('privacy')}
          className="p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-3xl flex items-center justify-between gap-4 cursor-pointer hover:border-emerald-500 dark:hover:border-red-500 transition-all duration-300 group shadow-xs"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl">
              <ShieldCheck className="w-5.5 h-5.5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-500 dark:group-hover:text-red-500 transition-colors">
                Privacy Policy
              </p>
              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">Data Privacy Act (RA 10173) compliance</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </div>

        {/* About Developer (Replaced Open Source Licenses) */}
        <div 
          onClick={() => setActiveModal('developer')}
          className="p-5 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/5 rounded-3xl flex items-center justify-between gap-4 cursor-pointer hover:border-amber-500 dark:hover:border-red-500 transition-all duration-300 group shadow-xs"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl">
              <Code2 className="w-5.5 h-5.5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-amber-500 transition-colors">
                About Developer
              </p>
              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">Adrian R. Angeles • 09762607481</p>
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
            Custom engineered for Wolf Palomar Fitness Gym. Designed with high-density cashier registers, QR badge verification, offline resilience, and encrypted audit histories.
          </p>
        </div>
      </div>

      {/* ─── MODALS: Terms of Service ─── */}
      <Modal
        isOpen={activeModal === 'terms'}
        onClose={() => setActiveModal(null)}
        title="Terms of Service"
        className="max-w-2xl text-left p-6 sm:p-8"
      >
        <div className="space-y-4 text-xs font-semibold text-slate-600 dark:text-slate-300 overflow-y-auto max-h-[65vh] pr-2 leading-relaxed">
          
          <div className="flex gap-3 p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
            <Scale className="w-5 h-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
              These rules keep Wolf Palomar Gym safe, fair, and welcoming. They apply to every member, guest, coach, staff member, and parent or guardian agreeing for a minor.
            </p>
          </div>

          <div className="flex gap-2.5 rounded-2xl border border-amber-300/70 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3.5 text-xs leading-relaxed text-amber-900 dark:text-amber-100">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <p>
              <strong>Important:</strong> Membership payments are non-refundable after payment, except where Philippine law requires a refund. Please verify your selected plan, duration, and total before paying.
            </p>
          </div>

          <div className="space-y-1.5 border-l-2 border-blue-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">1. Safe and Respectful Gym Use</h4>
            <p>Use equipment only as intended and within your ability. Return weights, boxing gear, attachments, and benches to their designated rack after use. Follow staff instructions and safety procedures at all times.</p>
          </div>

          <div className="space-y-1.5 border-l-2 border-blue-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">2. Damage, Theft, and Prohibited Conduct</h4>
            <p>Do not steal, misuse, or remove gym property. Violence, harassment, verbal abuse, or unpermitted recordings are strictly prohibited. Individuals are held liable for willful damage, resulting in immediate termination and referral to authorities.</p>
          </div>

          <div className="space-y-1.5 border-l-2 border-blue-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">3. Payments, Subscriptions, and Consumer Rights</h4>
            <p>Memberships are personal and non-transferable without management approval. All payments are final in accordance with the Consumer Act of the Philippines (RA 7394) and the Electronic Commerce Act (RA 8792).</p>
          </div>

          <div className="space-y-1.5 border-l-2 border-blue-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">4. Health, Injury, and Emergency Procedures</h4>
            <p>Exercise carries physical risk. Notify staff immediately if you experience dizziness, shortness of breath, or sharp pain. Emergency contacts on file will be contacted in urgent safety situations.</p>
          </div>

          <div className="space-y-1.5 border-l-2 border-blue-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">5. Minors and Legal Guardian Consent</h4>
            <p>Athletes below 18 require parental or legal guardian consent. The guardian acknowledges responsibility for the minor's adherence to facility guidelines.</p>
          </div>

          <div className="space-y-1.5 border-l-2 border-blue-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">6. Facility Safety Compliance</h4>
            <p>Wolf Palomar Gym actively enforces the Safe Spaces Act (RA 11313) and occupational health and safety regulations (RA 11058).</p>
          </div>

        </div>
        <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-white/5">
          <Button onClick={() => setActiveModal(null)} className="bg-[#123c73] dark:bg-[#bf0202] text-white cursor-pointer px-4 font-heading text-xs tracking-wider">
            Close Document
          </Button>
        </div>
      </Modal>

      {/* ─── MODALS: Privacy Policy ─── */}
      <Modal
        isOpen={activeModal === 'privacy'}
        onClose={() => setActiveModal(null)}
        title="Privacy Policy"
        className="max-w-2xl text-left p-6 sm:p-8"
      >
        <div className="space-y-4 text-xs font-semibold text-slate-600 dark:text-slate-300 overflow-y-auto max-h-[65vh] pr-2 leading-relaxed">
          
          <div className="flex gap-3 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
            <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
              We collect and process only the information reasonably required to register gym members, manage subscriptions, secure the facility, and verify attendance.
            </p>
          </div>

          <div className="flex gap-2.5 rounded-2xl border border-emerald-300/70 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-500/10 p-3.5 text-xs leading-relaxed text-emerald-900 dark:text-emerald-100">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            <p>
              <strong>Data Privacy Act of 2012 (RA 10173):</strong> You retain full rights over your personal data including access, rectification, objection, and erasure subject to legal limits.
            </p>
          </div>

          <div className="space-y-1.5 border-l-2 border-emerald-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">1. Personal Information Collected</h4>
            <p>Records include member full name, phone number, email, date of birth, emergency contact, subscription term, QR identifier, check-in history, and payment reference numbers.</p>
          </div>

          <div className="space-y-1.5 border-l-2 border-emerald-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">2. Purpose of Data Processing</h4>
            <p>Data is used exclusively to facilitate access control, generate receipts, renew subscriptions, monitor safety incidents, and verify payment proof. Personal information is never sold or rented.</p>
          </div>

          <div className="space-y-1.5 border-l-2 border-emerald-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">3. Security Safeguards & Encryption</h4>
            <p>Database entries are secured through Row Level Security (RLS) policies, restricting access solely to authenticated administrators and staff coaches.</p>
          </div>

          <div className="space-y-1.5 border-l-2 border-emerald-500 pl-3.5">
            <h4 className="font-heading text-xs uppercase tracking-wider text-slate-900 dark:text-white">4. Data Retention & Privacy Inquiries</h4>
            <p>Records are retained only for active membership lifecycle, tax logging, and safety compliance. For inquiries, contact the gym management or the National Privacy Commission (NPC).</p>
          </div>

        </div>
        <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-white/5">
          <Button onClick={() => setActiveModal(null)} className="bg-[#123c73] dark:bg-[#bf0202] text-white cursor-pointer px-4 font-heading text-xs tracking-wider">
            Close Document
          </Button>
        </div>
      </Modal>

      {/* ─── MODALS: About Developer (Adrian R. Angeles) ─── */}
<Modal
  isOpen={activeModal === 'developer'}
  onClose={() => setActiveModal(null)}
  title="About the Developer"
  className="max-w-xl text-left p-6 sm:p-8"
>
  <div className="space-y-5 text-xs text-slate-600 dark:text-slate-300">
    
    {/* Profile Header */}
    <div className="p-5 bg-slate-50 dark:bg-[#1f232d] border border-slate-200 dark:border-white/5 rounded-3xl space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#123c73] to-blue-700 dark:from-[#bf0202] dark:to-red-700 text-white font-heading font-black text-xl flex items-center justify-center shadow-md">
          AA
        </div>
        <div className="space-y-0.5">
          <h3 className="font-heading font-black text-base text-slate-900 dark:text-white uppercase tracking-wider">
            Adrian R. Angeles
          </h3>
          <p className="text-xs font-bold text-blue-600 dark:text-red-400">
            Lead Software Developer & System Architect
          </p>
          <span className="inline-block text-[10px] font-mono font-semibold text-slate-400">
            Wolf Palomar Management Core
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-200 dark:border-white/5 pt-3">
        Designed and engineered the central management terminal for <strong>Wolf Palomar Fitness Gym Muaythai Boxing</strong>.
      </p>
    </div>

    {/* Direct Developer Contacts Grid */}
    <div className="space-y-2.5">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
        DIRECT DEVELOPER SUPPORT & INQUIRIES
      </span>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Phone Contact */}
        <a 
          href="tel:09762607481" 
          className="p-3 bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/25 rounded-2xl flex items-center gap-3 transition-colors group cursor-pointer text-blue-600 dark:text-blue-400"
        >
          <div className="p-2 rounded-xl bg-blue-500 text-white shadow-xs shrink-0">
            <Phone className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="font-heading font-bold text-[10px] uppercase tracking-wider leading-none">Phone / Mobile</p>
            <p className="font-mono text-xs font-bold mt-1 text-slate-900 dark:text-white">09762607481</p>
          </div>
        </a>

        {/* Email Contact */}
        <a 
          href="mailto:adrianangeles2213@gmail.com" 
          className="p-3 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 rounded-2xl flex items-center gap-3 transition-colors group cursor-pointer text-emerald-600 dark:text-emerald-400"
        >
          <div className="p-2 rounded-xl bg-emerald-500 text-white shadow-xs shrink-0">
            <Mail className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="font-heading font-bold text-[10px] uppercase tracking-wider leading-none">Email Address</p>
            <p className="font-mono text-xs font-bold mt-1 text-slate-900 dark:text-white truncate">
              adrianangeles2213@gmail.com
            </p>
          </div>
        </a>

        {/* Facebook Profile Link with Inline SVG */}
<a 
  href="https://facebook.com/WukwukTwo" 
  target="_blank"
  rel="noopener noreferrer"
  className="p-3 bg-indigo-500/10 hover:bg-indigo-500/15 border border-indigo-500/25 rounded-2xl flex items-center gap-3 transition-colors group cursor-pointer text-indigo-600 dark:text-indigo-400 sm:col-span-2"
>
  <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs shrink-0 flex items-center justify-center">
    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  </div>
  <div className="min-w-0 flex-1 flex items-center justify-between">
    <div>
      <p className="font-heading font-bold text-[10px] uppercase tracking-wider leading-none">Facebook Profile</p>
      <p className="text-xs font-semibold mt-1 text-slate-900 dark:text-white">Adrian R. Angeles</p>
    </div>
    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
  </div>
</a>
      </div>
    </div>

  </div>
  
  <div className="flex justify-end pt-4 mt-5 border-t border-slate-100 dark:border-white/5">
    <Button onClick={() => setActiveModal(null)} className="bg-[#123c73] dark:bg-[#bf0202] text-white cursor-pointer px-4 font-heading text-xs tracking-wider">
      Close Dialog
    </Button>
  </div>
</Modal>

    </div>
  );
};

export default SystemInformation;
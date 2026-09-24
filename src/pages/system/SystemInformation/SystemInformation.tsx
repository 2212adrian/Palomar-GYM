import React, { useState } from 'react';
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
} from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { AgreementDocumentViewer } from '../../../components/ui/AgreementDocumentViewer';

import pkg from '../../../../package.json';
import { formatBytes } from '../../../lib/appUpdateService';

export const SystemInformation: React.FC = () => {
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
          Application specifications, version metadata, storage health, and facility legal documentation.
        </p>
      </div>

      {/* System Status Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-heading font-black tracking-wider uppercase text-slate-900 dark:text-white">
                All Core Services Operational
              </span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                ACTIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Supabase Auth, Realtime Postgres, and Cloud Storage are synced and
              operating normally.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-heading font-bold uppercase tracking-wider border border-slate-200 dark:border-white/10 transition-all cursor-pointer shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reload Core</span>
        </button>
      </div>

      {/* Grid: App Specifications & Deployment */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Specification Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xs space-y-3">
          <span className="text-[10px] font-heading font-black tracking-wider uppercase text-slate-400 block">
            BUILD SPECIFICATIONS
          </span>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/5">
              <span className="text-slate-500">Framework</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                React 19 + Vite 6
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/5">
              <span className="text-slate-500">Current Release</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                v{APP_VERSION}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Environment</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white uppercase">
                {import.meta.env.MODE || 'Production'}
              </span>
            </div>
          </div>
        </div>

        {/* Database Health Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-heading font-black tracking-wider uppercase text-slate-400">
              DATABASE UTILIZATION
            </span>
            <Database className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-lg font-heading font-black text-slate-900 dark:text-white">
                {formatBytes(totalDbBytes)}
              </span>
              <span className="text-xs font-mono text-slate-400">
                / {formatBytes(maxDbBytes)}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${dbUsagePercent}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 font-mono">
              {dbUsagePercent.toFixed(1)}% of 500 MB capacity utilized
            </p>
          </div>
        </div>

        {/* Bucket Storage Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-heading font-black tracking-wider uppercase text-slate-400">
              STORAGE BUCKETS
            </span>
            <Cloud className="w-4 h-4 text-purple-500" />
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-lg font-heading font-black text-slate-900 dark:text-white">
                {formatBytes(totalStorageBytes)}
              </span>
              <span className="text-xs font-mono text-slate-400">
                / {formatBytes(maxStorageBytes)}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full transition-all duration-500"
                style={{ width: `${storageUsagePercent}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 font-mono">
              {storageUsagePercent.toFixed(1)}% of 1 GB bucket pool
            </p>
          </div>
        </div>
      </div>

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
    </div>
  );
};

export default SystemInformation;

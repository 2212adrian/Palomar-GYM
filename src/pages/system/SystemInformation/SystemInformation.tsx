// src/pages/system/SystemInformation.tsx
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
    <div className="space-y-6 font-body text-(--color-text)">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-heading tracking-widest uppercase text-(--color-text)">
          System Information
        </h2>
        <p className="text-sm text-slate-400 mt-1 font-medium">
          Application specifications, version metadata, storage health, and
          facility legal documentation.
        </p>
      </div>

      {/* Two-Column Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Specifications & Legal Links (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Build Specifications Card */}
          <div className="bg-(--bg-card) border border-(--border-color) p-5 rounded-2xl space-y-5">
            <div>
              <h3 className="text-sm font-heading tracking-widest uppercase text-(--color-text)">
                Build Specifications
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-semibold">
                Active runtime environment and release specifications.
              </p>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-(--border-color) text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-(--border-color)">
                <span className="text-slate-400 font-medium">Framework</span>
                <span className="font-mono font-bold text-(--color-text)">
                  React 19 + Vite 6
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-(--border-color)">
                <span className="text-slate-400 font-medium">
                  Current Release
                </span>
                <span className="font-mono font-bold text-emerald-500">
                  v{APP_VERSION}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-400 font-medium">Environment</span>
                <span className="font-mono font-bold text-(--color-text) uppercase">
                  {import.meta.env.MODE || 'Production'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-(--border-color) bg-(--bg-input) text-(--color-text) opacity-90 hover:opacity-100 rounded-lg text-xs font-heading tracking-widest uppercase transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reload Application Core</span>
            </button>
          </div>

          {/* Legal Documentation & Developer Card */}
          <div className="bg-(--bg-card) border border-(--border-color) p-5 rounded-2xl space-y-4">
            <div>
              <h3 className="text-sm font-heading tracking-widest uppercase text-(--color-text)">
                Documentation & Support
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-semibold">
                Facility terms, privacy policies, and developer contact details.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-(--border-color)">
              <button
                type="button"
                onClick={() => setActiveModal('terms')}
                className="w-full p-3 bg-(--bg-page) border border-(--border-color) rounded-xl flex items-center justify-between hover:border-(--color-primary) transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  <Scale className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-bold text-(--color-text)">
                    Terms of Service
                  </span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('privacy')}
                className="w-full p-3 bg-(--bg-page) border border-(--border-color) rounded-xl flex items-center justify-between hover:border-(--color-primary) transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-bold text-(--color-text)">
                    Privacy Policy
                  </span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('developer')}
                className="w-full p-3 bg-(--bg-page) border border-(--border-color) rounded-xl flex items-center justify-between hover:border-(--color-primary) transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  <Code2 className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold text-(--color-text)">
                    About Developer
                  </span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Service Health & Resource Utilization (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Core Services Operational Status Card */}
          <div className="bg-(--bg-card) border border-(--border-color) p-5 rounded-2xl space-y-4">
            <div>
              <h3 className="text-sm font-heading tracking-widest uppercase text-(--color-text)">
                Core Services Status
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-semibold">
                Operational integrity across active application microservices.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-(--color-text)">
                  All Core Services Operational
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Supabase Auth, Realtime Postgres, and Cloud Storage are
                  synchronized and operating within normal operational
                  parameters.
                </p>
              </div>
            </div>
          </div>

          {/* Infrastructure & Resource Allocation Card */}
          <div className="bg-(--bg-card) border border-(--border-color) p-5 rounded-2xl space-y-5">
            <div>
              <h3 className="text-sm font-heading tracking-widest uppercase text-(--color-text)">
                Resource Utilization
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-semibold">
                Database volume allocations and cloud asset storage pools.
              </p>
            </div>

            {/* Database Utilization Gauge */}
            <div className="space-y-2 pt-2 border-t border-(--border-color)">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-blue-500" />
                  Database Utilization
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-400">
                  {dbUsagePercent.toFixed(1)}%
                </span>
              </div>
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-base font-heading font-black text-(--color-text)">
                    {formatBytes(totalDbBytes)}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    / {formatBytes(maxDbBytes)}
                  </span>
                </div>
                <div className="w-full h-2 bg-(--bg-page) border border-(--border-color) rounded-full overflow-hidden">
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

            {/* Storage Buckets Gauge */}
            <div className="space-y-2 pt-4 border-t border-(--border-color)">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5 text-purple-500" />
                  Storage Buckets
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-400">
                  {storageUsagePercent.toFixed(1)}%
                </span>
              </div>
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-base font-heading font-black text-(--color-text)">
                    {formatBytes(totalStorageBytes)}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    / {formatBytes(maxStorageBytes)}
                  </span>
                </div>
                <div className="w-full h-2 bg-(--bg-page) border border-(--border-color) rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-500"
                    style={{ width: `${storageUsagePercent}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 font-mono">
                  {storageUsagePercent.toFixed(1)}% of 1 GB bucket pool utilized
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Shared Modals */}
      <AgreementDocumentViewer
        isOpen={activeModal === 'terms' || activeModal === 'privacy'}
        onClose={() => setActiveModal(null)}
        initialDocument={activeModal === 'terms' ? 'terms' : 'privacy'}
      />

      {/* Developer Modal */}
      <Modal
        isOpen={activeModal === 'developer'}
        onClose={() => setActiveModal(null)}
        title="About Developer"
      >
        <div className="space-y-4 font-body text-left text-xs">
          <div className="p-3 bg-(--bg-page) border border-(--border-color) rounded-xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-(--color-primary)/10 border border-(--color-primary)/20 flex items-center justify-center text-(--color-primary) shrink-0">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-heading tracking-wider uppercase text-(--color-text) text-sm font-bold">
                Adrian R. Angeles
              </h4>
              <p className="text-xs text-(--color-primary-light) font-bold tracking-wider">
                Lead Software Developer
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-(--color-text)">
              Direct Inquiries
            </h4>
            <div className="space-y-2">
              <a
                href="tel:09762607481"
                className="flex items-center gap-2.5 p-2.5 rounded-lg border border-(--border-color) bg-(--bg-page) text-(--color-text) hover:border-(--color-primary) transition-colors"
              >
                <Phone className="w-4 h-4 text-(--color-primary)" />
                <span className="font-mono text-xs">09762607481</span>
              </a>
              <a
                href="mailto:adrianangeles2213@gmail.com"
                className="flex items-center gap-2.5 p-2.5 rounded-lg border border-(--border-color) bg-(--bg-page) text-(--color-text) hover:border-(--color-primary) transition-colors"
              >
                <Mail className="w-4 h-4 text-emerald-500" />
                <span className="font-mono text-xs">
                  adrianangeles2213@gmail.com
                </span>
              </a>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setActiveModal(null)}
              className="w-full py-2.5 bg-(--bg-input) text-(--color-text) rounded-xl font-heading text-xs uppercase tracking-wider hover:opacity-90 transition-all cursor-pointer text-center"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SystemInformation;

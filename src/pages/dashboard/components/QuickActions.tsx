import React from 'react';
import {
  QrCode,
  ShoppingBag,
  UserPlus,
  FileCheck,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface QuickActionsProps {
  onScanClick?: () => void;
  onNewSaleClick?: () => void;
  onAddMemberClick?: () => void;
  onNewSubscriptionClick?: () => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  onScanClick,
  onNewSaleClick,
  onAddMemberClick,
  onNewSubscriptionClick,
}) => {
  const navigate = useNavigate();

  return (
    <div className="bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xs">
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <div>
          <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white font-heading flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-500" />
            Quick Desk Actions
          </h2>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
            One-touch operational shortcuts for front desk counters.
          </p>
        </div>
      </div>

      {/* 4-Item Balanced Matrix (2x2 on Mobile/Square, 4x1 on Large Desktop) */}
      <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3.5">
        {/* 1. SCAN MEMBER (PRIMARY ACTION) */}
        <button
          id="btn-quick-scan-member"
          onClick={onScanClick || (() => navigate('/scanner'))}
          className="group relative col-span-1 bg-[#123c73] hover:bg-[#0c2950] dark:bg-[#bf0202] dark:hover:bg-[#9c0202] text-white p-3.5 sm:p-4 rounded-xl font-medium transition-all shadow-xs hover:shadow-md flex flex-col justify-between text-left active:scale-[0.97] cursor-pointer overflow-hidden border border-blue-900/40 dark:border-red-900/40"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <span className="text-[10px] bg-emerald-500 text-white font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              Fast
            </span>
          </div>

          <div className="mt-3 min-w-0">
            <div className="text-xs sm:text-sm font-black uppercase font-heading leading-tight flex items-center justify-between">
              <span className="truncate">Scan Member</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-70 group-hover:translate-x-1 group-hover:opacity-100 transition-all shrink-0" />
            </div>
            <p className="text-[10px] sm:text-[11px] text-blue-100 dark:text-red-100 opacity-90 truncate mt-0.5">
              Instant QR / Card Entry
            </p>
          </div>
        </button>

        {/* 2. NEW POS SALE */}
        <button
          id="btn-quick-new-sale"
          onClick={onNewSaleClick || (() => navigate('/sales'))}
          className="group col-span-1 bg-slate-50 dark:bg-[#1e232d] hover:bg-blue-50/70 dark:hover:bg-slate-800/80 text-slate-900 dark:text-slate-100 p-3.5 sm:p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/70 hover:border-blue-300 dark:hover:border-blue-500/40 transition-all text-left flex flex-col justify-between active:scale-[0.97] cursor-pointer"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="w-9 h-9 rounded-lg bg-blue-100/80 dark:bg-blue-950/60 text-[#123c73] dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-3 min-w-0">
            <div className="text-xs sm:text-sm font-black uppercase font-heading leading-tight flex items-center justify-between">
              <span className="truncate">POS Sale</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-1 group-hover:text-[#123c73] dark:group-hover:text-blue-400 transition-all shrink-0" />
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
              Drinks & Merchandise
            </p>
          </div>
        </button>

        {/* 3. ADD NEW MEMBER */}
        <button
          id="btn-quick-add-member"
          onClick={onAddMemberClick || (() => navigate('/members/list'))}
          className="group col-span-1 bg-slate-50 dark:bg-[#1e232d] hover:bg-emerald-50/70 dark:hover:bg-slate-800/80 text-slate-900 dark:text-slate-100 p-3.5 sm:p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/70 hover:border-emerald-300 dark:hover:border-emerald-500/40 transition-all text-left flex flex-col justify-between active:scale-[0.97] cursor-pointer"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <UserPlus className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-3 min-w-0">
            <div className="text-xs sm:text-sm font-black uppercase font-heading leading-tight flex items-center justify-between">
              <span className="truncate">Add Member</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-1 group-hover:text-emerald-600 transition-all shrink-0" />
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
              Register New Client
            </p>
          </div>
        </button>

        {/* 4. NEW SUBSCRIPTION / LOG ENTRY */}
        <button
          id="btn-quick-new-subscription"
          onClick={onNewSubscriptionClick || (() => navigate('/logbook'))}
          className="group col-span-1 bg-slate-50 dark:bg-[#1e232d] hover:bg-purple-50/70 dark:hover:bg-slate-800/80 text-slate-900 dark:text-slate-100 p-3.5 sm:p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/70 hover:border-purple-300 dark:hover:border-purple-500/40 transition-all text-left flex flex-col justify-between active:scale-[0.97] cursor-pointer"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="w-9 h-9 rounded-lg bg-purple-100/80 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <FileCheck className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-3 min-w-0">
            <div className="text-xs sm:text-sm font-black uppercase font-heading leading-tight flex items-center justify-between">
              <span className="truncate">New Pass / Plan</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-1 group-hover:text-purple-600 transition-all shrink-0" />
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
              Walk-in or Monthly Pass
            </p>
          </div>
        </button>
      </div>
    </div>
  );
};

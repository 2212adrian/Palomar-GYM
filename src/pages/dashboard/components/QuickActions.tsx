// src/pages/dashboard/components/QuickActions.tsx
import React from 'react';
import { QrCode, ShoppingBag, UserPlus, FileCheck, ArrowRight } from 'lucide-react';
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
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 font-heading">
            Quick Actions
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Frequently used front desk operations for immediate counter execution.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* 1. SCAN MEMBER (PRIMARY ACTION) */}
        <button
          id="btn-quick-scan-member"
          onClick={onScanClick || (() => navigate('/scanner'))}
          className="col-span-2 sm:col-span-1 bg-[#123c73] hover:bg-[#0e2f5a] text-white p-3.5 rounded-xl font-medium transition-all shadow-sm hover:shadow-md flex items-center justify-between group active:scale-[0.98] border border-blue-900"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <div className="text-sm font-bold leading-tight flex items-center gap-1.5">
                Scan Member
                <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.2 rounded-full font-normal">Fast</span>
              </div>
              <span className="text-[11px] text-blue-200">Instant QR / Card Entry</span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-blue-200 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* 2. NEW SALE */}
        <button
          id="btn-quick-new-sale"
          onClick={onNewSaleClick || (() => navigate('/sales'))}
          className="bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 transition-all text-left flex items-center gap-3 group active:scale-[0.98]"
        >
          <div className="w-9 h-9 rounded-lg bg-blue-100/70 dark:bg-blue-900/30 text-[#123c73] dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs sm:text-sm font-bold leading-tight">New Sale</div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">POS Register</span>
          </div>
        </button>

        {/* 3. ADD MEMBER */}
        <button
          id="btn-quick-add-member"
          onClick={onAddMemberClick || (() => navigate('/members/list'))}
          className="bg-slate-50 dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 transition-all text-left flex items-center gap-3 group active:scale-[0.98]"
        >
          <div className="w-9 h-9 rounded-lg bg-emerald-100/70 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs sm:text-sm font-bold leading-tight">Add Member</div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Register Client</span>
          </div>
        </button>

        {/* 4. NEW SUBSCRIPTION / LOG ENTRY */}
        <button
          id="btn-quick-new-subscription"
          onClick={onNewSubscriptionClick || (() => navigate('/logbook'))}
          className="bg-slate-50 dark:bg-slate-800/80 hover:bg-purple-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 transition-all text-left flex items-center gap-3 group active:scale-[0.98]"
        >
          <div className="w-9 h-9 rounded-lg bg-purple-100/70 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs sm:text-sm font-bold leading-tight">New Subscription</div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Pass / Membership</span>
          </div>
        </button>
      </div>
    </div>
  );
};

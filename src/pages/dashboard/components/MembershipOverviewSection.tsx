import React from 'react';
import { Clock, ArrowRight, Calendar, UserCheck, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ExpiringMemberItem, DashboardMetrics } from '../types';
import { formatNumber } from '../dashboardService';

interface MembershipOverviewSectionProps {
  metrics: DashboardMetrics;
  expiringMembers: ExpiringMemberItem[];
  onRenewMember?: (member: ExpiringMemberItem) => void;
}

export const MembershipOverviewSection: React.FC<MembershipOverviewSectionProps> = ({
  metrics,
  expiringMembers,
  onRenewMember,
}) => {
  const navigate = useNavigate();

  return (
    <div className="bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider font-heading flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-[#123c73] dark:text-blue-400" />
            Membership Status Overview
          </h3>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
            Subscription health and renewal alerts requiring staff attention.
          </p>
        </div>
        <button
          onClick={() => navigate('/members/list')}
          className="text-xs font-bold text-[#123c73] dark:text-blue-400 hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
        >
          <span>View All</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Segmented Statistics Cards (2x2 on Mobile, 4x1 on Tablet/Desktop) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase">
            Active
          </span>
          <div className="text-lg sm:text-xl font-black text-emerald-900 dark:text-emerald-100 font-heading mt-0.5">
            {formatNumber(metrics.activeMembersCount)}
          </div>
          <span className="text-[10px] text-emerald-700/80 dark:text-emerald-400 mt-1">Valid passes</span>
        </div>

        <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase">
            Expiring (7d)
          </span>
          <div className="text-lg sm:text-xl font-black text-amber-900 dark:text-amber-100 font-heading mt-0.5">
            {formatNumber(metrics.expiringSoonCount)}
          </div>
          <span className="text-[10px] text-amber-700/80 dark:text-amber-400 mt-1">Needs follow-up</span>
        </div>

        <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] font-bold text-rose-800 dark:text-rose-300 uppercase">
            Expired
          </span>
          <div className="text-lg sm:text-xl font-black text-rose-900 dark:text-rose-100 font-heading mt-0.5">
            {formatNumber(metrics.expiredCount)}
          </div>
          <span className="text-[10px] text-rose-700/80 dark:text-rose-400 mt-1">Lapsed plans</span>
        </div>

        <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] font-bold text-[#123c73] dark:text-blue-300 uppercase">
            New Signups
          </span>
          <div className="text-lg sm:text-xl font-black text-slate-900 dark:text-white font-heading mt-0.5">
            {formatNumber(metrics.newMembersThisMonth)}
          </div>
          <span className="text-[10px] text-blue-600/80 dark:text-blue-400 mt-1">This month</span>
        </div>
      </div>

      {/* Expiring Subscriptions List */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            <span>Expiring Memberships ({expiringMembers.length})</span>
          </h4>
        </div>

        {expiringMembers.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            No memberships expiring in the next 7 days.
          </div>
        ) : (
          <div className="space-y-2">
            {expiringMembers.slice(0, 4).map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#1e232d]/40 hover:bg-slate-100/80 dark:hover:bg-[#1e232d]/80 transition-colors gap-2 sm:gap-3"
              >
                <div className="min-w-0 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#123c73]/10 dark:bg-blue-500/20 text-[#123c73] dark:text-blue-400 flex items-center justify-center font-black text-xs shrink-0">
                    {member.full_name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {member.full_name}
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5 truncate">
                      <span>{member.plan_type}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {member.end_date}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    member.daysRemaining <= 1 
                      ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 animate-pulse' 
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                  }`}>
                    {member.daysRemaining === 0 ? 'Today' : `${member.daysRemaining}d left`}
                  </span>

                  <button
                    onClick={() => onRenewMember?.(member) || navigate('/logbook')}
                    className="px-2.5 py-1 text-[11px] font-bold bg-[#123c73] hover:bg-[#0c2950] dark:bg-[#bf0202] dark:hover:bg-[#9c0202] text-white rounded-lg transition-all active:scale-95 cursor-pointer"
                  >
                    Renew
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
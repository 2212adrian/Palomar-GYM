// src/pages/dashboard/components/MembershipOverviewSection.tsx
import React from 'react';
import { Clock, ArrowRight, Calendar } from 'lucide-react';
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
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider font-heading">
            Membership Overview
          </h3>
          <p className="text-xs text-slate-500">
            Current subscription statuses and upcoming renewals requiring staff outreach.
          </p>
        </div>
        <button
          onClick={() => navigate('/members/list')}
          className="text-xs font-semibold text-[#123c73] dark:text-blue-400 hover:underline flex items-center gap-1"
        >
          View All <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Segmented Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
          <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase">
            Active
          </span>
          <div className="text-xl font-extrabold text-emerald-900 dark:text-emerald-100 mt-1">
            {formatNumber(metrics.activeMembersCount)}
          </div>
          <span className="text-[10px] text-emerald-700/80 dark:text-emerald-400">Valid passes</span>
        </div>

        <div className="p-3 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40">
          <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase">
            Expiring (7d)
          </span>
          <div className="text-xl font-extrabold text-amber-900 dark:text-amber-100 mt-1">
            {formatNumber(metrics.expiringSoonCount)}
          </div>
          <span className="text-[10px] text-amber-700/80 dark:text-amber-400">Needs follow-up</span>
        </div>

        <div className="p-3 rounded-lg bg-rose-50/60 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40">
          <span className="text-[11px] font-bold text-rose-800 dark:text-rose-300 uppercase">
            Expired
          </span>
          <div className="text-xl font-extrabold text-rose-900 dark:text-rose-100 mt-1">
            {formatNumber(metrics.expiredCount)}
          </div>
          <span className="text-[10px] text-rose-700/80 dark:text-rose-400">Lapsed plans</span>
        </div>

        <div className="p-3 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
          <span className="text-[11px] font-bold text-[#123c73] dark:text-blue-300 uppercase">
            New This Month
          </span>
          <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
            {formatNumber(metrics.newMembersThisMonth)}
          </div>
          <span className="text-[10px] text-blue-600/80 dark:text-blue-400">New signups</span>
        </div>
      </div>

      {/* Expiring Subscriptions List */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            Expiring Memberships ({expiringMembers.length})
          </h4>
        </div>

        {expiringMembers.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
            No memberships expiring in the next 7 days.
          </div>
        ) : (
          <div className="space-y-2">
            {expiringMembers.slice(0, 4).map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors gap-3"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-200 shrink-0">
                    {member.full_name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {member.full_name}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>{member.plan_type}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {member.end_date}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    member.daysRemaining <= 1 
                      ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 animate-pulse' 
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                  }`}>
                    {member.daysRemaining === 0 ? 'Today' : `${member.daysRemaining} days left`}
                  </span>

                  <button
                    onClick={() => onRenewMember?.(member) || navigate('/logbook')}
                    className="px-2.5 py-1 text-[11px] font-bold bg-[#123c73] hover:bg-[#0e2f5a] text-white rounded-md transition-colors"
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

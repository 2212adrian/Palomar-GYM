import React from 'react';
import {
  Activity,
  UserCheck,
  ShoppingBag,
  UserPlus,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import type { ActivityFeedItem } from '../types';
import { formatPHP } from '../dashboardService';

interface RecentActivityFeedProps {
  activities: ActivityFeedItem[];
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const RecentActivityFeed: React.FC<RecentActivityFeedProps> = ({
  activities,
  onRefresh,
  isLoading,
}) => {
  const getIcon = (type: ActivityFeedItem['type']) => {
    switch (type) {
      case 'checkin':
        return (
          <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        );
      case 'sale':
        return (
          <ShoppingBag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        );
      case 'membership_new':
      case 'membership_renew':
        return (
          <UserPlus className="w-4 h-4 text-purple-600 dark:text-purple-400" />
        );
      default:
        return <Activity className="w-4 h-4 text-slate-500" />;
    }
  };

  const getBadgeStyle = (variant: ActivityFeedItem['badgeVariant']) => {
    switch (variant) {
      case 'success':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
      case 'primary':
        return 'bg-blue-100 text-[#123c73] dark:bg-blue-950 dark:text-blue-300';
      case 'purple':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300';
      case 'info':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300';
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    try {
      const d = parseISO(timestamp);
      return formatDistanceToNow(d, { addSuffix: true });
    } catch {
      return 'just now';
    }
  };

  return (
    <div className="bg-white dark:bg-[#161920] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4 h-full flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <div>
            <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider font-heading flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-[#123c73] dark:text-blue-400" />
              Recent Transactions
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
              Latest Combined Sales & Logbook activity feed.
            </p>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Refresh Activity Feed"
            >
              <RotateCcw
                className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
              />
            </button>
          )}
        </div>

        {/* Activity List */}
        {activities.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            No activity logged yet today.
          </div>
        ) : (
          <div className="space-y-3">
            {activities.slice(0, 12).map((act) => (
              <div
                key={act.id}
                className="flex items-start justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800/80 last:border-0 last:pb-0"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-[#1e232d] flex items-center justify-center shrink-0 mt-0.5">
                    {getIcon(act.type)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {act.title}
                      </span>
                      <span
                        className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-sm shrink-0 ${getBadgeStyle(act.badgeVariant)}`}
                      >
                        {act.badgeText}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {act.subtitle}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1 justify-end">
                    <Clock className="w-3 h-3" />
                    {formatTimeAgo(act.timestamp)}
                  </span>
                  {act.amount !== undefined && act.amount > 0 && (
                    <span className="text-[11px] font-black text-slate-900 dark:text-white block mt-0.5">
                      {formatPHP(act.amount)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// src/components/layouts/NotificationPopover.tsx
import React, { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, 
  Check, 
  Clock, 
  ChevronRight, 
  ExternalLink,
  ShieldCheck,
  BellRing,
  X
} from 'lucide-react';
import { useNotificationStore, formatBadgeCount } from '../../stores/useNotificationStore';
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';

interface NotificationPopoverProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationPopover: React.FC<NotificationPopoverProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const popoverRef = useRef<HTMLDivElement>(null);
  const { user, profile } = useAuthStore();
  const isAdmin = isSuperAdmin(user?.email) || profile?.role === 'admin';

  const {
    incidentUnreadCount,
    stockAlertsCount,
    expiringSubsCount,
    unreadIncidents,
    stockAlertProducts,
    expiringMembers,
    browserPermission,
    requestBrowserPermission,
    markIncidentRead
  } = useNotificationStore();

  const totalNotifications = (isAdmin ? incidentUnreadCount : 0) + stockAlertsCount + expiringSubsCount;

  // Handle outside click to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose();
  };

  const handleIncidentClick = async (incidentId: string) => {
    await markIncidentRead(incidentId);
    navigate('/reports');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="absolute right-0 top-[calc(100%+8px)] w-80 sm:w-96 bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* HEADER */}
          <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-slate-50/70 dark:bg-neutral-900/50 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#123c73]/10 dark:bg-white/10 flex items-center justify-center text-[#123c73] dark:text-white shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-heading text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                  NOTIFICATIONS
                  {totalNotifications > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
                      {formatBadgeCount(totalNotifications)}
                    </span>
                  )}
                </h3>
                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                  {totalNotifications === 0 ? 'All caught up' : `${totalNotifications} active alert${totalNotifications > 1 ? 's' : ''}`}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg hover:bg-slate-200/60 dark:hover:bg-neutral-800 text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* BROWSER PERMISSION BANNER */}
          <div className="px-3.5 py-2.5 bg-slate-100/80 dark:bg-neutral-900/90 border-b border-slate-200/80 dark:border-white/5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <BellRing className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
              <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 truncate">
                {browserPermission === 'granted'
                  ? 'Browser alerts active'
                  : browserPermission === 'denied'
                  ? 'Browser alerts blocked in settings'
                  : 'Enable instant browser push'}
              </span>
            </div>

            {browserPermission !== 'granted' && (
              <button
                type="button"
                onClick={requestBrowserPermission}
                className="px-2 py-1 rounded-lg text-[9px] font-heading font-black tracking-wider uppercase bg-[#123c73] dark:bg-[#bf0202] text-white hover:opacity-90 transition-all cursor-pointer shrink-0 active:scale-95 shadow-xs"
              >
                {browserPermission === 'denied' ? 'BLOCKED' : 'ALLOW'}
              </button>
            )}

            {browserPermission === 'granted' && (
              <span className="text-[9px] font-heading font-black tracking-wider text-emerald-600 dark:text-emerald-400 uppercase flex items-center gap-1 shrink-0">
                <Check className="w-3 h-3" /> ENABLED
              </span>
            )}
          </div>

          {/* NOTIFICATION CONTENT FEED */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5 p-1 font-body">
            {totalNotifications === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h4 className="font-heading text-xs font-bold uppercase text-slate-700 dark:text-slate-200">
                  No Active Alerts
                </h4>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 max-w-xs mx-auto">
                  All incident reports are reviewed, stock quantities are healthy, and memberships are active.
                </p>
              </div>
            ) : (
              <>
                {/* 1. INCIDENT REPORTS (ADMIN ONLY) */}
                {isAdmin && incidentUnreadCount > 0 && (
                  <div className="p-2 space-y-1.5">
                    <div className="flex items-center justify-between px-2 pt-1">
                      <span className="text-[9px] font-heading font-black tracking-wider uppercase text-red-600 dark:text-red-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        INCIDENT REPORTS ({formatBadgeCount(incidentUnreadCount)})
                      </span>
                      <button
                        onClick={() => handleNavigate('/reports')}
                        className="text-[9px] font-heading font-bold text-slate-400 hover:text-slate-800 dark:hover:text-white uppercase flex items-center gap-0.5 cursor-pointer"
                      >
                        VIEW ALL <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="space-y-1">
                      {unreadIncidents.slice(0, 3).map((item) => (
                        <div
                          key={item.id}
                          onClick={() => handleIncidentClick(item.id)}
                          className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-neutral-800/80 border border-transparent hover:border-slate-200 dark:hover:border-white/5 transition-all cursor-pointer group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase ${
                                  item.priority === 'High'
                                    ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20'
                                    : item.priority === 'Medium'
                                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                    : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                                }`}>
                                  {item.priority}
                                </span>
                                <h5 className="font-heading text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                  {item.title}
                                </h5>
                              </div>
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono mt-1 block">
                                Reported by {item.staff_name} • {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <span className="text-[9px] font-black text-red-500 opacity-0 group-hover:opacity-100 transition-opacity uppercase shrink-0">
                              READ
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. SALES PRODUCT STOCK ISSUES */}
                {stockAlertsCount > 0 && (
                  <div className="p-2 space-y-1.5">
                    <div className="flex items-center justify-between px-2 pt-1">
                      <span className="text-[9px] font-heading font-black tracking-wider uppercase text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        STOCK ALERTS ({formatBadgeCount(stockAlertsCount)})
                      </span>
                      <button
                        onClick={() => handleNavigate('/sales/products')}
                        className="text-[9px] font-heading font-bold text-slate-400 hover:text-slate-800 dark:hover:text-white uppercase flex items-center gap-0.5 cursor-pointer"
                      >
                        INVENTORY <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="space-y-1">
                      {stockAlertProducts.slice(0, 3).map((prod) => (
                        <div
                          key={prod.id}
                          onClick={() => handleNavigate('/sales/products')}
                          className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-neutral-800/80 border border-transparent hover:border-slate-200 dark:hover:border-white/5 transition-all cursor-pointer flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <h5 className="font-heading text-xs font-bold text-slate-800 dark:text-slate-200 truncate uppercase">
                              {prod.product_name}
                            </h5>
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">
                              Alert threshold: {prod.low_stock_alert ?? 0} units
                            </span>
                          </div>

                          {prod.isOutOfStock ? (
                            <span className="px-2 py-0.5 rounded-md text-[8.5px] font-black uppercase bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 shrink-0">
                              NO STOCK
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[8.5px] font-black uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                              LOW ({prod.stock_quantity})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. EXPIRING SUBSCRIPTIONS (< 7 DAYS) */}
                {expiringSubsCount > 0 && (
                  <div className="p-2 space-y-1.5">
                    <div className="flex items-center justify-between px-2 pt-1">
                      <span className="text-[9px] font-heading font-black tracking-wider uppercase text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        EXPIRING MEMBERSHIPS ({formatBadgeCount(expiringSubsCount)})
                      </span>
                      <button
                        onClick={() => handleNavigate('/members/list')}
                        className="text-[9px] font-heading font-bold text-slate-400 hover:text-slate-800 dark:hover:text-white uppercase flex items-center gap-0.5 cursor-pointer"
                      >
                        MEMBERS <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="space-y-1">
                      {expiringMembers.slice(0, 3).map((sub) => (
                        <div
                          key={sub.id}
                          onClick={() => handleNavigate('/members/list')}
                          className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-neutral-800/80 border border-transparent hover:border-slate-200 dark:hover:border-white/5 transition-all cursor-pointer flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <h5 className="font-heading text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {sub.full_name}
                            </h5>
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">
                              {sub.plan_type}
                            </span>
                          </div>

                          <span className="px-2 py-0.5 rounded-md text-[8.5px] font-black uppercase bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 shrink-0">
                            {sub.daysRemaining === 0 ? 'Expires Today' : `${sub.daysRemaining}d left`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* FOOTER SHORTCUT */}
          <div className="p-2.5 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-neutral-900/50 flex items-center justify-between text-[10px] font-heading font-black">
            <button
              onClick={() => handleNavigate(isAdmin ? '/reports' : '/sales')}
              className="text-[#123c73] dark:text-white hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>SYSTEM ALERTS OVERVIEW</span>
              <ExternalLink className="w-3 h-3" />
            </button>
            <span className="text-slate-400 dark:text-slate-500 font-mono">
              Cap 9+
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

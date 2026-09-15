// src/components/layout/NotificationPopover.tsx
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  Check,
  Clock,
  ChevronRight,
  ShieldCheck,
  BellRing,
  X,
  Package,
  AlertTriangle,
  Flame,
  UserCheck,
  ShieldAlert,
} from 'lucide-react';
import {
  useNotificationStore,
  formatBadgeCount,
} from '../../stores/useNotificationStore';
import { useAuthStore } from '../../stores/authStore';
import { isSuperAdmin } from '../../constants/auth';

interface NotificationPopoverProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'all' | 'incidents' | 'stock' | 'members';

export const NotificationPopover: React.FC<NotificationPopoverProps> = ({
  isOpen,
  onClose,
}) => {
  const navigate = useNavigate();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null
  );

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
    markIncidentRead,
    dismissAlert,
    markAllAsRead,
  } = useNotificationStore();

  const totalNotifications =
    (isAdmin ? incidentUnreadCount : 0) + stockAlertsCount + expiringSubsCount;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Compute anchor position for desktop screens
  useEffect(() => {
    if (isOpen) {
      const trigger = document.getElementById('btn-topbar-notifications');
      if (trigger) {
        const rect = trigger.getBoundingClientRect();
        setCoords({
          top: rect.bottom + 8,
          right: Math.max(12, window.innerWidth - rect.right),
        });
      }
    }
  }, [isOpen]);

  // Handle outside click & escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Element | null;
      if (target && target.closest('#btn-topbar-notifications')) {
        return;
      }
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleNavigate = (path: string, options?: { state?: any }) => {
    navigate(path, options);
    onClose();
  };

  const handleIncidentClick = async (incidentId: string) => {
    await markIncidentRead(incidentId);
    handleNavigate('/reports', { state: { openIncidentId: incidentId } });
  };

  const handleStockClick = (productId: string) => {
    dismissAlert('stock', productId);
    handleNavigate('/sales/products', {
      state: { highlightProductId: productId },
    });
  };

  const handleExpiringMemberClick = (memberId: string) => {
    dismissAlert('member', memberId);
    handleNavigate('/members/list', { state: { openMemberId: memberId } });
  };

  const showIncidents =
    isAdmin &&
    (activeTab === 'all' || activeTab === 'incidents') &&
    unreadIncidents.length > 0;
  const showStock =
    (activeTab === 'all' || activeTab === 'stock') &&
    stockAlertProducts.length > 0;
  const showMembers =
    (activeTab === 'all' || activeTab === 'members') &&
    expiringMembers.length > 0;

  const hasItemsInTab = showIncidents || showStock || showMembers;

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 1. SCRIM: Mobile only (hidden on PC/desktop with sm:hidden) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[99998] bg-black/90 dark:bg-[#07090e]/95 backdrop-blur-md cursor-pointer sm:hidden"
            onClick={onClose}
          />

          {/* 2. NOTIFICATION POPOVER */}
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            style={
              coords &&
              typeof window !== 'undefined' &&
              window.innerWidth >= 640
                ? { top: `${coords.top}px`, right: `${coords.right}px` }
                : undefined
            }
            className="fixed left-2.5 right-2 top-2.5 sm:left-auto sm:right-4 sm:top-16 sm:w-[390px] md:w-[410px] max-h-[66vh] sm:max-h-[480px] bg-white dark:bg-[#161920] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl z-[99999] overflow-hidden flex flex-col font-body select-none"
          >
            {/* TOP HEADER */}
            <div className="p-3 sm:p-3.5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-slate-50/90 dark:bg-zinc-900/80 backdrop-blur-md shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-blue-600/10 dark:bg-red-500/10 text-blue-600 dark:text-red-400 flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white truncate">
                      Notifications
                    </h3>
                    {totalNotifications > 0 && (
                      <span className="px-1.5 py-0.2 rounded-md text-[9px] font-black bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20 shrink-0">
                        {formatBadgeCount(totalNotifications)}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">
                    {totalNotifications === 0
                      ? 'Everything is up to date'
                      : `${totalNotifications} active item${totalNotifications > 1 ? 's' : ''} require attention`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                {totalNotifications > 0 && (
                  <button
                    type="button"
                    onClick={() => markAllAsRead()}
                    className="text-[9.5px] font-heading font-bold text-blue-600 dark:text-red-400 uppercase hover:underline cursor-pointer px-1.5 py-1 rounded transition-colors"
                  >
                    Clear All
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200/70 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer -mr-1"
                  aria-label="Close notifications"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* CATEGORY TABS */}
            {totalNotifications > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100/70 dark:bg-zinc-950/50 border-b border-slate-100 dark:border-white/5 overflow-x-auto scrollbar-none shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
                    activeTab === 'all'
                      ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-xs border border-slate-200/80 dark:border-white/10'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                  }`}
                >
                  All ({totalNotifications})
                </button>

                {isAdmin && incidentUnreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('incidents')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-heading font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                      activeTab === 'incidents'
                        ? 'bg-red-500/15 text-red-600 dark:text-red-400 shadow-xs border border-red-500/30 font-black'
                        : 'text-slate-500 hover:text-red-500'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    <span>Incidents ({incidentUnreadCount})</span>
                  </button>
                )}

                {stockAlertsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('stock')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-heading font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                      activeTab === 'stock'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-xs border border-amber-500/30 font-black'
                        : 'text-slate-500 hover:text-amber-500'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>Stock ({stockAlertsCount})</span>
                  </button>
                )}

                {expiringSubsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('members')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-heading font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                      activeTab === 'members'
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 shadow-xs border border-rose-500/30 font-black'
                        : 'text-slate-500 hover:text-rose-500'
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    <span>Expiring ({expiringSubsCount})</span>
                  </button>
                )}
              </div>
            )}

            {/* SCROLLABLE FEED */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 divide-y divide-slate-100 dark:divide-white/5 scrollbar-thin">
              {!hasItemsInTab ? (
                <div className="p-7 text-center space-y-2">
                  <div className="w-11 h-11 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto border border-emerald-500/20">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <h4 className="font-heading text-xs font-bold uppercase text-slate-800 dark:text-slate-200">
                    No Active Alerts
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                    All inventory stocks are healthy, subscriptions are current,
                    and reports are reviewed.
                  </p>
                </div>
              ) : (
                <>
                  {/* INCIDENTS SECTION */}
                  {showIncidents && (
                    <div className="space-y-1.5 pt-1">
                      {activeTab === 'all' && (
                        <div className="flex items-center justify-between px-1.5 pb-1">
                          <span className="text-[9px] font-heading font-black tracking-wider uppercase text-red-600 dark:text-red-400 flex items-center gap-1.5">
                            <Flame className="w-3 h-3" />
                            Incident Reports
                          </span>
                          <button
                            onClick={() => handleNavigate('/reports')}
                            className="text-[9px] font-heading font-bold text-slate-400 hover:text-slate-700 dark:hover:text-white uppercase flex items-center gap-0.5 cursor-pointer"
                          >
                            View All <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      <div className="space-y-1">
                        {unreadIncidents.slice(0, 4).map((item) => (
                          <div
                            key={item.id}
                            onClick={() => handleIncidentClick(item.id)}
                            className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-zinc-900/60 hover:bg-slate-100 dark:hover:bg-zinc-800/80 border border-slate-200/60 dark:border-white/5 transition-all cursor-pointer flex items-start gap-2.5 group"
                          >
                            <div className="p-2 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 shrink-0 mt-0.5">
                              <ShieldAlert className="w-4 h-4" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1.5">
                                <h5 className="font-heading text-xs font-bold text-slate-900 dark:text-white truncate">
                                  {item.title}
                                </h5>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase shrink-0 ${
                                    item.priority === 'High'
                                      ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                                      : item.priority === 'Medium'
                                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                        : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                                  }`}
                                >
                                  {item.priority}
                                </span>
                              </div>

                              <span className="text-[9.5px] text-slate-500 dark:text-slate-400 font-medium block mt-0.5">
                                By {item.staff_name} •{' '}
                                {new Date(item.created_at).toLocaleTimeString(
                                  [],
                                  { hour: '2-digit', minute: '2-digit' }
                                )}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissAlert('incident', item.id);
                              }}
                              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              title="Dismiss alert"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* STOCK ISSUES SECTION */}
                  {showStock && (
                    <div className="space-y-1.5 pt-2">
                      {activeTab === 'all' && (
                        <div className="flex items-center justify-between px-1.5 pb-1">
                          <span className="text-[9px] font-heading font-black tracking-wider uppercase text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                            <AlertTriangle className="w-3 h-3" />
                            Inventory Stock Alerts
                          </span>
                          <button
                            onClick={() => handleNavigate('/sales/products')}
                            className="text-[9px] font-heading font-bold text-slate-400 hover:text-slate-700 dark:hover:text-white uppercase flex items-center gap-0.5 cursor-pointer"
                          >
                            View Catalog <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      <div className="space-y-1">
                        {stockAlertProducts.slice(0, 4).map((prod) => (
                          <div
                            key={prod.id}
                            onClick={() => handleStockClick(prod.id)}
                            className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-zinc-900/60 hover:bg-slate-100 dark:hover:bg-zinc-800/80 border border-slate-200/60 dark:border-white/5 transition-all cursor-pointer flex items-center justify-between gap-2.5 group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                                <Package className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <h5 className="font-heading text-xs font-bold text-slate-900 dark:text-white truncate uppercase">
                                  {prod.product_name}
                                </h5>
                                <span className="text-[9.5px] text-slate-500 dark:text-slate-400 font-mono">
                                  Alert threshold: {prod.low_stock_alert ?? 0}{' '}
                                  pcs
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {prod.isOutOfStock ? (
                                <span className="px-2 py-0.5 rounded-md text-[8.5px] font-black uppercase bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20">
                                  NO STOCK
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md text-[8.5px] font-black uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  {prod.stock_quantity} left
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dismissAlert('stock', prod.id);
                                }}
                                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                title="Dismiss alert"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* EXPIRING SUBSCRIPTIONS SECTION */}
                  {showMembers && (
                    <div className="space-y-1.5 pt-2">
                      {activeTab === 'all' && (
                        <div className="flex items-center justify-between px-1.5 pb-1">
                          <span className="text-[9px] font-heading font-black tracking-wider uppercase text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            Expiring Subscriptions (&lt;7 Days)
                          </span>
                          <button
                            onClick={() => handleNavigate('/members/list')}
                            className="text-[9px] font-heading font-bold text-slate-400 hover:text-slate-700 dark:hover:text-white uppercase flex items-center gap-0.5 cursor-pointer"
                          >
                            Directory <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      <div className="space-y-1">
                        {expiringMembers.slice(0, 4).map((sub) => (
                          <div
                            key={sub.id}
                            onClick={() =>
                              handleExpiringMemberClick(sub.member_id)
                            }
                            className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-zinc-900/60 hover:bg-slate-100 dark:hover:bg-zinc-800/80 border border-slate-200/60 dark:border-white/5 transition-all cursor-pointer flex items-center justify-between gap-2.5 group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0">
                                <UserCheck className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <h5 className="font-heading text-xs font-bold text-slate-900 dark:text-white truncate">
                                  {sub.full_name}
                                </h5>
                                <span className="text-[9.5px] text-slate-500 dark:text-slate-400 font-mono">
                                  {sub.plan_type}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="px-2 py-0.5 rounded-md text-[8.5px] font-black uppercase bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                {sub.daysRemaining === 0
                                  ? 'Today'
                                  : `${sub.daysRemaining}d left`}
                              </span>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dismissAlert('member', sub.id);
                                }}
                                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                title="Dismiss alert"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* FOOTER */}
            <div className="p-3 border-t border-slate-100 dark:border-white/5 bg-slate-50/80 dark:bg-zinc-900/80 flex items-center justify-between text-[10px] font-heading shrink-0">
              {browserPermission !== 'granted' ? (
                <button
                  type="button"
                  onClick={requestBrowserPermission}
                  className="text-blue-600 dark:text-red-400 font-bold uppercase tracking-wider flex items-center gap-1.5 hover:underline cursor-pointer"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  <span>Enable Push</span>
                </button>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Check className="w-3 h-3 stroke-3" />
                  <span>Push Enabled</span>
                </span>
              )}

              <button
                type="button"
                onClick={() => handleNavigate(isAdmin ? '/reports' : '/sales')}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>Dashboard</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default NotificationPopover;

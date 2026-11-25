// src/stores/useNotificationStore.ts
import { create } from 'zustand';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase } from '../lib/supabase/client';
import { isCapacitorApp } from '../lib/platform';
import { useAuthStore } from './authStore';
import { isSuperAdmin } from '../constants/auth';

import { App as CapApp } from '@capacitor/app';

const SEEN_NOTIF_IDS_KEY = 'palomar_seen_notification_ids';
const DISPATCHED_NOTIF_IDS_KEY = 'palomar_dispatched_notification_ids';
const LAST_OS_NOTIF_AT_KEY = 'palomar_last_os_notification_at';
const DISMISSED_STOCK_KEY = 'palomar_dismissed_stock_alerts';
const DISMISSED_MEMBER_KEY = 'palomar_dismissed_member_alerts';
const DISMISSED_RECYCLE_KEY = 'palomar_dismissed_recycle_alerts';
const OS_NOTIFICATION_COOLDOWN_MS = 60_000;
const MAX_STORED_IDS = 400;

interface PendingOsAlert {
  key: string;
  title: string;
  body: string;
  tag: string;
}

// Module-level singleton guards to prevent duplicate subscriptions, parallel fetches, and notification bursts
let activeSubCount = 0;
let activeSubKey = '';
let activeRealtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let activeRealtimeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let inFlightFetchPromise: Promise<void> | null = null;
let queuedRefetchArgs: {
  email?: string | null;
  role?: string | null;
  isRealtimeEvent: boolean;
} | null = null;
let lastOsNotificationAtMem = 0;
let isCapacitorForeground = true;
let visibilityListenersBound = false;
const activeBrowserNotifications = new Set<Notification>();

const closeActiveBrowserNotifications = () => {
  activeBrowserNotifications.forEach((notif) => {
    try {
      notif.close();
    } catch {}
  });
  activeBrowserNotifications.clear();
};

const isActivelyViewingSystem = (): boolean => {
  if (isCapacitorApp()) {
    return isCapacitorForeground;
  }
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
};

const ensureVisibilityListeners = () => {
  if (visibilityListenersBound || typeof document === 'undefined') return;
  visibilityListenersBound = true;

  const handleReturnToSystem = () => {
    if (isActivelyViewingSystem()) {
      closeActiveBrowserNotifications();
    }
  };

  document.addEventListener('visibilitychange', handleReturnToSystem);
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleReturnToSystem);
  }

  if (isCapacitorApp()) {
    CapApp.addListener('appStateChange', ({ isActive }) => {
      isCapacitorForeground = Boolean(isActive);
      if (isActive) {
        closeActiveBrowserNotifications();
      }
    }).catch(() => {});
  }
};

// Deterministic 31-bit integer ID for Capacitor local notifications so alerts replace rather than stack
const hashToNotificationId = (tag: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < tag.length; i++) {
    hash ^= tag.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.max(1000, Math.abs(hash % 2147483000));
};

// Helper functions for localStorage persisted IDs
const getStoredIds = (key: string): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveStoredIds = (key: string, ids: string[]) => {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = ids.length > MAX_STORED_IDS ? ids.slice(-MAX_STORED_IDS) : ids;
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch (err) {
    console.warn('Failed to persist notification state:', err);
  }
};

const getLastOsNotifAt = (): number => {
  if (typeof window === 'undefined') return lastOsNotificationAtMem;
  try {
    const stored = Number(localStorage.getItem(LAST_OS_NOTIF_AT_KEY) || '0');
    return Math.max(lastOsNotificationAtMem, Number.isFinite(stored) ? stored : 0);
  } catch {
    return lastOsNotificationAtMem;
  }
};

const markOsNotifSentNow = () => {
  const now = Date.now();
  lastOsNotificationAtMem = now;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LAST_OS_NOTIF_AT_KEY, String(now));
    } catch {}
  }
};

// Push native browser notification or Capacitor local notification ONLY when user is NOT actively viewing the system
const triggerBrowserNotification = async (
  title: string,
  options?: NotificationOptions
) => {
  if (isActivelyViewingSystem()) {
    closeActiveBrowserNotifications();
    return;
  }

  const tag = options?.tag || 'wolf-gym-alert';

  if (isCapacitorApp()) {
    try {
      const { display } = await LocalNotifications.checkPermissions();
      if (display === 'granted' && !isActivelyViewingSystem()) {
        try {
          await LocalNotifications.createChannel({
            id: 'wolf_notifications',
            name: 'Gym Notifications',
            importance: 4,
            visibility: 1,
            vibration: true,
          });
        } catch {
          // ignore channel creation error if already exists or unsupported
        }

        await LocalNotifications.schedule({
          notifications: [
            {
              title,
              body: options?.body || '',
              id: hashToNotificationId(tag),
              channelId: 'wolf_notifications',
              schedule: { at: new Date(Date.now() + 100) },
            },
          ],
        });
      }
    } catch (e) {
      console.warn('Could not spawn capacitor local notification:', e);
    }
    return;
  }

  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted' &&
    !isActivelyViewingSystem()
  ) {
    try {
      closeActiveBrowserNotifications();
      const notif = new Notification(title, {
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag,
        renotify: false,
        ...options,
      } as NotificationOptions);
      activeBrowserNotifications.add(notif);
      notif.onclose = () => {
        activeBrowserNotifications.delete(notif);
      };
      notif.onclick = () => {
        try {
          window.focus();
          notif.close();
        } catch {}
        activeBrowserNotifications.delete(notif);
      };
    } catch (e) {
      console.warn('Could not spawn browser notification:', e);
    }
  }
};

export interface PendingCashApproval {
  id: string;
  type: 'cash_in' | 'cash_out' | 'digital_in';
  amount: number;
  reason: string;
  performed_by_name: string;
  created_at: string;
  session_id: string;
}

export interface UnreadIncident {
  id: string;
  title: string;
  priority: 'Low' | 'Medium' | 'High';
  created_at: string;
  staff_name: string;
}

export interface StockAlertProduct {
  id: string;
  product_name: string;
  stock_quantity: number;
  low_stock_alert: number | null;
  isOutOfStock: boolean;
  isLowStock: boolean;
}

export interface ExpiringMemberSub {
  id: string;
  member_id: string;
  full_name: string;
  plan_type: string;
  end_date: string;
  daysRemaining: number;
}

export interface RecycleBinAlertItem {
  id: string;
  source: 'sales' | 'logbook';
  title: string;
  subtitle: string;
  amount: number;
  deleted_at: string;
}

interface NotificationState {
  incidentUnreadCount: number;
  stockAlertsCount: number;
  noStockCount: number;
  lowStockCount: number;
  expiringSubsCount: number;
  pendingCashApprovalsCount: number;
  salesRecycleBinCount: number;
  logbookRecycleBinCount: number;
  unreadBadgeCount: number;

  pendingCashApprovals: PendingCashApproval[];
  unreadIncidents: UnreadIncident[];
  stockAlertProducts: StockAlertProduct[];
  expiringMembers: ExpiringMemberSub[];
  recycleBinSales: RecycleBinAlertItem[];
  recycleBinLogbook: RecycleBinAlertItem[];

  browserPermission: NotificationPermission;
  isNotificationOpen: boolean;
  setNotificationOpen: (open: boolean) => void;
  toggleNotificationOpen: () => void;
  markBadgeSeen: () => void;

  checkBrowserPermission: () => Promise<NotificationPermission>;
  requestBrowserPermission: () => Promise<NotificationPermission>;
  fetchNotifications: (
    userEmail?: string | null,
    userRole?: string | null,
    isRealtimeEvent?: boolean
  ) => Promise<void>;
  approveCashApproval: (
    id: string,
    actorId?: string,
    actorName?: string
  ) => Promise<void>;
  rejectCashApproval: (id: string, reason?: string) => Promise<void>;
  markIncidentRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismissAlert: (
    type: 'cash' | 'incident' | 'stock' | 'member' | 'recycle',
    id: string
  ) => void;
  subscribeRealtime: (
    userEmail?: string | null,
    userRole?: string | null
  ) => () => void;
}

export const formatBadgeCount = (count: number): string => {
  if (count <= 0) return '0';
  if (count > 9) return '9+';
  return String(count);
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
  incidentUnreadCount: 0,
  stockAlertsCount: 0,
  noStockCount: 0,
  lowStockCount: 0,
  expiringSubsCount: 0,
  pendingCashApprovalsCount: 0,
  salesRecycleBinCount: 0,
  logbookRecycleBinCount: 0,
  unreadBadgeCount: 0,

  pendingCashApprovals: [],
  unreadIncidents: [],
  stockAlertProducts: [],
  expiringMembers: [],
  recycleBinSales: [],
  recycleBinLogbook: [],

  browserPermission:
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'default',
  isNotificationOpen: false,

  setNotificationOpen: (open) => set({ isNotificationOpen: open }),
  toggleNotificationOpen: () =>
    set((state) => ({ isNotificationOpen: !state.isNotificationOpen })),

  markBadgeSeen: () => {
    const state = get();
    // Gather all active notification unique IDs
    const activeIds = [
      ...state.pendingCashApprovals.map((a) => `cash_approval_${a.id}`),
      ...state.unreadIncidents.map((i) => `incident_${i.id}`),
      ...state.stockAlertProducts.map((p) => `stock_${p.id}`),
      ...state.expiringMembers.map((m) => `member_${m.id}`),
      ...state.recycleBinSales.map((r) => `recycle_sale_${r.id}`),
      ...state.recycleBinLogbook.map((r) => `recycle_logbook_${r.id}`),
    ];

    const seenSet = new Set(getStoredIds(SEEN_NOTIF_IDS_KEY));
    const dispatchedSet = new Set(getStoredIds(DISPATCHED_NOTIF_IDS_KEY));
    activeIds.forEach((id) => {
      seenSet.add(id);
      dispatchedSet.add(id);
    });
    saveStoredIds(SEEN_NOTIF_IDS_KEY, Array.from(seenSet));
    saveStoredIds(DISPATCHED_NOTIF_IDS_KEY, Array.from(dispatchedSet));
    closeActiveBrowserNotifications();

    set({ unreadBadgeCount: 0 });
  },

  checkBrowserPermission: async () => {
    if (isCapacitorApp()) {
      try {
        const { display } = await LocalNotifications.checkPermissions();
        const permission: NotificationPermission =
          display === 'granted'
            ? 'granted'
            : display === 'denied'
              ? 'denied'
              : 'default';
        set({ browserPermission: permission });
        return permission;
      } catch (err) {
        console.warn('Error checking capacitor notification permission:', err);
        return 'default';
      }
    }

    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = Notification.permission;
      set({ browserPermission: permission });
      return permission;
    }

    return 'denied';
  },

  requestBrowserPermission: async () => {
    if (isCapacitorApp()) {
      try {
        const result = await LocalNotifications.requestPermissions();
        const permission: NotificationPermission =
          result.display === 'granted'
            ? 'granted'
            : result.display === 'denied'
              ? 'denied'
              : 'default';
        set({ browserPermission: permission });
        return permission;
      } catch (err) {
        console.warn('Error requesting capacitor notification permission:', err);
        return 'denied';
      }
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    try {
      const permission = await Notification.requestPermission();
      set({ browserPermission: permission });
      return permission;
    } catch (err) {
      console.warn('Error requesting notification permission:', err);
      return 'denied';
    }
  },

  fetchNotifications: async (
    _userEmail?: string | null,
    _userRole?: string | null,
    _isRealtimeEvent = false
  ) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    if (inFlightFetchPromise) {
      queuedRefetchArgs = {
        email: _userEmail,
        role: _userRole,
        isRealtimeEvent: _isRealtimeEvent,
      };
      return inFlightFetchPromise;
    }

    const runFetch = async () => {
      const authState = useAuthStore.getState();
      const effectiveEmail = _userEmail ?? authState.user?.email;
      const effectiveRole = String(
        _userRole ??
          authState.profile?.role ??
          authState.user?.app_metadata?.role ??
          ''
      )
        .toLowerCase()
        .trim();
      const isAdminUser =
        isSuperAdmin(effectiveEmail) ||
        effectiveRole === 'admin' ||
        effectiveRole === 'superadmin';

      const dismissedStockIds = new Set(getStoredIds(DISMISSED_STOCK_KEY));
      const dismissedMemberIds = new Set(getStoredIds(DISMISSED_MEMBER_KEY));
      const dismissedRecycleIds = new Set(getStoredIds(DISMISSED_RECYCLE_KEY));
      const seenIdsSet = new Set(getStoredIds(SEEN_NOTIF_IDS_KEY));
      const dispatchedIdsSet = new Set(getStoredIds(DISPATCHED_NOTIF_IDS_KEY));
      const pendingOsAlerts: PendingOsAlert[] = [];

      // 1. INCIDENT REPORTS
      let incidentCount = 0;
      let unreadList: UnreadIncident[] = [];

      try {
        const { data, error } = await supabase
          .from('incident_reports')
          .select(
            'id, title, priority, created_at, staff_name, status, is_archived'
          )
          .eq('status', 'Unread')
          .eq('is_archived', false)
          .order('created_at', { ascending: false });

        if (!error && data) {
          incidentCount = data.length;
          unreadList = data.map((d) => ({
            id: d.id,
            title: d.title,
            priority: d.priority,
            created_at: d.created_at,
            staff_name: d.staff_name || 'Staff',
          }));

          unreadList.forEach((inc) => {
            const key = `incident_${inc.id}`;
            if (!seenIdsSet.has(key) && !dispatchedIdsSet.has(key)) {
              pendingOsAlerts.push({
                key,
                title: `Incident: ${inc.title}`,
                body: `Priority: ${inc.priority} • Reported by ${inc.staff_name}`,
                tag: 'wolf-gym-alert',
              });
              dispatchedIdsSet.add(key);
            }
          });
        }
      } catch (err) {
        console.warn('Failed to load incident reports for notification:', err);
      }

    // 2. PRODUCT STOCK ALERTS
    let noStock = 0;
    let lowStock = 0;
    let stockAlertList: StockAlertProduct[] = [];

    try {
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select(
          'id, product_name, stock_quantity, low_stock_alert, has_stock_limit, status'
        )
        .is('deleted_at', null)
        .eq('status', 'Active');

      if (!prodErr && prodData) {
        prodData.forEach((p) => {
          if (!p.has_stock_limit || (p.status && p.status !== 'Active')) return;
          const isOut = p.stock_quantity <= 0;
          const isLow =
            !isOut &&
            p.low_stock_alert !== null &&
            p.stock_quantity <= p.low_stock_alert;

          if ((isOut || isLow) && !dismissedStockIds.has(p.id)) {
            if (isOut) noStock++;
            if (isLow) lowStock++;

            stockAlertList.push({
              id: p.id,
              product_name: p.product_name,
              stock_quantity: p.stock_quantity,
              low_stock_alert: p.low_stock_alert,
              isOutOfStock: isOut,
              isLowStock: isLow,
            });

            const key = `stock_${p.id}`;
            if (!seenIdsSet.has(key) && !dispatchedIdsSet.has(key)) {
              pendingOsAlerts.push({
                key,
                title: isOut
                  ? `Out of Stock: ${p.product_name}`
                  : `Low Stock: ${p.product_name}`,
                body: isOut
                  ? 'This item has run out of stock and requires restocking.'
                  : `Only ${p.stock_quantity} left in stock (Alert threshold: ${p.low_stock_alert}).`,
                tag: 'wolf-gym-alert',
              });
              dispatchedIdsSet.add(key);
            }
          }
        });
      }
    } catch (err) {
      console.warn('Failed to load product stock for notification:', err);
    }

    // 3. EXPIRING SUBSCRIPTIONS
    let expiringCount = 0;
    let expiringList: ExpiringMemberSub[] = [];

    try {
      const now = Date.now();
      const [subsRes, membersRes] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('id, member_id, plan_type, status, start_date, end_date')
          .neq('status', 'Voided'),
        supabase
          .from('members')
          .select('id, member_id, full_name')
          .is('deleted_at', null),
      ]);

      if (!subsRes.error && subsRes.data) {
        const memberMap = new Map<string, string>();
        if (membersRes.data) {
          membersRes.data.forEach((m) => {
            if (m.member_id) memberMap.set(m.member_id, m.full_name);
            if (m.id) memberMap.set(m.id, m.full_name);
          });
        }

        subsRes.data.forEach((s) => {
          const startMs = new Date(s.start_date).getTime();
          const endMs = new Date(s.end_date).getTime();
          if (
            !isNaN(startMs) &&
            !isNaN(endMs) &&
            startMs <= now &&
            endMs >= now
          ) {
            const diffDays = Math.ceil((endMs - now) / (1000 * 60 * 60 * 24));
            if (
              diffDays >= 0 &&
              diffDays <= 7 &&
              !dismissedMemberIds.has(s.id) &&
              !dismissedMemberIds.has(s.member_id)
            ) {
              expiringCount++;
              const fullName =
                memberMap.get(s.member_id) || `Member #${s.member_id}`;
              const planName =
                s.plan_type === 'yearly'
                  ? 'Yearly Membership'
                  : 'Monthly Membership';

              expiringList.push({
                id: s.id,
                member_id: s.member_id,
                full_name: fullName,
                plan_type: planName,
                end_date: s.end_date,
                daysRemaining: diffDays,
              });

              const key = `member_${s.id}`;
              if (!seenIdsSet.has(key) && !dispatchedIdsSet.has(key)) {
                pendingOsAlerts.push({
                  key,
                  title: `Subscription Expiring: ${fullName}`,
                  body: `${planName} expires in ${diffDays} day(s). Action required.`,
                  tag: 'wolf-gym-alert',
                });
                dispatchedIdsSet.add(key);
              }
            }
          }
        });
      }
    } catch (err) {
      console.warn('Failed to load expiring subscriptions:', err);
    }

    // 4. PENDING CASH IN, DIGITAL IN & OUT APPROVALS (Admins Only)
    let pendingApprovals = 0;
    let pendingApprovalsList: PendingCashApproval[] = [];

    if (isAdminUser) {
      try {
        const { data: openSession } = await supabase
          .from('cash_sessions')
          .select('id')
          .eq('status', 'open')
          .is('closed_at', null)
          .order('opened_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (openSession?.id) {
          const { data: pendingTxs, error: pendingErr } = await supabase
            .from('cash_transactions')
            .select('id, type, amount, performed_by_name, reason, created_at, session_id')
            .eq('session_id', openSession.id)
            .eq('status', 'pending')
            .eq('is_voided', false)
            .order('created_at', { ascending: false });

          if (!pendingErr && pendingTxs) {
            pendingApprovals = pendingTxs.length;
            pendingApprovalsList = pendingTxs.map((t: any) => ({
              id: String(t.id),
              type:
                t.type === 'cash_out'
                  ? 'cash_out'
                  : t.type === 'digital_in'
                    ? 'digital_in'
                    : 'cash_in',
              amount: Number(t.amount || 0),
              reason:
                t.reason ||
                (t.type === 'cash_out'
                  ? 'Cash Outflow'
                  : t.type === 'digital_in'
                    ? 'Digital Cash In'
                    : 'Cash Inflow'),
              performed_by_name: t.performed_by_name || 'Staff',
              created_at: t.created_at || new Date().toISOString(),
              session_id: t.session_id || openSession.id,
            }));

            pendingApprovalsList.forEach((tx) => {
              const key = `cash_approval_${tx.id}`;
              if (!seenIdsSet.has(key) && !dispatchedIdsSet.has(key)) {
                const label =
                  tx.type === 'cash_out'
                    ? 'Cash Out'
                    : tx.type === 'digital_in'
                      ? 'Digital In'
                      : 'Cash In';
                pendingOsAlerts.push({
                  key,
                  title: `${label} Request: ₱${tx.amount.toFixed(2)}`,
                  body: `Requested by ${tx.performed_by_name}: ${tx.reason}`,
                  tag: 'wolf-gym-alert',
                });
                dispatchedIdsSet.add(key);
              }
            });
          }

          // Auto-cleanup: Dismiss orphaned pending transactions left from older closed sessions
          try {
            await supabase
              .from('cash_transactions')
              .update({
                status: 'rejected',
                rejection_reason: 'Session closed before request was resolved',
              })
              .neq('session_id', openSession.id)
              .eq('status', 'pending');
          } catch {}
        } else {
          // When drawer is closed, no pending cash movements can be active
          try {
            await supabase
              .from('cash_transactions')
              .update({
                status: 'rejected',
                rejection_reason: 'Session closed before request was resolved',
              })
              .eq('status', 'pending');
          } catch {}
        }
      } catch (err) {
        console.warn('Failed to load pending cash approvals:', err);
      }
    }

    // 5. RECYCLE BIN ITEMS (Sales & Logbooks - Admins Only)
    let recycleSalesList: RecycleBinAlertItem[] = [];
    let recycleLogbookList: RecycleBinAlertItem[] = [];
    let totalSalesRecycleCount = 0;
    let totalLogbookRecycleCount = 0;

    if (isAdminUser) {
      const currentUserId = useAuthStore.getState().user?.id
        ? String(useAuthStore.getState().user?.id)
        : null;

      try {
        const [delSalesRes, delAttRes] = await Promise.all([
          supabase
            .from('sales')
            .select(
              'id, product_name, items, total_amount, payment_method, deleted_at, deleted_by, receipt_no'
            )
            .not('deleted_at', 'is', null)
            .order('deleted_at', { ascending: false })
            .limit(25),
          supabase
            .from('attendance')
            .select(
              'id, customer_name, customer_type, plan_name, entry_fee, payment_method, deleted_at, deleted_by'
            )
            .not('deleted_at', 'is', null)
            .neq('customer_type', 'New Membership')
            .order('deleted_at', { ascending: false })
            .limit(25),
        ]);

        if (!delSalesRes.error && delSalesRes.data) {
          totalSalesRecycleCount = delSalesRes.data.length;
          recycleSalesList = delSalesRes.data
            .filter(
              (s: any) =>
                !dismissedRecycleIds.has(`sale_${s.id}`) &&
                !(currentUserId && s.deleted_by && String(s.deleted_by) === currentUserId)
            )
            .map((s: any) => {
              const itemLabel =
                Array.isArray(s.items) && s.items.length > 0
                  ? (s.items[0].productName ||
                      s.items[0].product_name ||
                      'Sale Item') +
                    (s.items.length > 1 ? ` +${s.items.length - 1}` : '')
                  : s.product_name || 'Sales Transaction';
              const item: RecycleBinAlertItem = {
                id: String(s.id),
                source: 'sales',
                title: itemLabel,
                subtitle: `${s.payment_method || 'Cash'} • ${s.receipt_no ? `#${String(s.receipt_no).slice(-6)}` : 'Deleted Sale'}`,
                amount: Number(s.total_amount || 0),
                deleted_at: s.deleted_at,
              };
              const key = `recycle_sale_${item.id}`;
              if (!seenIdsSet.has(key) && !dispatchedIdsSet.has(key)) {
                pendingOsAlerts.push({
                  key,
                  title: 'Sale Moved to Recycle Bin',
                  body: `${item.title} (₱${item.amount.toFixed(2)}) is awaiting review in Sales Recycle Bin.`,
                  tag: 'wolf-gym-alert',
                });
                dispatchedIdsSet.add(key);
              }
              return item;
            });
        }

        if (!delAttRes.error && delAttRes.data) {
          totalLogbookRecycleCount = delAttRes.data.length;
          recycleLogbookList = delAttRes.data
            .filter(
              (a: any) =>
                !dismissedRecycleIds.has(`logbook_${a.id}`) &&
                !(currentUserId && a.deleted_by && String(a.deleted_by) === currentUserId)
            )
            .map((a: any) => {
              const item: RecycleBinAlertItem = {
                id: String(a.id),
                source: 'logbook',
                title: a.customer_name || 'Guest',
                subtitle: `${a.plan_name || a.customer_type || 'Check-In'} • ${a.payment_method || 'Cash'}`,
                amount: Number(a.entry_fee || 0),
                deleted_at: a.deleted_at,
              };
              const key = `recycle_logbook_${item.id}`;
              if (!seenIdsSet.has(key) && !dispatchedIdsSet.has(key)) {
                pendingOsAlerts.push({
                  key,
                  title: 'Logbook Entry in Recycle Bin',
                  body: `${item.title} (${item.subtitle}) is in Logbook Recycle Bin.`,
                  tag: 'wolf-gym-alert',
                });
                dispatchedIdsSet.add(key);
              }
              return item;
            });
        }
      } catch (err) {
        console.warn('Failed to load recycle bin notifications:', err);
      }
    }

    // Persist dispatched IDs immediately so neither reload nor returning from background re-fires them.
    // OS/browser notifications ONLY fire on live realtime events while the user is NOT actively viewing this system.
    if (pendingOsAlerts.length > 0) {
      const latestStoredDispatched = new Set(getStoredIds(DISPATCHED_NOTIF_IDS_KEY));
      const freshAlerts = pendingOsAlerts.filter(
        (alert) => !latestStoredDispatched.has(alert.key)
      );

      pendingOsAlerts.forEach((alert) => latestStoredDispatched.add(alert.key));
      saveStoredIds(DISPATCHED_NOTIF_IDS_KEY, Array.from(latestStoredDispatched));

      if (isActivelyViewingSystem()) {
        closeActiveBrowserNotifications();
      } else if (
        _isRealtimeEvent &&
        freshAlerts.length > 0 &&
        Date.now() - getLastOsNotifAt() >= OS_NOTIFICATION_COOLDOWN_MS
      ) {
        markOsNotifSentNow();
        if (freshAlerts.length === 1) {
          await triggerBrowserNotification(freshAlerts[0].title, {
            body: freshAlerts[0].body,
            tag: freshAlerts[0].tag,
          });
        } else {
          await triggerBrowserNotification(
            `${freshAlerts.length} New Gym Alerts`,
            {
              body: `${freshAlerts[0].title} (+${freshAlerts.length - 1} more). Open the notifications panel to review.`,
              tag: 'wolf-gym-alert',
            }
          );
        }
      }
    }

    // Compute unseen count using individual item keys
    const allCurrentItemKeys = [
      ...pendingApprovalsList.map((a) => `cash_approval_${a.id}`),
      ...unreadList.map((i) => `incident_${i.id}`),
      ...stockAlertList.map((p) => `stock_${p.id}`),
      ...expiringList.map((m) => `member_${m.id}`),
      ...recycleSalesList.map((r) => `recycle_sale_${r.id}`),
      ...recycleLogbookList.map((r) => `recycle_logbook_${r.id}`),
    ];

    const unreadBadge = allCurrentItemKeys.filter(
      (key) => !seenIdsSet.has(key)
    ).length;

    set({
      incidentUnreadCount: incidentCount,
      stockAlertsCount: noStock + lowStock,
      noStockCount: noStock,
      lowStockCount: lowStock,
      expiringSubsCount: expiringCount,
      pendingCashApprovalsCount: pendingApprovals,
      salesRecycleBinCount: totalSalesRecycleCount,
      logbookRecycleBinCount: totalLogbookRecycleCount,
      pendingCashApprovals: pendingApprovalsList,
      unreadIncidents: unreadList,
      stockAlertProducts: stockAlertList,
      expiringMembers: expiringList,
      recycleBinSales: recycleSalesList,
      recycleBinLogbook: recycleLogbookList,
      unreadBadgeCount: unreadBadge,
    });
    };

    inFlightFetchPromise = runFetch().finally(() => {
      inFlightFetchPromise = null;
      const queued = queuedRefetchArgs;
      queuedRefetchArgs = null;
      if (queued) {
        void get().fetchNotifications(
          queued.email,
          queued.role,
          queued.isRealtimeEvent
        );
      }
    });

    return inFlightFetchPromise;
  },

  approveCashApproval: async (id: string, actorId?: string, actorName?: string) => {
    try {
      const { error } = await supabase.rpc('approve_cash_transaction', {
        p_transaction_id: id,
        p_admin_id: actorId || null,
        p_admin_name: actorName || 'Admin',
      });

      if (!error) {
        set((state) => {
          const filtered = state.pendingCashApprovals.filter((a) => a.id !== id);
          const seenSet = new Set(getStoredIds(SEEN_NOTIF_IDS_KEY));
          seenSet.add(`cash_approval_${id}`);
          saveStoredIds(SEEN_NOTIF_IDS_KEY, Array.from(seenSet));

          return {
            pendingCashApprovals: filtered,
            pendingCashApprovalsCount: filtered.length,
            unreadBadgeCount: Math.max(0, state.unreadBadgeCount - 1),
          };
        });
      }
    } catch (err) {
      console.warn('Failed to approve cash transaction:', err);
    }
  },

  rejectCashApproval: async (id: string, reason?: string) => {
    try {
      const authState = useAuthStore.getState();
      const actorName = authState.profile?.username || authState.user?.email || 'Admin';
      const { error } = await supabase.rpc('reject_cash_transaction', {
        p_transaction_id: id,
        p_admin_id: authState.user?.id || null,
        p_admin_name: actorName,
        p_reason: reason || 'Rejected by admin via notifications',
      });

      if (!error) {
        set((state) => {
          const filtered = state.pendingCashApprovals.filter((a) => a.id !== id);
          const seenSet = new Set(getStoredIds(SEEN_NOTIF_IDS_KEY));
          seenSet.add(`cash_approval_${id}`);
          saveStoredIds(SEEN_NOTIF_IDS_KEY, Array.from(seenSet));

          return {
            pendingCashApprovals: filtered,
            pendingCashApprovalsCount: filtered.length,
            unreadBadgeCount: Math.max(0, state.unreadBadgeCount - 1),
          };
        });
      }
    } catch (err) {
      console.warn('Failed to reject cash transaction:', err);
    }
  },

  markIncidentRead: async (id: string) => {
    const authState = useAuthStore.getState();
    const roleStr = String(authState.profile?.role || authState.user?.app_metadata?.role || '')
      .toLowerCase()
      .trim();
    const isAdminUser =
      isSuperAdmin(authState.user?.email) || roleStr === 'admin' || roleStr === 'superadmin';
    if (!isAdminUser) return;

    try {
      const { error } = await supabase
        .from('incident_reports')
        .update({
          status: 'Read',
          read_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (!error) {
        set((state) => {
          const filtered = state.unreadIncidents.filter((i) => i.id !== id);

          // Mark seen
          const seenSet = new Set(getStoredIds(SEEN_NOTIF_IDS_KEY));
          seenSet.add(`incident_${id}`);
          saveStoredIds(SEEN_NOTIF_IDS_KEY, Array.from(seenSet));

          return {
            unreadIncidents: filtered,
            incidentUnreadCount: filtered.length,
            unreadBadgeCount: Math.max(0, state.unreadBadgeCount - 1),
          };
        });
      }
    } catch (err) {
      console.warn('Failed to mark incident read:', err);
    }
  },

  markAllAsRead: async () => {
    try {
      const state = get();
      const authState = useAuthStore.getState();
      const roleStr = String(authState.profile?.role || authState.user?.app_metadata?.role || '')
        .toLowerCase()
        .trim();
      const isAdminUser =
        isSuperAdmin(authState.user?.email) || roleStr === 'admin' || roleStr === 'superadmin';

      // 1. Mark incidents as read in database (Admins only)
      const unreadIds = state.unreadIncidents.map((i) => i.id);
      if (isAdminUser && unreadIds.length > 0) {
        await supabase
          .from('incident_reports')
          .update({
            status: 'Read',
            read_at: new Date().toISOString(),
          })
          .in('id', unreadIds);
      }

      // 2. Persist dismissed stock, member, and recycle alert IDs
      const currentStockIds = state.stockAlertProducts.map((p) => p.id);
      const currentMemberIds = state.expiringMembers.map((m) => m.id);
      const currentRecycleKeys = [
        ...state.recycleBinSales.map((r) => `sale_${r.id}`),
        ...state.recycleBinLogbook.map((r) => `logbook_${r.id}`),
      ];

      const existingDismissedStock = getStoredIds(DISMISSED_STOCK_KEY);
      const existingDismissedMembers = getStoredIds(DISMISSED_MEMBER_KEY);
      const existingDismissedRecycle = getStoredIds(DISMISSED_RECYCLE_KEY);

      saveStoredIds(
        DISMISSED_STOCK_KEY,
        Array.from(new Set([...existingDismissedStock, ...currentStockIds]))
      );
      saveStoredIds(
        DISMISSED_MEMBER_KEY,
        Array.from(new Set([...existingDismissedMembers, ...currentMemberIds]))
      );
      saveStoredIds(
        DISMISSED_RECYCLE_KEY,
        Array.from(new Set([...existingDismissedRecycle, ...currentRecycleKeys]))
      );

      // 3. Mark all seen
      const seenSet = new Set(getStoredIds(SEEN_NOTIF_IDS_KEY));
      state.pendingCashApprovals.forEach((a) => seenSet.add(`cash_approval_${a.id}`));
      state.unreadIncidents.forEach((i) => seenSet.add(`incident_${i.id}`));
      state.stockAlertProducts.forEach((p) => seenSet.add(`stock_${p.id}`));
      state.expiringMembers.forEach((m) => seenSet.add(`member_${m.id}`));
      state.recycleBinSales.forEach((r) => seenSet.add(`recycle_sale_${r.id}`));
      state.recycleBinLogbook.forEach((r) => seenSet.add(`recycle_logbook_${r.id}`));
      saveStoredIds(SEEN_NOTIF_IDS_KEY, Array.from(seenSet));

      set({
        incidentUnreadCount: 0,
        unreadIncidents: [],
        stockAlertsCount: 0,
        noStockCount: 0,
        lowStockCount: 0,
        stockAlertProducts: [],
        expiringSubsCount: 0,
        expiringMembers: [],
        recycleBinSales: [],
        recycleBinLogbook: [],
        unreadBadgeCount: 0,
      });
    } catch (err) {
      console.warn('Failed to mark all as read:', err);
    }
  },

  dismissAlert: (type, id) => {
    set((state) => {
      let updatedState: Partial<NotificationState> = {};
      const seenSet = new Set(getStoredIds(SEEN_NOTIF_IDS_KEY));

      if (type === 'cash') {
        seenSet.add(`cash_approval_${id}`);
        const filtered = state.pendingCashApprovals.filter((a) => a.id !== id);
        updatedState = {
          pendingCashApprovals: filtered,
          pendingCashApprovalsCount: filtered.length,
        };
      } else if (type === 'incident') {
        seenSet.add(`incident_${id}`);
        const filtered = state.unreadIncidents.filter((i) => i.id !== id);
        updatedState = {
          unreadIncidents: filtered,
          incidentUnreadCount: filtered.length,
        };
      } else if (type === 'stock') {
        seenSet.add(`stock_${id}`);
        const existingDismissed = getStoredIds(DISMISSED_STOCK_KEY);
        saveStoredIds(
          DISMISSED_STOCK_KEY,
          Array.from(new Set([...existingDismissed, id]))
        );

        const filtered = state.stockAlertProducts.filter((p) => p.id !== id);
        const noStock = filtered.filter((p) => p.isOutOfStock).length;
        const lowStock = filtered.filter((p) => p.isLowStock).length;
        updatedState = {
          stockAlertProducts: filtered,
          stockAlertsCount: filtered.length,
          noStockCount: noStock,
          lowStockCount: lowStock,
        };
      } else if (type === 'member') {
        seenSet.add(`member_${id}`);
        const existingDismissed = getStoredIds(DISMISSED_MEMBER_KEY);
        saveStoredIds(
          DISMISSED_MEMBER_KEY,
          Array.from(new Set([...existingDismissed, id]))
        );

        const filtered = state.expiringMembers.filter(
          (m) => m.id !== id && m.member_id !== id
        );
        updatedState = {
          expiringMembers: filtered,
          expiringSubsCount: filtered.length,
        };
      } else if (type === 'recycle') {
        const existingDismissed = getStoredIds(DISMISSED_RECYCLE_KEY);
        saveStoredIds(
          DISMISSED_RECYCLE_KEY,
          Array.from(new Set([...existingDismissed, id]))
        );

        if (id.startsWith('sale_')) {
          const rawId = id.slice(5);
          seenSet.add(`recycle_sale_${rawId}`);
          const filtered = state.recycleBinSales.filter((r) => r.id !== rawId);
          updatedState = {
            recycleBinSales: filtered,
          };
        } else if (id.startsWith('logbook_')) {
          const rawId = id.slice(8);
          seenSet.add(`recycle_logbook_${rawId}`);
          const filtered = state.recycleBinLogbook.filter((r) => r.id !== rawId);
          updatedState = {
            recycleBinLogbook: filtered,
          };
        }
      }

      saveStoredIds(SEEN_NOTIF_IDS_KEY, Array.from(seenSet));
      updatedState.unreadBadgeCount = Math.max(0, state.unreadBadgeCount - 1);

      return updatedState as NotificationState;
    });
  },

  subscribeRealtime: (userEmail, userRole) => {
    const nextSubKey = `${userEmail || ''}|${userRole || ''}`;
    activeSubCount += 1;

    if (activeRealtimeChannel && activeSubKey !== nextSubKey) {
      if (activeRealtimeDebounceTimer) {
        clearTimeout(activeRealtimeDebounceTimer);
        activeRealtimeDebounceTimer = null;
      }
      supabase.removeChannel(activeRealtimeChannel);
      activeRealtimeChannel = null;
    }

    ensureVisibilityListeners();

    if (!activeRealtimeChannel) {
      activeSubKey = nextSubKey;
      get().checkBrowserPermission();
      get().fetchNotifications(userEmail, userRole, false);

      const triggerDebouncedFetch = () => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;
        if (activeRealtimeDebounceTimer) clearTimeout(activeRealtimeDebounceTimer);
        activeRealtimeDebounceTimer = setTimeout(() => {
          activeRealtimeDebounceTimer = null;
          get().fetchNotifications(userEmail, userRole, true);
        }, 1500);
      };

      const channelId = `notifications-singleton-${Math.random().toString(36).substring(2, 9)}`;
      const channel = supabase.channel(channelId);

      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'incident_reports' },
          triggerDebouncedFetch
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'products' },
          triggerDebouncedFetch
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'subscriptions' },
          triggerDebouncedFetch
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'members' },
          triggerDebouncedFetch
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'cash_transactions' },
          triggerDebouncedFetch
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'cash_sessions' },
          triggerDebouncedFetch
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sales' },
          triggerDebouncedFetch
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'attendance' },
          triggerDebouncedFetch
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            // Connected to real-time events
          }
        });

      activeRealtimeChannel = channel;
    }

    let cleanedUp = false;
    return () => {
      if (cleanedUp) return;
      cleanedUp = true;
      activeSubCount = Math.max(0, activeSubCount - 1);
      if (activeSubCount === 0) {
        if (activeRealtimeDebounceTimer) {
          clearTimeout(activeRealtimeDebounceTimer);
          activeRealtimeDebounceTimer = null;
        }
        if (activeRealtimeChannel) {
          supabase.removeChannel(activeRealtimeChannel);
          activeRealtimeChannel = null;
        }
        activeSubKey = '';
      }
    };
  },
}));
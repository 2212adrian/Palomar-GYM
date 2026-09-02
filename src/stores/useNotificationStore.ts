// src/stores/useNotificationStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import { isSuperAdmin } from '../constants/auth';

const SEEN_NOTIF_IDS_KEY = 'palomar_seen_notification_ids';
const DISMISSED_STOCK_KEY = 'palomar_dismissed_stock_alerts';
const DISMISSED_MEMBER_KEY = 'palomar_dismissed_member_alerts';

// Helper functions for localStorage persisted IDs
const getStoredIds = (key: string): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveStoredIds = (key: string, ids: string[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch (err) {
    console.warn('Failed to persist notification state:', err);
  }
};

// Push native browser notification if granted
const triggerBrowserNotification = (
  title: string,
  options?: NotificationOptions
) => {
  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    try {
      new Notification(title, {
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        ...options,
      });
    } catch (e) {
      console.warn('Could not spawn browser notification:', e);
    }
  }
};

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

interface NotificationState {
  incidentUnreadCount: number;
  stockAlertsCount: number;
  noStockCount: number;
  lowStockCount: number;
  expiringSubsCount: number;
  unreadBadgeCount: number;

  unreadIncidents: UnreadIncident[];
  stockAlertProducts: StockAlertProduct[];
  expiringMembers: ExpiringMemberSub[];

  browserPermission: NotificationPermission;
  isNotificationOpen: boolean;
  setNotificationOpen: (open: boolean) => void;
  toggleNotificationOpen: () => void;
  markBadgeSeen: () => void;

  requestBrowserPermission: () => Promise<NotificationPermission>;
  fetchNotifications: (
    userEmail?: string | null,
    userRole?: string | null,
    isRealtimeEvent?: boolean
  ) => Promise<void>;
  markIncidentRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismissAlert: (type: 'incident' | 'stock' | 'member', id: string) => void;
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
  unreadBadgeCount: 0,

  unreadIncidents: [],
  stockAlertProducts: [],
  expiringMembers: [],

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
      ...state.unreadIncidents.map((i) => `incident_${i.id}`),
      ...state.stockAlertProducts.map((p) => `stock_${p.id}`),
      ...state.expiringMembers.map((m) => `member_${m.id}`),
    ];

    const seenSet = new Set(getStoredIds(SEEN_NOTIF_IDS_KEY));
    activeIds.forEach((id) => seenSet.add(id));
    saveStoredIds(SEEN_NOTIF_IDS_KEY, Array.from(seenSet));

    set({ unreadBadgeCount: 0 });
  },

  requestBrowserPermission: async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    try {
      const permission = await Notification.requestPermission();
      set({ browserPermission: permission });
      if (permission === 'granted') {
        triggerBrowserNotification('Wolf Palomar Gym Notifications Enabled', {
          body: 'You will receive real-time notifications for incidents, inventory stock alerts, and expiring subscriptions.',
        });
      }
      return permission;
    } catch (err) {
      console.warn('Error requesting notification permission:', err);
      return 'denied';
    }
  },

  fetchNotifications: async (userEmail, userRole, isRealtimeEvent = false) => {
    const isAdmin =
      isSuperAdmin(userEmail) || userRole?.toLowerCase() === 'admin';
    const dismissedStockIds = new Set(getStoredIds(DISMISSED_STOCK_KEY));
    const dismissedMemberIds = new Set(getStoredIds(DISMISSED_MEMBER_KEY));
    const seenIdsSet = new Set(getStoredIds(SEEN_NOTIF_IDS_KEY));

    // 1. INCIDENT REPORTS
    let incidentCount = 0;
    let unreadList: UnreadIncident[] = [];

    if (isAdmin) {
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

          // Trigger native desktop alert for unseen incident if from realtime event
          if (isRealtimeEvent) {
            unreadList.forEach((inc) => {
              if (!seenIdsSet.has(`incident_${inc.id}`)) {
                triggerBrowserNotification(`🚨 Incident: ${inc.title}`, {
                  body: `Priority: ${inc.priority} • Reported by ${inc.staff_name}`,
                });
              }
            });
          }
        }
      } catch (err) {
        console.warn('Failed to load incident reports for notification:', err);
      }
    }

    // 2. PRODUCT STOCK ALERTS
    let noStock = 0;
    let lowStock = 0;
    let stockAlertList: StockAlertProduct[] = [];

    try {
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select(
          'id, product_name, stock_quantity, low_stock_alert, has_stock_limit'
        )
        .is('deleted_at', null);

      if (!prodErr && prodData) {
        prodData.forEach((p) => {
          if (!p.has_stock_limit) return;
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

            // Trigger desktop alert if new item
            if (isRealtimeEvent && !seenIdsSet.has(`stock_${p.id}`)) {
              triggerBrowserNotification(
                isOut
                  ? `⛔ Out of Stock: ${p.product_name}`
                  : `⚠️ Low Stock: ${p.product_name}`,
                {
                  body: isOut
                    ? 'This item has run out of stock and requires restocking.'
                    : `Only ${p.stock_quantity} left in stock (Alert threshold: ${p.low_stock_alert}).`,
                }
              );
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
            }
          }
        });
      }
    } catch (err) {
      console.warn('Failed to load expiring subscriptions:', err);
    }

    // Compute unseen count using individual item keys
    const allCurrentItemKeys = [
      ...unreadList.map((i) => `incident_${i.id}`),
      ...stockAlertList.map((p) => `stock_${p.id}`),
      ...expiringList.map((m) => `member_${m.id}`),
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
      unreadIncidents: unreadList,
      stockAlertProducts: stockAlertList,
      expiringMembers: expiringList,
      unreadBadgeCount: unreadBadge,
    });
  },

  markIncidentRead: async (id: string) => {
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

      // 1. Mark incidents as read in database
      const unreadIds = state.unreadIncidents.map((i) => i.id);
      if (unreadIds.length > 0) {
        await supabase
          .from('incident_reports')
          .update({
            status: 'Read',
            read_at: new Date().toISOString(),
          })
          .in('id', unreadIds);
      }

      // 2. Persist dismissed stock and member alert IDs
      const currentStockIds = state.stockAlertProducts.map((p) => p.id);
      const currentMemberIds = state.expiringMembers.map((m) => m.id);

      const existingDismissedStock = getStoredIds(DISMISSED_STOCK_KEY);
      const existingDismissedMembers = getStoredIds(DISMISSED_MEMBER_KEY);

      saveStoredIds(
        DISMISSED_STOCK_KEY,
        Array.from(new Set([...existingDismissedStock, ...currentStockIds]))
      );
      saveStoredIds(
        DISMISSED_MEMBER_KEY,
        Array.from(new Set([...existingDismissedMembers, ...currentMemberIds]))
      );

      // 3. Mark all seen
      const seenSet = new Set(getStoredIds(SEEN_NOTIF_IDS_KEY));
      state.unreadIncidents.forEach((i) => seenSet.add(`incident_${i.id}`));
      state.stockAlertProducts.forEach((p) => seenSet.add(`stock_${p.id}`));
      state.expiringMembers.forEach((m) => seenSet.add(`member_${m.id}`));
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

      if (type === 'incident') {
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
      }

      saveStoredIds(SEEN_NOTIF_IDS_KEY, Array.from(seenSet));
      updatedState.unreadBadgeCount = Math.max(0, state.unreadBadgeCount - 1);

      return updatedState as NotificationState;
    });
  },

  subscribeRealtime: (userEmail, userRole) => {
    // 1. Perform initial data fetch
    get().fetchNotifications(userEmail, userRole, false);

    // 2. Use a unique channel ID per subscription session to avoid channel collisions
    const channelId = `notifications-${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase.channel(channelId);

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incident_reports' },
        () => {
          get().fetchNotifications(userEmail, userRole, true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          get().fetchNotifications(userEmail, userRole, true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions' },
        () => {
          get().fetchNotifications(userEmail, userRole, true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members' },
        () => {
          get().fetchNotifications(userEmail, userRole, true);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Connected to real-time events
        }
      });

    // 3. Clean up on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  },
}));

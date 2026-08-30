// src/stores/useNotificationStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import { isSuperAdmin } from '../constants/auth';

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
  // Counts
  incidentUnreadCount: number;
  stockAlertsCount: number;
  noStockCount: number;
  lowStockCount: number;
  expiringSubsCount: number;

  // Detailed lists for notification popover
  unreadIncidents: UnreadIncident[];
  stockAlertProducts: StockAlertProduct[];
  expiringMembers: ExpiringMemberSub[];

  // Browser push notification state
  browserPermission: NotificationPermission;
  isNotificationOpen: boolean;
  setNotificationOpen: (open: boolean) => void;
  toggleNotificationOpen: () => void;

  // Actions
  requestBrowserPermission: () => Promise<NotificationPermission>;
  fetchNotifications: (userEmail?: string | null, userRole?: string | null) => Promise<void>;
  markIncidentRead: (id: string) => Promise<void>;
  subscribeRealtime: (userEmail?: string | null, userRole?: string | null) => () => void;
}

/**
 * Format badge count: caps at 9+
 */
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

  unreadIncidents: [],
  stockAlertProducts: [],
  expiringMembers: [],

  browserPermission: typeof window !== 'undefined' && 'Notification' in window 
    ? Notification.permission 
    : 'default',
  isNotificationOpen: false,

  setNotificationOpen: (open) => set({ isNotificationOpen: open }),
  toggleNotificationOpen: () => set((state) => ({ isNotificationOpen: !state.isNotificationOpen })),

  requestBrowserPermission: async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    try {
      const permission = await Notification.requestPermission();
      set({ browserPermission: permission });
      if (permission === 'granted') {
        new Notification('Wolf Palomar Notifications Enabled', {
          body: 'You will receive real-time alerts for incidents, stock shortages, and membership expiries.',
          icon: '/favicon.svg'
        });
      }
      return permission;
    } catch (err) {
      console.warn('Error requesting notification permission:', err);
      return 'denied';
    }
  },

  fetchNotifications: async (userEmail, userRole) => {
    const isAdmin = isSuperAdmin(userEmail) || userRole?.toLowerCase() === 'admin';

    // 1. INCIDENT REPORTS: only for Admin / Superadmin
    let incidentCount = 0;
    let unreadList: UnreadIncident[] = [];

    if (isAdmin) {
      try {
        const { data, error } = await supabase
          .from('incident_reports')
          .select('id, title, priority, created_at, staff_name, status, is_archived')
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
            staff_name: d.staff_name || 'Staff'
          }));
        }
      } catch (err) {
        console.warn('Failed to load incident reports for notification:', err);
      }
    }

    // 2. PRODUCT STOCK: No stock (red) & Low stock (yellow)
    let noStock = 0;
    let lowStock = 0;
    let stockAlertList: StockAlertProduct[] = [];

    try {
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select('id, product_name, stock_quantity, low_stock_alert, has_stock_limit')
        .is('deleted_at', null);

      if (!prodErr && prodData) {
        prodData.forEach((p) => {
          if (!p.has_stock_limit) return;
          const isOut = p.stock_quantity <= 0;
          const isLow = !isOut && p.low_stock_alert !== null && p.stock_quantity <= p.low_stock_alert;

          if (isOut) {
            noStock++;
            stockAlertList.push({
              id: p.id,
              product_name: p.product_name,
              stock_quantity: p.stock_quantity,
              low_stock_alert: p.low_stock_alert,
              isOutOfStock: true,
              isLowStock: false
            });
          } else if (isLow) {
            lowStock++;
            stockAlertList.push({
              id: p.id,
              product_name: p.product_name,
              stock_quantity: p.stock_quantity,
              low_stock_alert: p.low_stock_alert,
              isOutOfStock: false,
              isLowStock: true
            });
          }
        });
      }
    } catch (err) {
      console.warn('Failed to load product stock for notification:', err);
    }

    // 3. EXPIRING SUBSCRIPTIONS (< 7 Days)
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
          .is('deleted_at', null)
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
          if (!isNaN(startMs) && !isNaN(endMs) && startMs <= now && endMs >= now) {
            const diffDays = Math.ceil((endMs - now) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays <= 7) {
              expiringCount++;
              expiringList.push({
                id: s.id,
                member_id: s.member_id,
                full_name: memberMap.get(s.member_id) || `Member #${s.member_id}`,
                plan_type: s.plan_type === 'yearly' ? 'Yearly Membership' : 'Monthly Membership',
                end_date: s.end_date,
                daysRemaining: diffDays
              });
            }
          }
        });
      }
    } catch (err) {
      console.warn('Failed to load expiring subscriptions:', err);
    }

    set({
      incidentUnreadCount: incidentCount,
      stockAlertsCount: noStock + lowStock,
      noStockCount: noStock,
      lowStockCount: lowStock,
      expiringSubsCount: expiringCount,
      unreadIncidents: unreadList,
      stockAlertProducts: stockAlertList,
      expiringMembers: expiringList
    });
  },

  markIncidentRead: async (id: string) => {
    try {
      const { error } = await supabase
        .from('incident_reports')
        .update({
          status: 'Read',
          read_at: new Date().toISOString()
        })
        .eq('id', id);

      if (!error) {
        set((state) => {
          const filtered = state.unreadIncidents.filter((i) => i.id !== id);
          return {
            unreadIncidents: filtered,
            incidentUnreadCount: filtered.length
          };
        });
      }
    } catch (err) {
      console.warn('Failed to mark incident read:', err);
    }
  },

  subscribeRealtime: (userEmail, userRole) => {
    get().fetchNotifications(userEmail, userRole);

    const channel = supabase
      .channel('notification-store-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_reports' }, () => {
        get().fetchNotifications(userEmail, userRole);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        get().fetchNotifications(userEmail, userRole);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => {
        get().fetchNotifications(userEmail, userRole);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => {
        get().fetchNotifications(userEmail, userRole);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
}));

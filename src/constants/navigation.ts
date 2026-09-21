// src/constants/navigation.ts

export interface NavChildItem {
  name: string;
  path: string;
  roles?: ('admin' | 'staff')[];
  badge?: string;
  notificationKey?: 'stockAlerts' | 'expiringSubs';
  notificationColor?: 'red' | 'amber';
  description?: string;
}

export interface NavMenuItem {
  name: string;
  section?: string;
  iconType: 'wallet' | 'shoppingBag' | 'usersLogbook' | 'dashboard' | 'reports';
  roles?: ('admin' | 'staff')[];
  path?: string;
  notificationKey?: 'stockAlerts' | 'expiringSubs' | 'incidentUnread';
  children?: NavChildItem[];
}

export const SIDEBAR_NAV_STRUCTURE: NavMenuItem[] = [
  // 1. SESSION & DRAWER
  {
    name: 'CASH MANAGEMENT',
    section: 'SESSION & DRAWER',
    iconType: 'wallet',
    roles: ['admin', 'staff'],
    path: '/cash-management',
  },

  // 2. SOURCES OF INCOME
  {
    name: 'SALES',
    section: 'SOURCES OF INCOME',
    iconType: 'shoppingBag',
    roles: ['admin', 'staff'],
    notificationKey: 'stockAlerts',
    children: [
      {
        name: 'Register Sale',
        path: '/sales',
        description: 'Point of Registry Sales',
      },
      {
        name: 'Product List',
        path: '/sales/products',
        description: 'Product Inventory & Barcode generation',
        notificationKey: 'stockAlerts',
        notificationColor: 'amber',
        roles: ['admin'],
      },
    ],
  },
  {
    name: 'LOGBOOK & PLANS',
    iconType: 'usersLogbook',
    roles: ['admin', 'staff'],
    notificationKey: 'expiringSubs',
    children: [
      {
        name: 'Logbook',
        path: '/logbook',
        description: 'Instant gate/logbook telemetry',
      },
      {
        name: 'Member List',
        path: '/members/list',
        description: 'Accounts & profiles',
        notificationKey: 'expiringSubs',
        notificationColor: 'red',
        roles: ['admin'],
      },
      {
        name: 'Membership Plans',
        path: '/members/plans',
        description: 'Creates custom QR Code for hardware access cards',
      },
    ],
  },

  // 3. GYM OPERATIONS
  {
    name: 'DASHBOARD',
    section: 'GYM OPERATIONS',
    iconType: 'dashboard',
    roles: ['admin'],
    children: [
      {
        name: 'Revenue Summary',
        path: '/dashboard',
        description: 'Sales & Logbook real-time metrics',
      },
      {
        name: 'Revenue Goals',
        path: '/dashboard/goals',
        description: 'Set custom goal limits (Day, Week, Month)',
        badge: 'GOALS',
      },
    ],
  },
  {
    name: 'INCIDENT REPORTS',
    iconType: 'reports',
    roles: ['admin', 'staff'],
    notificationKey: 'incidentUnread',
    path: '/reports',
  },
];

/**
 * Dynamically derives the list of navigable paths in exact visual top-to-bottom order.
 */
export function getSidebarNavigationRoutes(): string[] {
  const routes: string[] = [];

  for (const item of SIDEBAR_NAV_STRUCTURE) {
    if (item.children && item.children.length > 0) {
      for (const child of item.children) {
        if (child.path) routes.push(child.path);
      }
    } else if (item.path) {
      routes.push(item.path);
    }
  }

  // Visual footer settings button at the bottom
  routes.push('/settings');

  return routes;
}

/**
 * Resolves a given pathname to its visual vertical order index (0 to N).
 */
export function getRouteVerticalIndex(pathname: string): number {
  const cleanPath = pathname.toLowerCase().replace(/\/$/, '') || '/';
  const routes = getSidebarNavigationRoutes();

  // 1. Exact match
  const exactIdx = routes.indexOf(cleanPath);
  if (exactIdx !== -1) return exactIdx;

  // 2. Settings subroutes & system account redirect
  if (cleanPath.startsWith('/settings') || cleanPath.startsWith('/system/account')) {
    return routes.indexOf('/settings');
  }

  // 3. Sub-route prefix matching (longest match first)
  const sortedRoutes = [...routes].sort((a, b) => b.length - a.length);
  for (const r of sortedRoutes) {
    if (cleanPath.startsWith(r)) {
      return routes.indexOf(r);
    }
  }

  return -1;
}
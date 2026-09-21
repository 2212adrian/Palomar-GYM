// src/stores/useSecurityStore.ts
import { create } from 'zustand';
import {
  type SecurityAccessConfig,
  type SecurityAccessCheckResult,
  DEFAULT_SECURITY_CONFIG,
  fetchSecurityAccessConfig,
  saveSecurityAccessConfig,
  evaluateTerminalSecurityAccess,
  subscribeToSecurityConfig,
} from '../lib/securityAccessService';

interface SecurityStoreState {
  config: SecurityAccessConfig;
  loading: boolean;
  isSaving: boolean;
  isChecking: boolean;
  lastCheckedAt: number | null;
  checkResult: SecurityAccessCheckResult | null;
  lastRole: string | null;
  lastEmail: string | null;

  fetchConfig: () => Promise<SecurityAccessConfig>;
  updateConfig: (newConfig: SecurityAccessConfig) => Promise<SecurityAccessConfig>;
  runVerification: (
    userRole?: string,
    userEmail?: string | null
  ) => Promise<SecurityAccessCheckResult>;
  subscribeRealtime: () => () => void;
}

let activeRealtimeUnsubscribe: (() => void) | null = null;

export const useSecurityStore = create<SecurityStoreState>((set, get) => ({
  config: DEFAULT_SECURITY_CONFIG,
  loading: true,
  isSaving: false,
  isChecking: false,
  lastCheckedAt: null,
  checkResult: null,
  lastRole: null,
  lastEmail: null,

  fetchConfig: async () => {
    set({ loading: true });
    try {
      const cfg = await fetchSecurityAccessConfig();
      set({ config: cfg, loading: false });

      if (!activeRealtimeUnsubscribe) {
        get().subscribeRealtime();
      }

      return cfg;
    } catch {
      set({ loading: false });
      return get().config;
    }
  },

  updateConfig: async (newConfig: SecurityAccessConfig) => {
    set({ isSaving: true });
    try {
      const saved = await saveSecurityAccessConfig(newConfig);
      set({ config: saved, isSaving: false });

      // Immediate local state update
      if (
        !saved.location_restriction_enabled &&
        !saved.wifi_restriction_enabled &&
        !saved.ip_restriction_enabled
      ) {
        set({
          checkResult: {
            allowed: true,
            locationPassed: true,
            wifiPassed: true,
            ipPassed: true,
            errors: [],
          },
          isChecking: false,
        });
      } else {
        const { lastRole, lastEmail } = get();
        get().runVerification(lastRole || 'anonymous', lastEmail);
      }

      return saved;
    } catch (err) {
      set({ isSaving: false });
      throw err;
    }
  },

  runVerification: async (userRole: string = 'anonymous', userEmail?: string | null) => {
    set({
      isChecking: true,
      lastRole: userRole,
      lastEmail: userEmail ?? null,
    });

    try {
      let cfg = get().config;
      if (get().loading) {
        cfg = await get().fetchConfig();
      }

      const res = await evaluateTerminalSecurityAccess(cfg, userRole);
      set({
        checkResult: res,
        isChecking: false,
        lastCheckedAt: Date.now(),
      });
      return res;
    } catch (err: any) {
      const fallbackResult: SecurityAccessCheckResult = {
        allowed: false,
        locationPassed: false,
        wifiPassed: false,
        ipPassed: false,
        errors: [err.message || 'Security verification failed.'],
      };
      set({
        checkResult: fallbackResult,
        isChecking: false,
        lastCheckedAt: Date.now(),
      });
      return fallbackResult;
    }
  },

  subscribeRealtime: () => {
    if (activeRealtimeUnsubscribe) {
      activeRealtimeUnsubscribe();
      activeRealtimeUnsubscribe = null;
    }

    activeRealtimeUnsubscribe = subscribeToSecurityConfig((updatedConfig) => {
      set({ config: updatedConfig });

      // INSTANT REAL-TIME MODAL DISMISSAL
      if (
        !updatedConfig.location_restriction_enabled &&
        !updatedConfig.wifi_restriction_enabled &&
        !updatedConfig.ip_restriction_enabled
      ) {
        set({
          checkResult: {
            allowed: true,
            locationPassed: true,
            wifiPassed: true,
            ipPassed: true,
            errors: [],
          },
          isChecking: false,
        });
        return;
      }

      const roleToVerify = get().lastRole || 'anonymous';
      get().runVerification(roleToVerify, get().lastEmail);
    });

    return () => {
      if (activeRealtimeUnsubscribe) {
        activeRealtimeUnsubscribe();
        activeRealtimeUnsubscribe = null;
      }
    };
  },
}));
// src/stores/useSecurityStore.ts
import { create } from 'zustand';
import { Network } from '@capacitor/network';
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
let networkListenerAttached = false;
let periodicCheckInterval: any = null;

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
      const allDisabled =
        !cfg.location_restriction_enabled &&
        !cfg.wifi_restriction_enabled &&
        !cfg.ip_restriction_enabled;

      if (allDisabled) {
        set({
          config: cfg,
          loading: false,
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
        set({ config: cfg, loading: false });
      }

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
      // Always fetch the latest security configuration state so "Re-check Connection"
      // detects immediately if security restrictions were disabled or modified.
      const cfg = await get().fetchConfig();

      const res = await evaluateTerminalSecurityAccess(cfg, userEmail);
      set({
        config: cfg,
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

    // Attach Network listeners to detect switching Wi-Fi immediately
    if (!networkListenerAttached && typeof window !== 'undefined') {
      networkListenerAttached = true;

      const triggerRecheckOnNetworkChange = () => {
        const currentCfg = get().config;
        const hasRestrictions =
          currentCfg.location_restriction_enabled ||
          currentCfg.wifi_restriction_enabled ||
          currentCfg.ip_restriction_enabled;

        if (hasRestrictions) {
          const roleToVerify = get().lastRole || 'anonymous';
          get().runVerification(roleToVerify, get().lastEmail);
        }
      };

      try {
        Network.addListener('networkStatusChange', () => {
          triggerRecheckOnNetworkChange();
        });
      } catch {}

      window.addEventListener('online', triggerRecheckOnNetworkChange);
      window.addEventListener('focus', triggerRecheckOnNetworkChange);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          triggerRecheckOnNetworkChange();
        }
      });

      // Periodic sanity check every 25 seconds if restrictions active
      if (!periodicCheckInterval) {
        periodicCheckInterval = setInterval(() => {
          const currentCfg = get().config;
          const hasRestrictions =
            currentCfg.location_restriction_enabled ||
            currentCfg.wifi_restriction_enabled ||
            currentCfg.ip_restriction_enabled;
          if (hasRestrictions && !get().isChecking) {
            const roleToVerify = get().lastRole || 'anonymous';
            get().runVerification(roleToVerify, get().lastEmail);
          }
        }, 25000);
      }
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
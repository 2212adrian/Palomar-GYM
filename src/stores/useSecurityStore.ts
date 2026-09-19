// src/stores/useSecurityStore.ts
import { create } from 'zustand';
import {
  type SecurityAccessConfig,
  type SecurityAccessCheckResult,
  DEFAULT_SECURITY_CONFIG,
  fetchSecurityAccessConfig,
  saveSecurityAccessConfig,
  evaluateTerminalSecurityAccess,
} from '../lib/securityAccessService';

interface SecurityStoreState {
  config: SecurityAccessConfig;
  loading: boolean;
  isSaving: boolean;
  isChecking: boolean;
  lastCheckedAt: number | null;
  checkResult: SecurityAccessCheckResult | null;
  temporaryOverride: boolean;

  fetchConfig: () => Promise<SecurityAccessConfig>;
  updateConfig: (newConfig: SecurityAccessConfig) => Promise<SecurityAccessConfig>;
  runVerification: (
    userRole: string,
    userEmail?: string | null
  ) => Promise<SecurityAccessCheckResult>;
  setTemporaryOverride: (val: boolean) => void;
}

export const useSecurityStore = create<SecurityStoreState>((set, get) => ({
  config: DEFAULT_SECURITY_CONFIG,
  loading: true,
  isSaving: false,
  isChecking: false,
  lastCheckedAt: null,
  checkResult: null,
  temporaryOverride: false,

  fetchConfig: async () => {
    set({ loading: true });
    try {
      const cfg = await fetchSecurityAccessConfig();
      set({ config: cfg, loading: false });
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
      return saved;
    } catch (err) {
      set({ isSaving: false });
      throw err;
    }
  },

  runVerification: async (userRole: string, userEmail?: string | null) => {
    set({ isChecking: true });
    try {
      let cfg = get().config;
      // If config was not yet loaded, load it
      if (get().loading) {
        cfg = await get().fetchConfig();
      }

      const res = await evaluateTerminalSecurityAccess(cfg, userRole, userEmail);
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

  setTemporaryOverride: (val: boolean) => set({ temporaryOverride: val }),
}));

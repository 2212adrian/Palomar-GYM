// src/lib/ratesService.ts
import { supabase } from './supabase/client';

export interface RatesConfig {
  id?: number;
  monthly_rate: number;
  yearly_rate: number;
  regular_walk_in: number;
  student_walk_in: number;
  yearly_walk_in: number;
  gcash_fee: number;
  new_card_fee: number;
  vat_enabled: boolean;
  vat_percentage: number;
  monthly_membership?: number;
  [key: string]: any;
}

export const DEFAULT_RATES_CONFIG: RatesConfig = {
  id: 1,
  monthly_rate: 800.0,
  yearly_rate: 8000.0,
  regular_walk_in: 100.0,
  student_walk_in: 80.0,
  yearly_walk_in: 70.0,
  gcash_fee: 10.0,
  new_card_fee: 150.0,
  vat_enabled: true,
  vat_percentage: 12.0,
  monthly_membership: 800.0,
};

const RATES_STORAGE_KEY = 'palomar_rates_config_secured_v1';
const RATES_SALT = 'PALOMAR_SECURED_SHA256_RATES_VAULT_@2026_#9981';

/**
 * Computes salted SHA-256 hash using the Web Crypto API
 */
async function computeSha256(content: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(content + RATES_SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stores rates_config in browser storage with salted SHA-256 signature and base64 payload.
 */
export async function saveSecuredRates(rates: RatesConfig): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const canonical = JSON.stringify(rates);
    const hash = await computeSha256(canonical);
    const encoded = btoa(encodeURIComponent(canonical));
    const record = {
      v: 1,
      data: encoded,
      hash,
      savedAt: Date.now(),
    };
    const serialized = JSON.stringify(record);
    localStorage.setItem(RATES_STORAGE_KEY, serialized);
    sessionStorage.setItem(RATES_STORAGE_KEY, serialized);
  } catch (err) {
    console.warn('Failed to save secured rates:', err);
  }
}

/**
 * Reads rates_config from browser storage and validates SHA-256 signature.
 * Throws security error if the data was modified/tampered with in storage.
 */
export async function getSecuredRates(): Promise<RatesConfig | null> {
  if (typeof window === 'undefined') return null;
  const raw =
    sessionStorage.getItem(RATES_STORAGE_KEY) ||
    localStorage.getItem(RATES_STORAGE_KEY);
  if (!raw) return null;

  try {
    const record = JSON.parse(raw);
    if (!record || !record.data || !record.hash) {
      throw new Error('Corrupted rates storage structure');
    }

    const decoded = decodeURIComponent(atob(record.data));
    const computedHash = await computeSha256(decoded);

    if (computedHash !== record.hash) {
      // Tampering detected: Purge storage and block all transactions
      localStorage.removeItem(RATES_STORAGE_KEY);
      sessionStorage.removeItem(RATES_STORAGE_KEY);
      throw new Error(
        'SECURITY ALERT: Pricing rates in local storage were tampered with. Transactions blocked.'
      );
    }

    return JSON.parse(decoded);
  } catch (err: any) {
    if (err.message?.includes('SECURITY ALERT')) {
      throw err;
    }
    console.error('Error verifying secured rates:', err);
    return null;
  }
}

let inMemoryRatesCache: { config: RatesConfig; timestamp: number } | null = null;
let inFlightRatesPromise: Promise<RatesConfig> | null = null;

/**
 * Fetches fresh rates from Supabase when online, or retrieves tamper-proof
 * secured rates from browser storage when offline.
 * Seeds initial secure defaults if storage was empty, ensuring offline readiness.
 */
export async function getEffectiveRates(): Promise<RatesConfig> {
  if (inMemoryRatesCache && Date.now() - inMemoryRatesCache.timestamp < 60000) {
    return inMemoryRatesCache.config;
  }

  if (inFlightRatesPromise) {
    return inFlightRatesPromise;
  }

  inFlightRatesPromise = (async () => {
    const isOnline = typeof navigator === 'undefined' || navigator.onLine;

    if (isOnline) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Rates query timeout')), 1500)
        );
        const queryPromise = supabase
          .from('rates_config')
          .select('*')
          .eq('id', 1)
          .maybeSingle();

        const { data, error } = (await Promise.race([
          queryPromise,
          timeoutPromise,
        ])) as any;

        if (!error && data) {
          const resolvedYearlyFee =
            data.yearly_walk_in ??
            data.yearly_walkin ??
            data.yearly_member_checkin_fee ??
            data.yearly_checkin_fee ??
            DEFAULT_RATES_CONFIG.yearly_walk_in;

          const fullConfig: RatesConfig = {
            ...DEFAULT_RATES_CONFIG,
            ...data,
            yearly_walk_in: Number(resolvedYearlyFee),
            monthly_membership: data.monthly_rate ?? DEFAULT_RATES_CONFIG.monthly_rate,
          };
          inMemoryRatesCache = { config: fullConfig, timestamp: Date.now() };
          await saveSecuredRates(fullConfig);
          return fullConfig;
        }
      } catch (err) {
        console.warn('Online rates fetch failed or timed out, trying secured storage:', err);
      }
    }

    // Verify secured rates in storage
    const cached = await getSecuredRates();
    if (cached) {
      inMemoryRatesCache = { config: cached, timestamp: Date.now() };
      return cached;
    }

    // If no record exists yet (e.g. initial offline launch), initialize secured storage with defaults
    try {
      await saveSecuredRates(DEFAULT_RATES_CONFIG);
      inMemoryRatesCache = { config: DEFAULT_RATES_CONFIG, timestamp: Date.now() };
      return DEFAULT_RATES_CONFIG;
    } catch (seedErr) {
      console.error('Failed to initialize secured rates in storage:', seedErr);
    }

    throw new Error('Rates configuration is not available in secured storage.');
  })().finally(() => {
    inFlightRatesPromise = null;
  });

  return inFlightRatesPromise;
}

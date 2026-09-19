// src/lib/securityAccessService.ts
import { supabase } from './supabase/client';
import { isSuperAdmin } from '../constants/auth';
import { Network } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';

export interface TrustedWifiNetwork {
  id: string;
  ssid: string;
  bssid?: string;
  subnet?: string;
  notes?: string;
  added_at: string;
  added_by?: string;
}

export interface SecurityAccessConfig {
  location_restriction_enabled: boolean;
  gym_latitude: number;
  gym_longitude: number;
  geofence_radius_meters: number;
  gym_address?: string;
  wifi_restriction_enabled: boolean;
  require_trusted_network: boolean;
  trusted_networks: TrustedWifiNetwork[];
  // Strategy 1: Public IP Whitelist
  ip_restriction_enabled: boolean;
  allowed_public_ips: string[];
}

export const DEFAULT_SECURITY_CONFIG: SecurityAccessConfig = {
  location_restriction_enabled: false,
  gym_latitude: 14.5995,
  gym_longitude: 120.9842,
  geofence_radius_meters: 150,
  gym_address: 'Palomar Gym Main Facility',
  wifi_restriction_enabled: false,
  require_trusted_network: false,
  trusted_networks: [],
  ip_restriction_enabled: false,
  allowed_public_ips: [],
};

/**
 * Fetches the client's current public IP address with multiple fallbacks
 */
export async function getClientPublicIP(): Promise<string> {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      if (data.ip) return data.ip.trim();
    }
  } catch {
    // fallback
  }

  try {
    const res2 = await fetch('https://api64.ipify.org?format=json', { cache: 'no-cache' });
    if (res2.ok) {
      const data2 = await res2.json();
      if (data2.ip) return data2.ip.trim();
    }
  } catch {
    // fallback
  }

  try {
    const res3 = await fetch('https://freeipapi.com/api/json', { cache: 'no-cache' });
    const data3 = await res3.json();
    if (data3.ipAddress) return data3.ipAddress.trim();
  } catch {
    // fail-safe
  }

  throw new Error('Unable to detect terminal public IP.');
}

/**
 * Calculates distance in meters between two GPS coordinates using Haversine
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export async function getCurrentDevicePosition(): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number;
}> {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation is not supported on this device.');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  });
}

export async function getDeviceNetworkStatus(): Promise<{
  connected: boolean;
  connectionType: string;
  isWifi: boolean;
  ssid?: string;
  rawDetails?: string;
}> {
  try {
    const capStatus = await Network.getStatus();
    const isCapWifi = capStatus.connectionType === 'wifi';
    const isCapConnected = capStatus.connected;

    const navConn =
      (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;

    const webType = navConn?.type || '';
    const isWebWifi = webType === 'wifi';
    const isWifi = isCapWifi || isWebWifi;
    const finalType = isCapWifi ? 'wifi' : capStatus.connectionType || webType || 'unknown';
    const activeSsid = localStorage.getItem('palomar_current_wifi_ssid') || undefined;

    return {
      connected: isCapConnected,
      connectionType: finalType,
      isWifi,
      ssid: activeSsid,
      rawDetails: `Capacitor: ${capStatus.connectionType}, Connected: ${capStatus.connected}${
        navConn ? `, WebType: ${navConn.type}` : ''
      }`,
    };
  } catch (err) {
    console.warn('Network status lookup error:', err);
    return {
      connected: navigator.onLine,
      connectionType: 'unknown',
      isWifi: true,
    };
  }
}

export async function fetchSecurityAccessConfig(): Promise<SecurityAccessConfig> {
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'get_security_access_config'
    );

    if (!rpcError && rpcData) {
      const parsed = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;
      return { ...DEFAULT_SECURITY_CONFIG, ...parsed };
    }

    const { data: rowData, error: tableError } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'security_access_control')
      .maybeSingle();

    if (!tableError && rowData?.value) {
      const parsed = JSON.parse(rowData.value);
      return { ...DEFAULT_SECURITY_CONFIG, ...parsed };
    }
  } catch (err) {
    console.warn('Error fetching security access config:', err);
  }

  return DEFAULT_SECURITY_CONFIG;
}

export async function saveSecurityAccessConfig(
  config: SecurityAccessConfig
): Promise<SecurityAccessConfig> {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'update_security_access_config',
    {
      p_config: config,
    }
  );

  if (!rpcError && rpcData) {
    const parsed = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;
    return { ...DEFAULT_SECURITY_CONFIG, ...parsed };
  }

  const { error: upsertError } = await supabase
    .from('system_config')
    .upsert({
      key: 'security_access_control',
      value: JSON.stringify(config),
      updated_at: new Date().toISOString(),
    });

  if (upsertError) {
    throw upsertError;
  }

  return config;
}

export interface SecurityAccessCheckResult {
  allowed: boolean;
  locationPassed: boolean;
  wifiPassed: boolean;
  ipPassed: boolean;
  currentIP?: string;
  distanceMeters?: number;
  currentLat?: number;
  currentLng?: number;
  accuracy?: number;
  networkType?: string;
  isWifi?: boolean;
  activeSsid?: string;
  errors: string[];
}

/**
 * Evaluates whether the current terminal meets the active security restrictions.
 */
export async function evaluateTerminalSecurityAccess(
  config: SecurityAccessConfig,
  userEmail?: string | null
): Promise<SecurityAccessCheckResult> {
  const result: SecurityAccessCheckResult = {
    allowed: true,
    locationPassed: true,
    wifiPassed: true,
    ipPassed: true,
    errors: [],
  };

  // If all restrictions are disabled, immediately allow
  if (
    !config.location_restriction_enabled &&
    !config.wifi_restriction_enabled &&
    !config.ip_restriction_enabled
  ) {
    return result;
  }

  // Superadmin bypass: Only bypasses if signed in as Superadmin
  if (userEmail && isSuperAdmin(userEmail)) {
    return result;
  }

  // 1. Gym Router Public IP Check (Strategy 1)
  if (config.ip_restriction_enabled) {
    try {
      const clientIP = await getClientPublicIP();
      result.currentIP = clientIP;

      if (config.allowed_public_ips.length > 0) {
        const isWhitelisted = config.allowed_public_ips.some((allowed) => {
          const cleanAllowed = allowed.trim().toLowerCase();
          const cleanClient = clientIP.toLowerCase();
          if (cleanAllowed.endsWith('*')) {
            return cleanClient.startsWith(cleanAllowed.replace('*', ''));
          }
          return cleanAllowed === cleanClient;
        });

        if (!isWhitelisted) {
          result.ipPassed = false;
          result.allowed = false;
          result.errors.push(
            `Terminal IP (${clientIP}) is not an authorized gym network. You must connect through the official gym router.`
          );
        }
      }
    } catch (err: any) {
      result.ipPassed = false;
      result.allowed = false;
      result.errors.push(
        'Unable to verify terminal network IP address. Please check your internet connection.'
      );
    }
  }

  // 2. Physical Wi-Fi Check
  if (config.wifi_restriction_enabled) {
    try {
      const net = await getDeviceNetworkStatus();
      result.networkType = net.connectionType;
      result.isWifi = net.isWifi;
      result.activeSsid = net.ssid;

      if (!net.isWifi && Capacitor.isNativePlatform()) {
        result.wifiPassed = false;
        result.allowed = false;
        result.errors.push(
          'Terminal is not connected to a physical Wi-Fi network. Cellular mobile data is restricted.'
        );
      }

      if (config.require_trusted_network && config.trusted_networks.length > 0) {
        if (net.ssid) {
          const matched = config.trusted_networks.some(
            (tn) => tn.ssid.trim().toLowerCase() === net.ssid?.trim().toLowerCase()
          );
          if (!matched) {
            result.wifiPassed = false;
            result.allowed = false;
            result.errors.push(
              `Connected Wi-Fi (${net.ssid}) is not in the facility's registered trusted network list.`
            );
          }
        }
      }
    } catch (err) {
      console.warn('Wi-Fi verification error:', err);
    }
  }

  // 3. Location Geofence Check
  if (config.location_restriction_enabled) {
    try {
      const pos = await getCurrentDevicePosition();
      result.currentLat = pos.latitude;
      result.currentLng = pos.longitude;
      result.accuracy = pos.accuracy;

      const dist = calculateDistanceMeters(
        pos.latitude,
        pos.longitude,
        config.gym_latitude,
        config.gym_longitude
      );
      result.distanceMeters = dist;

      if (dist > config.geofence_radius_meters) {
        result.locationPassed = false;
        result.allowed = false;
        result.errors.push(
          `Device is outside facility perimeter (${dist}m away; permitted: ${config.geofence_radius_meters}m).`
        );
      }
    } catch (err: any) {
      result.locationPassed = false;
      result.allowed = false;
      result.errors.push('Unable to verify GPS location.');
    }
  }

  return result;
}
export function subscribeToSecurityConfig(
  onUpdate: (config: SecurityAccessConfig) => void
): () => void {
  const channel = supabase
    .channel('realtime_security_access_config')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'system_config',
        filter: 'key=eq.security_access_control',
      },
      (payload) => {
        try {
          const raw = (payload.new as { value?: string | object })?.value;
          if (raw) {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            onUpdate({ ...DEFAULT_SECURITY_CONFIG, ...parsed });
          }
        } catch (err) {
          console.error('Error handling realtime security config update:', err);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
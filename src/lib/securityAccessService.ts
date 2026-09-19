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
  enforce_on_roles: ('staff' | 'admin')[];
  bypass_superadmin: boolean;
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
  enforce_on_roles: ['staff', 'admin'],
  bypass_superadmin: true,
};

/**
 * Calculates distance in meters between two GPS coordinates using the Haversine formula
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Radius of Earth in meters
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

/**
 * Retrieves the device's current GPS position via browser / device Geolocation
 */
export async function getCurrentDevicePosition(
  options: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 15000,
  }
): Promise<{ latitude: number; longitude: number; accuracy: number }> {
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
      (err) => {
        reject(err);
      },
      options
    );
  });
}

/**
 * Retrieves current network status using Capacitor Network API and Web navigator.connection
 */
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

    // Check Web NetworkInformation API if available (Chrome / Chromium on Android)
    const navConn =
      (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;

    let webType = navConn?.type || '';
    let isWebWifi = webType === 'wifi';

    // If Capacitor reports wifi or web reports wifi
    const isWifi = isCapWifi || isWebWifi;
    const finalType = isCapWifi ? 'wifi' : capStatus.connectionType || webType || 'unknown';

    // In web browsers, SSID is restricted for security. Check if saved or broadcasted
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
      isWifi: true, // Fail-open fallback if detection throws
    };
  }
}

/**
 * Fetches the system security configuration from Supabase (public.system_config)
 */
export async function fetchSecurityAccessConfig(): Promise<SecurityAccessConfig> {
  try {
    // 1. Try RPC endpoint first
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'get_security_access_config'
    );

    if (!rpcError && rpcData) {
      const parsed = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;
      return { ...DEFAULT_SECURITY_CONFIG, ...parsed };
    }

    // 2. Direct table fallback if RPC is not deployed yet
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

/**
 * Saves the system security configuration to Supabase (public.system_config)
 */
export async function saveSecurityAccessConfig(
  config: SecurityAccessConfig
): Promise<SecurityAccessConfig> {
  // 1. Try RPC endpoint first
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

  // 2. Direct table upsert fallback
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
 * Evaluates whether the current terminal and device meet the active security restrictions.
 */
export async function evaluateTerminalSecurityAccess(
  config: SecurityAccessConfig,
  userRole: string,
  userEmail?: string | null
): Promise<SecurityAccessCheckResult> {
  const result: SecurityAccessCheckResult = {
    allowed: true,
    locationPassed: true,
    wifiPassed: true,
    errors: [],
  };

  // Superadmin bypass check
  if (config.bypass_superadmin && isSuperAdmin(userEmail)) {
    return result;
  }

  // Check role enforcement
  const isEnforced = config.enforce_on_roles.includes(userRole as any);
  if (!isEnforced) {
    return result;
  }

  // 1. Location Geofence Check
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
          `Device is outside the facility perimeter (${dist}m away; maximum permitted is ${config.geofence_radius_meters}m).`
        );
      }
    } catch (err: any) {
      result.locationPassed = false;
      result.allowed = false;
      if (err.code === 1) {
        result.errors.push(
          'Location access was denied. Please allow device location permissions to access this terminal.'
        );
      } else {
        result.errors.push(
          'Unable to verify device GPS location. Please check your location settings.'
        );
      }
    }
  }

  // 2. Physical Wi-Fi Access Check
  if (config.wifi_restriction_enabled) {
    try {
      const net = await getDeviceNetworkStatus();
      result.networkType = net.connectionType;
      result.isWifi = net.isWifi;
      result.activeSsid = net.ssid;

      // In pure web browser environments outside native Capacitor,
      // browser sandboxes cannot inspect low-level network interface hardware.
      // If on native platform or if Wi-Fi type is detected:
      if (!net.isWifi && Capacitor.isNativePlatform()) {
        result.wifiPassed = false;
        result.allowed = false;
        result.errors.push(
          'Terminal is not connected to a physical Wi-Fi network. Cellular/mobile data connections are restricted.'
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

  return result;
}

// src/lib/permissions.ts
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface HardwarePermissionsStatus {
  camera: PermissionState;
  location: PermissionState;
  notification: PermissionState;
}

export interface DeviceCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/**
 * Check the current status of camera permission
 */
export async function getCameraPermissionStatus(): Promise<PermissionState> {
  if (typeof window === 'undefined' || !navigator?.mediaDevices) {
    return 'unsupported';
  }

  try {
    if (navigator.permissions && navigator.permissions.query) {
      const result = await navigator.permissions.query({
        name: 'camera' as any,
      });
      return result.state as PermissionState;
    }
  } catch {
    // navigator.permissions.query for camera may not be supported on all browsers
  }

  const stored = localStorage.getItem('palomar_camera_perm');
  if (stored === 'granted' || stored === 'denied')
    return stored as PermissionState;

  return 'prompt';
}

/**
 * Check the current status of notifications (Native & Web)
 */
export async function getNotificationPermissionStatus(): Promise<PermissionState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display === 'granted') return 'granted';
      if (status.display === 'denied') return 'denied';
      return 'prompt';
    } catch {
      return 'unsupported';
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

/**
 * Request camera permission explicitly from user
 */
export async function requestCameraPermission(): Promise<PermissionState> {
  if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
    return 'unsupported';
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    localStorage.setItem('palomar_camera_perm', 'granted');
    return 'granted';
  } catch (err: any) {
    console.warn('Camera permission request denied or error:', err);
    localStorage.setItem('palomar_camera_perm', 'denied');
    return 'denied';
  }
}

/**
 * Request notification permission explicitly (Native & Web)
 */
export async function requestNotificationPermission(): Promise<PermissionState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted'
        ? 'granted'
        : result.display === 'denied'
          ? 'denied'
          : 'prompt';
    } catch (err) {
      console.warn('Native notification request error:', err);
      return 'denied';
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted'
      ? 'granted'
      : permission === 'denied'
        ? 'denied'
        : 'prompt';
  } catch (err) {
    console.warn('Notification permission request error:', err);
    return 'denied';
  }
}

/**
 * Send a notification (Cross-platform)
 */
export async function sendNotification(title: string, body: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await LocalNotifications.schedule({
      notifications: [
        {
          title,
          body,
          id: Math.floor(Date.now() % 100000),
          schedule: { at: new Date(Date.now() + 200) },
        },
      ],
    });
    return;
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/favicon.ico',
    });
  }
}

/**
 * Check the current status of geolocation permission (Native & Web)
 */
export async function getLocationPermissionStatus(): Promise<PermissionState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await Geolocation.checkPermissions();
      if (status.location === 'granted') return 'granted';
      if (status.location === 'denied') return 'denied';
      return 'prompt';
    } catch {
      return 'unsupported';
    }
  }

  if (typeof window === 'undefined' || !navigator?.geolocation) {
    return 'unsupported';
  }

  try {
    if (navigator.permissions && navigator.permissions.query) {
      const result = await navigator.permissions.query({
        name: 'geolocation' as any,
      });
      return result.state as PermissionState;
    }
  } catch {
    // navigator.permissions.query may fail in some environments
  }

  const stored = localStorage.getItem('palomar_location_perm');
  if (stored === 'granted' || stored === 'denied') {
    return stored as PermissionState;
  }

  return 'prompt';
}

/**
 * Request geolocation permission explicitly (Native & Web)
 */
export async function requestLocationPermission(): Promise<PermissionState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await Geolocation.requestPermissions({
        permissions: ['location'],
      });
      return result.location === 'granted'
        ? 'granted'
        : result.location === 'denied'
          ? 'denied'
          : 'prompt';
    } catch (err) {
      console.warn('Native geolocation request error:', err);
      return 'denied';
    }
  }

  if (typeof window === 'undefined' || !navigator?.geolocation) {
    return 'unsupported';
  }

  try {
    await getCurrentCoordinates();
    localStorage.setItem('palomar_location_perm', 'granted');
    return 'granted';
  } catch (err: any) {
    if (err.code === 1 || err.message?.toLowerCase().includes('denied')) {
      localStorage.setItem('palomar_location_perm', 'denied');
      return 'denied';
    }
    return 'prompt';
  }
}

/**
 * Fallback IP-based location provider (used when device has no GPS satellites or is on Ethernet)
 */
async function getIPLocationFallback(): Promise<DeviceCoordinates> {
  try {
    const res = await fetch('https://ipapi.co/json/', { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      if (data.latitude && data.longitude) {
        return {
          latitude: Number(Number(data.latitude).toFixed(6)),
          longitude: Number(Number(data.longitude).toFixed(6)),
          accuracy: 2500, // Estimated accuracy in meters for IP lookup
        };
      }
    }
  } catch {
    // try backup IP service
  }

  const res2 = await fetch('https://freeipapi.com/api/json');
  const data2 = await res2.json();
  return {
    latitude: Number(Number(data2.latitude).toFixed(6)),
    longitude: Number(Number(data2.longitude).toFixed(6)),
    accuracy: 3500,
  };
}

/**
 * Browser watchPosition technique: Bypasses the Chromium getCurrentPosition deadlock
 */
function getBrowserPositionViaWatch(): Promise<DeviceCoordinates> {
  return new Promise((resolve, reject) => {
    let watchId: number | null = null;
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        reject(new Error('Timeout expired'));
      }
    }, 6000);

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
            resolve({
              latitude: Number(pos.coords.latitude.toFixed(6)),
              longitude: Number(pos.coords.longitude.toFixed(6)),
              accuracy: Math.round(pos.coords.accuracy || 0),
            });
          }
        },
        (err) => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
            reject(err);
          }
        },
        {
          enableHighAccuracy: false, // Prevents satellite lock deadlock
          timeout: 5500,
          maximumAge: 300000, // Allows cached coordinates from past 5 minutes
        }
      );
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

/**
 * Native Capacitor position lookup with watch fallback
 */
async function getNativePosition(): Promise<DeviceCoordinates> {
  try {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false, // Fast Wi-Fi / Cell tower triangulation
      timeout: 5000,
      maximumAge: 300000,
    });
    return {
      latitude: Number(pos.coords.latitude.toFixed(6)),
      longitude: Number(pos.coords.longitude.toFixed(6)),
      accuracy: Math.round(pos.coords.accuracy || 0),
    };
  } catch {
    // If one-shot fails, use native watchPosition for 5 seconds
    return new Promise((resolve, reject) => {
      let watchId: string | null = null;
      let finished = false;

      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          if (watchId) Geolocation.clearWatch({ id: watchId });
          reject(new Error('Timeout expired'));
        }
      }, 5000);

      Geolocation.watchPosition(
        { enableHighAccuracy: false, maximumAge: 300000 },
        (pos, err) => {
          if (!finished && pos) {
            finished = true;
            clearTimeout(timer);
            if (watchId) Geolocation.clearWatch({ id: watchId });
            resolve({
              latitude: Number(pos.coords.latitude.toFixed(6)),
              longitude: Number(pos.coords.longitude.toFixed(6)),
              accuracy: Math.round(pos.coords.accuracy || 0),
            });
          } else if (!finished && err) {
            finished = true;
            clearTimeout(timer);
            if (watchId) Geolocation.clearWatch({ id: watchId });
            reject(err);
          }
        }
      ).then((id) => {
        watchId = id;
      });
    });
  }
}

/**
 * Fetch GPS Coordinates (Guaranteed to resolve without timing out)
 */
export async function getCurrentCoordinates(): Promise<DeviceCoordinates> {
  // 1. Native Capacitor (Android / iOS)
  if (Capacitor.isNativePlatform()) {
    try {
      return await getNativePosition();
    } catch {
      console.warn('Native GPS timed out, using network IP fallback...');
      return await getIPLocationFallback();
    }
  }

  // 2. Web Browser
  if (typeof window === 'undefined' || !navigator?.geolocation) {
    return await getIPLocationFallback();
  }

  try {
    return await getBrowserPositionViaWatch();
  } catch (err: any) {
    // If the user explicitly denied permission, throw so UI shows "Denied"
    if (err.code === 1 || err.message?.toLowerCase().includes('denied')) {
      throw err;
    }
    // If it timed out due to no GPS / Ethernet desktop, use IP fallback
    console.warn('Browser GPS timed out, using network IP fallback...');
    return await getIPLocationFallback();
  }
}

/**
 * Initial permissions check for login
 */
export async function promptInitialPermissionsOnLogin(): Promise<HardwarePermissionsStatus> {
  const notifStatus = await getNotificationPermissionStatus();
  let updatedNotif = notifStatus;
  if (notifStatus === 'prompt') {
    updatedNotif = await requestNotificationPermission();
  }

  const camStatus = await getCameraPermissionStatus();
  const locStatus = await getLocationPermissionStatus();

  return {
    camera: camStatus,
    location: locStatus,
    notification: updatedNotif,
  };
}